# PR #107 Senior Engineering & Security Review Report

**Repository:** `Barabari-Tech-Collective/async-lms`  
**Pull Request:** [#107](https://github.com/Barabari-Tech-Collective/async-lms/pull/107) - *"feat(lms): exercise-based module gating, clean submission feedback, and HTML preview overhaul"*  
**Author:** Contributor / Engineering Team  
**Reviewer:** Antigravity AI Engineering (Senior Staff Review)  
**Date:** September 18, 2026  
**Status:** **CHANGES REQUESTED (Blocker Security Vulnerability Identified)**

---

## Executive Summary

PR #107 introduces several high-value pedagogical and user experience improvements across the student learning workflow:
1. **Module Completion Gating**: Students can no longer bypass subtopic lessons that contain coding exercises by simply clicking "Mark as Finished"; all associated coding exercises must be completed and passed first (`canMarkComplete` check on frontend and backend verification in `completeLesson`).
2. **HTML / DOM Live Preview Overhaul**: Full support for real-time live preview rendering for HTML/CSS/DOM exercises inside `EmbeddedIDE.tsx`, combining `index.html`, `style.css`, and `script.js` directly with an isolated `srcDoc` iframe sandbox.
3. **Clean Submission Feedback & High-Energy Celebration**: Improved rubric/unit-test breakdown display in the output tab, removal of confusing raw JSON dumps, and a dual-cannon celebratory confetti explosion (`fireCelebrationBoom`).
4. **Capstone Synchronization**: Automated synchronization of module capstone projects when publishing AI-generated curriculums (`publishCourse`).

### Overall Assessment
While the feature set and frontend execution are well-crafted and both syntax/type checks pass (`node -c` and `npm run build` succeeded without error), **this PR cannot be merged in its current state due to a Critical Path Traversal / Arbitrary File Write vulnerability** in `student.controller.js` and an architectural flaw causing **unreachable dead code in the DOM evaluator**.

---

## Scorecard & Quality Metrics

| Review Category | Status | Rating | Notes |
| :--- | :---: | :---: | :--- |
| **Security Audit** | 🔴 Failed | **CRITICAL** | Path Traversal / Arbitrary File Write in `submitExercise` (`fileName` & `taskId`). |
| **Iframe / Sandbox Security** | 🟢 Passed | Excellent | `sandbox='allow-scripts allow-modals allow-forms allow-popups'` correctly omits `allow-same-origin`. |
| **Architecture & Evaluation Flow** | 🟡 Needs Work | Moderate | `evaluateDomLocally` is completely unreachable dead code due to short-circuiting `isDomLike`. |
| **Zero Test & Debug Code** | 🟡 Needs Work | Low | Stray `console.log` in backend production code (`student.controller.js:1390`). |
| **Type Safety & Build Status** | 🟢 Passed | Excellent | `tsc -b` and `vite build` completed cleanly in 1m 12s with zero compiler errors. |
| **Production Readiness** | 🔴 Blocked | Hold | Must resolve security vulnerability and evaluation flow before merging. |

---

## Detailed Findings & Required Remediation

---

### Finding 1: [CRITICAL] Arbitrary File Write via Path Traversal in `submitExercise`

#### Affected Files & Lines:
- `backend/controllers/student.controller.js` (Lines 1285–1297 and Lines 1618–1630)

#### Vulnerability Details:
In both the `isDomLike` block and the practice exercise fallback block, user-supplied files from `req.body.files` and `req.body.taskId` are written directly to disk:

```javascript
// backend/controllers/student.controller.js:1285-1297 & 1618-1630
const projectId = taskId
  ? `exercise-${exerciseId}-task-${taskId}`
  : `exercise-${exerciseId}`;
const workspaceDir = path.join(WORKSPACE_ROOT, String(userId), projectId);
fs.mkdirSync(workspaceDir, { recursive: true });
for (const file of files) {
  const fileName = file.name || file.path;
  if (fileName && typeof file.content === 'string') {
    const filePath = path.join(workspaceDir, fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
}
```

Because `fileName` is taken directly from the client request payload without validation or sanitization:
1. An authenticated student can supply a filename such as `../../../../package.json`, `../../../../backend/server.js`, or `../../../../.env`.
2. `path.join(workspaceDir, fileName)` resolves out of `workspaceDir`.
3. `fs.writeFileSync(filePath, file.content, 'utf-8')` overwrites arbitrary files on the host filesystem where the Node process has write permissions.
4. Furthermore, `taskId` is unvalidated; if an attacker passes `taskId: "../../../malicious"`, `projectId` also escapes the intended workspace directory.

#### Impact:
- **Remote Code Execution (RCE)**: Overwriting application source files or node modules executes arbitrary code upon server reload.
- **Data Destruction**: Overwriting configuration files or system files can crash the production instance.

#### Remediation:
1. Validate `taskId` format (must match standard UUID regex or alphanumeric string).
2. Resolve canonical paths using `path.resolve` and verify that `filePath` is strictly contained within `workspaceDir`.
3. Disallow null bytes and traversal sequences.

```javascript
// Recommended Safe Implementation:
const safeTaskId = taskId && /^[a-zA-Z0-9_-]+$/.test(taskId) ? taskId : null;
const projectId = safeTaskId
  ? `exercise-${exerciseId}-task-${safeTaskId}`
  : `exercise-${exerciseId}`;

const resolvedWorkspace = path.resolve(WORKSPACE_ROOT, String(userId), projectId);
fs.mkdirSync(resolvedWorkspace, { recursive: true });

if (Array.isArray(files)) {
  for (const file of files) {
    const rawName = file.name || file.path;
    if (typeof rawName === 'string' && typeof file.content === 'string') {
      // Prevent traversal
      const normalizedPath = path.normalize(rawName).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.resolve(resolvedWorkspace, normalizedPath);

      // Enforce jail boundary
      if (!filePath.startsWith(resolvedWorkspace + path.sep) && filePath !== resolvedWorkspace) {
        throw new Error('Security Error: Path traversal attempt detected');
      }

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf-8');
    }
  }
}
```

---

### Finding 2: [HIGH] Dead Code & Short-Circuited DOM Evaluation Logic

#### Affected Files & Lines:
- `backend/controllers/student.controller.js` (Lines 1020–1092, 1280–1311, and 1390–1395)

#### Architectural Flaw:
PR #107 implements an elegant, semantic HTML5 structure validator in `evaluateDomLocally(files, exercise)` (checking `<!DOCTYPE html>`, `<html>`, `<head>`, `<title>`, `<body>`, and semantic tags, returning structured rubric feedback and scores).

However, at line 1280:
```javascript
const isDomLike =
  exercise.language === 'dom' ||
  exercise.language === 'html' ||
  (files && Array.isArray(files) && files.some((f) => (f.name || f.path || '').endsWith('.html') || (f.name || f.path || '').endsWith('.htm')));

if (isDomLike) {
  // Direct pass for HTML/DOM exercises without central evaluator overhead
  ...
  score = null;
  isExplicitPassed = true;
  testResults = { feedback: 'Successfully submitted.' };
} else {
  // ... central evaluator code ...
  if (!evalResponse) {
    if (exercise.language === 'dom' || evaluatorType === 'visual') {
      console.log(`[Exercise Submit] Central evaluator offline; evaluating HTML/DOM locally.`);
      const localEval = evaluateDomLocally(files, exercise); // <--- UNREACHABLE!
      score = localEval.score;
      testResults = localEval.testResults;
    }
  }
}
```

#### Why This Is a Problem:
1. `if (isDomLike)` intercepts **100%** of DOM, HTML, and web exercises.
2. The `else` branch is **never** entered for any DOM or visual exercise.
3. Therefore:
   - `evaluateDomLocally` is completely unreachable dead code (72 lines of unused logic).
   - Lines 1390–1395 are completely unreachable dead code.
   - Any student submitting empty files or random text to an HTML exercise instantly gets `is_passed: true` and completes the module without writing any HTML.
   - In `Lesson.tsx`, the rubric-based celebration (`🎉 Exercise passed with flying colors! Great work!`) is never reached because `rubric_breakdown` is never generated.
   - In `EmbeddedIDE.tsx`, the rubric breakdown table in the feedback tab is never rendered.

#### Remediation:
In the `isDomLike` block, invoke `evaluateDomLocally(files, exercise)` so that students actually receive the semantic rubric evaluation, score, and pass/fail determination:

```javascript
if (isDomLike) {
  // Persist workspace safely
  persistStudentFiles(resolvedWorkspace, files);

  // Evaluate DOM/HTML semantically
  const localEval = evaluateDomLocally(files, exercise);
  score = localEval.score;
  testResults = localEval.testResults;
  isExplicitPassed = score >= (exercise.max_score || 100) * 0.6;
}
```

---

### Finding 3: [MEDIUM] Violation of Zero Test/Debug Code Policy

#### Affected Files & Lines:
- `backend/controllers/student.controller.js` (Line 1390)

#### Code:
```javascript
console.log(`[Exercise Submit] Central evaluator offline; evaluating HTML/DOM locally.`);
```

#### Rule:
Antigravity coding standards strictly enforce a **Zero Test & Debug Code Policy**:
- No stray `console.log` statements in backend controllers.
- Operational events should be recorded via standard structured logging or `console.warn` / `console.error` only during actual exception handling.
- Remove line 1390.

---

### Finding 4: [MEDIUM] Inconsistent `is_completed` Metadata in `getExerciseContent`

#### Affected Files & Lines:
- `backend/controllers/subject.controller.js` (Lines 727–746 vs Lines 977–1025)
- `frontend/src/features/lesson/lessonSlice.ts` (Lines 264–271 vs Lines 287–291)

#### Issue:
In `getSubtopicContent`, PR #107 appropriately queries `exercise_submissions` to append `is_completed: true/false` to each exercise in the subtopic:
```javascript
const passedRes = await pool.query(
  `SELECT DISTINCT exercise_id FROM exercise_submissions 
   WHERE exercise_id = ANY($1::uuid[]) AND user_id = $2 AND is_passed = true`,
  [exerciseIds, userId],
);
```
However, in `getExerciseContent` (`subject.controller.js:977`), which is called when a student navigates directly to `/exercises/:exerciseId`, `is_completed` is **not** queried or returned.
Additionally, in `frontend/src/features/lesson/lessonSlice.ts`, `fetchExercise.fulfilled` does not populate `state.passedExercises`.

#### Impact:
If a student navigates directly to a standalone exercise route, the frontend has no record that the exercise was previously completed, showing uncompleted state until re-submitted.

#### Remediation:
1. In `getExerciseContent`, query `exercise_submissions` for `is_passed = true` when `req.user.id` is available and attach `is_completed: Boolean(isPassed)`.
2. In `lessonSlice.ts`, populate `state.passedExercises[ex.id] = true` on `fetchExercise.fulfilled`.

---

### Finding 5: [LOW] Memory Leak from Unrevoked Blob URLs in `EmbeddedIDE.tsx`

#### Affected Files & Lines:
- `frontend/src/components/common/EmbeddedIDE.tsx` (Lines 495–503)

#### Code:
```typescript
const blob = new Blob([combined], { type: 'text/html' });
const url = URL.createObjectURL(blob);
setPreviewUrl(url);
```

#### Issue:
When typing in `index.html` or `style.css`, `handleEditorChange` triggers `updatePreview` on keystrokes. Each call executes `URL.createObjectURL(blob)` without revoking the previous URL. While modern browsers garbage-collect blobs when the document unloads, extensive editing sessions can allocate hundreds of unrevoked object URLs.

#### Remediation:
Store `previewUrl` in a ref or revoke the old URL prior to setting a new one:
```typescript
setPreviewUrl((prevUrl) => {
  if (prevUrl) URL.revokeObjectURL(prevUrl);
  return url;
});
```

---

## Positive Highlights & Commendations

1. **Robust Iframe Isolation**:
   `EmbeddedIDE.tsx` sets `sandbox='allow-scripts allow-modals allow-forms allow-popups'` and explicitly **omits** `allow-same-origin`. This ensures student HTML/JS code cannot access parent session tokens, cookies, or localStorage.
2. **Pedagogical Gating UX**:
   The module completion button state (`Complete Exercise Below to Unlock` with lock icon) clearly guides students to finish exercises before advancing.
3. **Responsive IDE Layout**:
   The mobile tabs layout (`instructions`, `code`, `preview`, `output`) and responsive tabs overflow (`overflow-x-auto no-scrollbar`) greatly improve usability on smaller screens and tablets.
4. **Clean Build**:
   Frontend compiles with zero TypeScript errors or broken imports (`vite v7.3.1 built in 1m 12s`).

---

## Action Items for PR Approval

- [ ] **Action Item 1 (CRITICAL)**: Implement path traversal protection in `student.controller.js` for `fileName` and `taskId` in both `isDomLike` and practice fallback blocks.
- [ ] **Action Item 2 (HIGH)**: Wire `evaluateDomLocally` into the `isDomLike` execution path so HTML exercises are actively graded against semantic standards rather than blind auto-passed.
- [ ] **Action Item 3 (MEDIUM)**: Delete the stray `console.log` on line 1390 of `student.controller.js`.
- [ ] **Action Item 4 (MEDIUM)**: Include `is_completed` in `getExerciseContent` and update `fetchExercise.fulfilled` in `lessonSlice.ts`.
- [ ] **Action Item 5 (LOW)**: Revoke object URLs in `EmbeddedIDE.tsx` to prevent memory accumulation.

---
**Report generated by:** Antigravity AI Engineering  
**Review Status:** **CHANGES REQUESTED**
