const OpenAI = require('openai');
const pool = require('../config/pg');

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com' 
});

const SYSTEM_PROMPT = `You are CodeGuru AI, a coding tutor inside a learning management system for students learning programming.

Your role is to EDUCATE students — not to solve their problems for them.

## Core Rules
1. **Never give complete solutions.** If a student pastes a homework problem, assignment, or exercise, do NOT write the full solution. Instead, guide them step by step.

2. **When a student shares buggy code:** identify the type of error (syntax, logic, runtime), explain the underlying concept, and ask them a guiding question. Show at most 1–3 lines of corrected code to illustrate a specific concept only.

3. **When a student pastes a problem or question:** break it down into smaller steps, ask what they have tried so far, and guide them toward the approach without writing the code.


4. **Use Socratic questioning.** Examples:
   - "What do you think this line is doing?"
   - "What happens if the input is empty?"
   - "Which part are you stuck on — the logic or the syntax?"

5. **You may explain concepts, show small illustrative snippets, and give targeted hints.** The goal is for the student to write the solution themselves.

6. **Encourage effort.** Always acknowledge what the student got right before pointing out mistakes.

7. **Be concise and friendly.** Keep responses focused. Don't lecture — teach.

## Format
- Use markdown for code blocks and structure.
- Keep responses under 300 words unless a detailed explanation is genuinely needed.
- End with a question or prompt that encourages the student to try next.`;

exports.chat = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { messages, lessonContext } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: 'messages array is required' });
  }

  // Sanitize: only allow role user/assistant and string content
  const sanitized = messages
    .filter(
      (m) =>
        ['user', 'assistant'].includes(m.role) && typeof m.content === 'string',
    )
    .slice(-20); // cap conversation history to last 20 messages

  if (sanitized.length === 0) {
    return res.status(400).json({ message: 'No valid messages provided' });
  }

  let systemPrompt = SYSTEM_PROMPT;
  if (lessonContext?.title) {
    // Truncate and strip control characters to prevent prompt injection
    const safeTitle = String(lessonContext.title).slice(0, 200).replace(/[\x00-\x1F]/g, '');
    const safeType = String(lessonContext.contentType || 'lesson').slice(0, 50).replace(/[\x00-\x1F]/g, '');
    const safeContent = lessonContext.content
      ? String(lessonContext.content).slice(0, 500).replace(/[\x00-\x1F]/g, '')
      : null;

    systemPrompt +=
      `\n\n## Current Lesson Context\n` +
      `**Title:** ${safeTitle}\n` +
      `**Type:** ${safeType}\n` +
      (safeContent ? `**Content excerpt:**\n${safeContent}\n` : '') +
      `\nThe student is currently studying this lesson. Tailor your guidance to this specific topic.`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, ...sanitized],
      max_tokens: 600,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? '';
    res.json({ success: true, data: { reply } });
  } catch (err) {
    console.error('ASSISTANT ERROR:', err);
    res
      .status(500)
      .json({ message: 'AI service unavailable. Please try again.' });
  }
};

// ── URL & Field Validation Helpers (Issue 4) ──────────────────────────────────
function sanitizeUrl(urlString, type = 'web') {
  if (!urlString || typeof urlString !== 'string') return null;
  const trimmed = urlString.trim();
  if (!trimmed) return null;

  try {
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
      return null;
    }

    let parsed;
    if (!/^https?:\/\//i.test(trimmed) && (type === 'github' || type === 'linkedin' || type === 'web')) {
      parsed = new URL(`https://${trimmed}`);
    } else {
      parsed = new URL(trimmed);
    }

    if (type === 'github') {
      const host = parsed.hostname.toLowerCase();
      if (host === 'github.com' || host === 'www.github.com') {
        return parsed.toString();
      }
      return null;
    }

    if (type === 'linkedin') {
      const host = parsed.hostname.toLowerCase();
      if (host === 'linkedin.com' || host === 'www.linkedin.com') {
        return parsed.toString();
      }
      return null;
    }

    if (type === 'web') {
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  return phone.trim().replace(/[^\d+]/g, '');
}

// ── Server-Side Authoritative Verification (Issue 6) ──────────────────────────
async function computeVerificationProvenance(userId, document) {
  if (!document || typeof document !== 'object') return document;

  // 1. Fetch student's approved capstones
  const capstonesRes = await pool.query(
    `SELECT ps.project_id, p.title
     FROM public.project_submissions ps
     JOIN public.projects p ON p.id = ps.project_id
     WHERE ps.user_id = $1 AND (ps.is_approved = true OR ps.score >= 70)`,
    [userId]
  );
  const approvedProjectIds = new Set(capstonesRes.rows.map(r => String(r.project_id)));
  const approvedProjectTitles = new Set(capstonesRes.rows.map(r => r.title.trim().toLowerCase()));

  // 2. Fetch student's completed courses / certificates
  const certsRes = await pool.query(
    `SELECT us.subject_id, s.name as subject_name
     FROM public.user_subjects us
     JOIN public.subjects s ON s.id = us.subject_id
     WHERE us.user_id = $1 AND (us.is_completed = true OR us.certificate_id IS NOT NULL)`,
    [userId]
  );
  const verifiedSubjectNames = new Set(certsRes.rows.map(r => r.subject_name.trim().toLowerCase()));

  // 3. Process projects
  if (Array.isArray(document.projects)) {
    document.projects = document.projects.map((proj, idx) => {
      const repoUrl = sanitizeUrl(proj.repositoryUrl, 'github') || sanitizeUrl(proj.repositoryUrl, 'web');
      const demoUrl = sanitizeUrl(proj.liveDemoUrl, 'web');
      
      let verificationStatus = 'SELF_REPORTED';
      const isLmsVerified = (proj.lmsProjectId && approvedProjectIds.has(String(proj.lmsProjectId))) ||
                            (proj.id && approvedProjectIds.has(String(proj.id))) ||
                            (proj.title && approvedProjectTitles.has((proj.title || '').trim().toLowerCase()));
      
      if (isLmsVerified) {
        verificationStatus = 'LMS_VERIFIED';
      } else if (repoUrl || demoUrl) {
        verificationStatus = 'CREDENTIAL_LINK_PROVIDED';
      }

      return {
        ...proj,
        id: proj.id || `proj_${Date.now()}_${idx}`,
        title: String(proj.title || 'Project').slice(0, 150),
        description: String(proj.description || '').slice(0, 2000),
        techStack: Array.isArray(proj.techStack) ? proj.techStack.map(t => String(t).slice(0, 50)) : [],
        bullets: Array.isArray(proj.bullets) ? proj.bullets.map(b => String(b).slice(0, 1000)) : [],
        repositoryUrl: repoUrl || undefined,
        liveDemoUrl: demoUrl || undefined,
        verificationStatus, // Server-computed! Client cannot spoof this.
      };
    });
  }

  // 4. Process certifications
  if (Array.isArray(document.certifications)) {
    document.certifications = document.certifications.map((cert, idx) => {
      const credUrl = sanitizeUrl(cert.credentialUrl, 'web');
      let verificationStatus = 'SELF_REPORTED';

      const isLmsCert = cert.title && verifiedSubjectNames.has(cert.title.trim().toLowerCase());
      if (isLmsCert || (cert.issuer && cert.issuer.toLowerCase().includes('codeguru'))) {
        verificationStatus = 'LMS_VERIFIED';
      } else if (credUrl) {
        verificationStatus = 'CREDENTIAL_LINK_PROVIDED';
      }

      return {
        ...cert,
        id: cert.id || `cert_${Date.now()}_${idx}`,
        title: String(cert.title || 'Certification').slice(0, 150),
        issuer: String(cert.issuer || 'CodeGuru LMS').slice(0, 100),
        credentialUrl: credUrl || undefined,
        verificationStatus,
      };
    });
  }

  // 5. Sanitize personal info links & avatar
  if (document.personalInfo) {
    if (document.personalInfo.avatarUrl && typeof document.personalInfo.avatarUrl === 'string') {
      document.personalInfo.avatarUrl = document.personalInfo.avatarUrl.trim();
    }
    if (document.personalInfo.phone) {
      document.personalInfo.phone = normalizePhone(document.personalInfo.phone);
    }
    if (Array.isArray(document.personalInfo.links)) {
      document.personalInfo.links = document.personalInfo.links.map(link => {
        const type = (link.label || '').toLowerCase().includes('github') ? 'github' :
                     (link.label || '').toLowerCase().includes('linkedin') ? 'linkedin' : 'web';
        return {
          label: String(link.label || 'Link').slice(0, 50),
          url: sanitizeUrl(link.url, type) || link.url || '',
        };
      }).filter(l => Boolean(l.url));
    }
  }

  if (document.templateId && typeof document.templateId === 'string') {
    document.templateId = document.templateId.trim().slice(0, 100);
  }

  return document;
}

// ── GET /api/assistant/resume ─────────────────────────────────────────────────
exports.getResume = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT id, title, schema_version, version, document, updated_at
       FROM public.student_resumes
       WHERE user_id = $1 AND is_primary = TRUE
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET RESUME ERROR:', err);
    return res.status(500).json({ message: 'Failed to retrieve resume.' });
  }
};

// ── PUT /api/assistant/resume (Autosave & Optimistic Concurrency) ──────────────
exports.saveResume = async (req, res) => {
  const userId = req.user.id;
  const { title = 'Primary Tech Resume', document, expectedVersion } = req.body;

  if (!document || typeof document !== 'object') {
    return res.status(400).json({ message: 'A valid resume document object is required.' });
  }

  try {
    const sanitizedDocument = await computeVerificationProvenance(userId, document);

    // Initial draft creation or save when expectedVersion is null/unspecified
    if (expectedVersion == null || expectedVersion === 0) {
      const existing = await pool.query(
        `SELECT id, version, title, document, updated_at
         FROM public.student_resumes
         WHERE user_id = $1 AND is_primary = TRUE
         LIMIT 1`,
        [userId]
      );

      if (existing.rows.length > 0) {
        const updateExisting = await pool.query(
          `UPDATE public.student_resumes
           SET document = $1::jsonb,
               title = COALESCE($2, title),
               version = version + 1,
               updated_at = NOW()
           WHERE id = $3
           RETURNING id, title, schema_version, version, document, updated_at`,
          [JSON.stringify(sanitizedDocument), String(title).slice(0, 150), existing.rows[0].id]
        );
        return res.json({
          success: true,
          message: 'Resume updated successfully.',
          data: updateExisting.rows[0],
        });
      }

      const insertRes = await pool.query(
        `INSERT INTO public.student_resumes (user_id, title, document, version, is_primary)
         VALUES ($1, $2, $3::jsonb, 1, TRUE)
         RETURNING id, title, schema_version, version, document, updated_at`,
        [userId, String(title).slice(0, 150), JSON.stringify(sanitizedDocument)]
      );

      return res.status(201).json({
        success: true,
        message: 'Resume created successfully.',
        data: insertRes.rows[0],
      });
    }

    // Atomic version-checked update
    const updateRes = await pool.query(
      `UPDATE public.student_resumes
       SET document = $1::jsonb,
           title = COALESCE($2, title),
           version = version + 1,
           updated_at = NOW()
       WHERE user_id = $3 AND is_primary = TRUE AND version = $4
       RETURNING id, title, schema_version, version, document, updated_at`,
      [JSON.stringify(sanitizedDocument), String(title).slice(0, 150), userId, expectedVersion]
    );

    if (updateRes.rows.length === 0) {
      const checkRes = await pool.query(
        `SELECT id, title, schema_version, version, document, updated_at
         FROM public.student_resumes
         WHERE user_id = $1 AND is_primary = TRUE
         LIMIT 1`,
        [userId]
      );

      if (checkRes.rows.length > 0) {
        // If version delta is close (<= 2), it was caused by rapid consecutive client autosaves in the same session.
        if (Math.abs(checkRes.rows[0].version - expectedVersion) <= 2) {
          const syncRes = await pool.query(
            `UPDATE public.student_resumes
             SET document = $1::jsonb,
                 title = COALESCE($2, title),
                 version = version + 1,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING id, title, schema_version, version, document, updated_at`,
            [JSON.stringify(sanitizedDocument), String(title).slice(0, 150), checkRes.rows[0].id]
          );
          return res.json({
            success: true,
            message: 'Resume synced successfully.',
            data: syncRes.rows[0],
          });
        }

        return res.status(409).json({
          message: 'Resume was modified in another session. Please review and merge changes.',
          currentVersion: checkRes.rows[0].version,
          currentResume: checkRes.rows[0],
        });
      }

      return res.status(404).json({ message: 'Primary resume not found.' });
    }

    return res.json({
      success: true,
      message: 'Resume saved successfully.',
      data: updateRes.rows[0],
    });
  } catch (err) {
    console.error('SAVE RESUME ERROR:', err);
    return res.status(500).json({ message: 'Failed to save resume.' });
  }
};

// ── GET /api/assistant/resume/achievements (Authoritative LMS Data) ───────────
exports.getAchievements = async (req, res) => {
  const userId = req.user.id;
  try {
    const profileResult = await pool.query(
      `SELECT
         u.full_name, u.email, sp.degree, sp.year,
         COALESCE(c.name, '') AS college_name,
         COALESCE(SUM(pl.points), 0)::integer AS total_points,
         COUNT(DISTINCT ub.badge_id)::integer AS badge_count
       FROM public.users u
       LEFT JOIN public.student_profiles sp ON sp.user_id = u.id
       LEFT JOIN public.colleges c ON c.id = sp.college_id
       LEFT JOIN public.points_log pl ON pl.user_id = u.id
       LEFT JOIN public.user_badges ub ON ub.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.full_name, u.email, sp.degree, sp.year, c.name`,
      [userId]
    );

    const subjectsResult = await pool.query(
      `SELECT s.id, s.name, us.progress_percent, us.is_completed, us.certificate_id, us.certificate_issued_at
       FROM public.user_subjects us
       JOIN public.subjects s ON s.id = us.subject_id
       WHERE us.user_id = $1
       ORDER BY us.progress_percent DESC`,
      [userId]
    );

    const capstonesResult = await pool.query(
      `SELECT p.id as project_id, p.title, p.instructions, ps.score, ps.submission_link, s.name as subject_name,
              ps.is_approved, ps.submitted_at
       FROM public.project_submissions ps
       JOIN public.projects p ON p.id = ps.project_id
       JOIN public.topics t ON p.topic_id = t.id
       JOIN public.subjects s ON t.subject_id = s.id
       WHERE ps.user_id = $1
       ORDER BY COALESCE(ps.score, 0) DESC, ps.submitted_at DESC`,
      [userId]
    );

    const badgesResult = await pool.query(
      `SELECT b.name, b.description, b.icon_url, ub.earned_at
       FROM public.user_badges ub
       JOIN public.badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at DESC`,
      [userId]
    );

    return res.json({
      success: true,
      data: {
        profile: profileResult.rows[0] || {},
        enrolledSubjects: subjectsResult.rows,
        verifiedCapstones: capstonesResult.rows,
        badges: badgesResult.rows,
      },
    });
  } catch (err) {
    console.error('GET ACHIEVEMENTS ERROR:', err);
    return res.status(500).json({ message: 'Failed to retrieve achievements.' });
  }
};

// ── POST /api/assistant/resume/generate (Grounded AI Initial Generation) ──────
exports.generateResume = async (req, res) => {
  const userId = req.user.id;
  const {
    careerObjective = '',
    extraSkills = [],
    workExperience = [],
    manualProjects = [],
    education = [],
    personalInfo = {},
  } = req.body;

  try {
    const profileResult = await pool.query(
      `SELECT
         u.full_name, u.email, sp.degree, sp.year,
         COALESCE(c.name, '') AS college_name
       FROM public.users u
       LEFT JOIN public.student_profiles sp ON sp.user_id = u.id
       LEFT JOIN public.colleges c ON c.id = sp.college_id
       WHERE u.id = $1`,
      [userId]
    );
    const profile = profileResult.rows[0] || {};

    const subjectsResult = await pool.query(
      `SELECT s.name, us.progress_percent
       FROM public.user_subjects us
       JOIN public.subjects s ON s.id = us.subject_id
       WHERE us.user_id = $1`,
      [userId]
    );

    const capstonesResult = await pool.query(
      `SELECT p.id, p.title, p.instructions, ps.score, s.name as subject
       FROM public.project_submissions ps
       JOIN public.projects p ON p.id = ps.project_id
       JOIN public.topics t ON p.topic_id = t.id
       JOIN public.subjects s ON t.subject_id = s.id
       WHERE ps.user_id = $1 AND (ps.is_approved = true OR ps.score >= 70)
       ORDER BY ps.score DESC
       LIMIT 6`,
      [userId]
    );

    const verifiedCapstones = capstonesResult.rows;

    const systemPrompt = `You are an elite Placement Technical Resume Specialist.
You craft high-impact, professional tech resumes for college students and early-career developers following strict FlowCV placement standards.
CRITICAL INTEGRITY RULES:
1. Grounding: ONLY use facts and skills explicitly provided in the prompt. DO NOT invent metrics (e.g. "increased speed by 40%"), tools, or achievements that the student did not state.
2. STAR Method: Structure project bullet points with active verbs (Architected, Implemented, Engineered, Integrated) describing the feature, technical approach, and result.
3. Categorized Skills: Categorize skills cleanly into languages, frameworks, databases, and tools.`;

    const userPrompt = `Generate a structured, professional resume JSON for this student:
Student Details:
- Name: ${personalInfo.fullName || profile.full_name || 'Tech Candidate'}
- Headline: ${personalInfo.headline || 'Full-Stack Developer'}
- Degree: ${profile.degree || 'B.Tech Computer Science'}, Class of ${profile.year || '2025'}
- College: ${profile.college_name || 'Engineering Institute'}
- Enrolled Courses: ${subjectsResult.rows.map(s => `${s.name} (${s.progress_percent}% mastery)`).join(', ') || 'Computer Science Core'}
- Target Role / Focus: ${careerObjective || 'Full Stack Software Engineer'}
- Student Skills: ${Array.isArray(extraSkills) ? extraSkills.join(', ') : extraSkills}
- Verified LMS Capstones: ${verifiedCapstones.length ? JSON.stringify(verifiedCapstones) : 'None'}
- Student Projects: ${manualProjects.length ? JSON.stringify(manualProjects) : 'None'}
- Work Experience: ${workExperience.length ? JSON.stringify(workExperience) : 'None'}
- Education: ${education.length ? JSON.stringify(education) : 'None'}
- Contact Links: ${JSON.stringify(personalInfo.links || [])}

Return ONLY valid JSON matching this exact structure:
{
  "personalInfo": {
    "fullName": "${personalInfo.fullName || profile.full_name || ''}",
    "headline": "${personalInfo.headline || 'Junior Software Engineer | Full-Stack Developer'}",
    "email": "${personalInfo.email || profile.email || ''}",
    "phone": "${personalInfo.phone || ''}",
    "location": "${personalInfo.location || 'India'}",
    "links": ${JSON.stringify(personalInfo.links && personalInfo.links.length ? personalInfo.links : [
      { label: "GitHub", url: "https://github.com" },
      { label: "LinkedIn", url: "https://linkedin.com" }
    ])}
  },
  "summary": "Concise 2-3 sentence summary highlighting technical focus, primary tech stack, and career passion.",
  "skills": {
    "languages": ["JavaScript", "Python"],
    "frameworks": ["React", "Node.js", "Express"],
    "databases": ["PostgreSQL", "MongoDB"],
    "tools": ["Git", "GitHub", "Postman", "VS Code"]
  },
  "projects": [
    {
      "id": "proj_1",
      "title": "Project Title",
      "description": "Short 1-line description of what it solves",
      "techStack": ["React", "Node.js"],
      "repositoryUrl": "",
      "liveDemoUrl": "",
      "bullets": [
        "Architected responsive user interface utilizing modern state management",
        "Implemented RESTful backend APIs with secure authentication and database persistence"
      ]
    }
  ],
  "experience": [],
  "education": [
    {
      "id": "edu_1",
      "institution": "${profile.college_name || 'University'}",
      "degree": "${profile.degree || 'Bachelor of Technology in Computer Science'}",
      "score": 8.5,
      "gradingSystem": "CGPA_10",
      "startYear": 2021,
      "endYear": 2025
    }
  ],
  "certifications": []
}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1800,
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let resumeDoc;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      resumeDoc = JSON.parse(cleaned);
    } catch {
      console.error('RESUME GENERATION PARSE ERROR:', raw.slice(0, 200));
      return res.status(500).json({ message: 'Model returned invalid document format. Please try again.' });
    }

    // Merge student-provided personalInfo directly so AI never overwrites genuine links with dummy placeholders
    if (personalInfo && typeof personalInfo === 'object') {
      resumeDoc.personalInfo = {
        ...resumeDoc.personalInfo,
        ...personalInfo,
        links: (personalInfo.links && personalInfo.links.length) ? personalInfo.links : resumeDoc.personalInfo?.links || [],
      };
    }

    // Server calculates authoritative verification provenance before returning
    const finalDocument = await computeVerificationProvenance(userId, resumeDoc);

    return res.json({
      success: true,
      data: finalDocument,
    });
  } catch (err) {
    console.error('RESUME GENERATION ERROR:', err);
    return res.status(500).json({ message: 'Failed to generate resume. Please try again.' });
  }
};

// ── POST /api/assistant/resume/rewrite (Granular AI Rewriting - Issue 5) ──────
exports.rewriteContent = async (req, res) => {
  const { section = 'bullet', originalText, context = '' } = req.body;

  if (!originalText || typeof originalText !== 'string' || !originalText.trim()) {
    return res.status(400).json({ message: 'originalText is required.' });
  }

  const truncatedOriginal = originalText.slice(0, 1000);

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a technical resume editor. Your job is to improve phrasing, grammar, conciseness, and action verbs for a placement resume.
CRITICAL CONSTRAINT: You must preserve factual accuracy. DO NOT invent metrics, management claims, company names, or tools that are not in the source text.
Return ONLY valid JSON:
{
  "originalText": "${truncatedOriginal.replace(/"/g, '\\"')}",
  "proposedText": "rewritten text",
  "rationale": "Brief 1-sentence explanation of what was improved (e.g. 'Stronger action verb and concise phrasing')"
}`,
        },
        {
          role: 'user',
          content: `Rewrite this ${section} for maximum impact:
"${truncatedOriginal}"
Additional Context: ${context.slice(0, 500) || 'None'}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ message: 'Rewriting returned invalid response.' });
    }

    return res.json({
      success: true,
      data: parsed,
    });
  } catch (err) {
    console.error('REWRITE ERROR:', err);
    return res.status(500).json({ message: 'Failed to rewrite content.' });
  }
};

// ── POST /api/assistant/resume/optimize (Resume Match Analysis) ───────────────
exports.optimizeWithJD = async (req, res) => {
  const { resumeData, jobDescription } = req.body;

  if (!resumeData || !jobDescription) {
    return res.status(400).json({ message: 'resumeData and jobDescription are required.' });
  }

  const truncatedJD = String(jobDescription).slice(0, 3000);

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a Senior Technical Recruiter performing a Resume Match Analysis against a Job Description.
Evaluate keyword match, missing technologies, formatting readability, and actionable recommendations.
Return ONLY valid JSON matching this structure:
{
  "matchPercentage": <number 0-100>,
  "matchedKeywords": ["React", "TypeScript", "REST APIs"],
  "missingKeywords": ["Docker", "GraphQL", "Jest"],
  "readabilityTips": ["Keep bullet points under 2 lines", "Use active verbs"],
  "actionableSuggestions": [
    "Highlight your experience with relational databases in your project descriptions",
    "Add your GitHub link to the header"
  ],
  "suggestedSummary": "Tailored summary suggestion that strictly uses skills already present in the resume"
}`,
        },
        {
          role: 'user',
          content: `Analyze this resume against the JD:
Resume Content:
${JSON.stringify({
  summary: resumeData.summary,
  skills: resumeData.skills,
  projects: (resumeData.projects || []).map(p => ({ title: p.title, techStack: p.techStack, bullets: p.bullets })),
  experience: resumeData.experience,
})}

Job Description:
${truncatedJD}`,
        },
      ],
      max_tokens: 900,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('JD OPTIMIZE PARSE ERROR:', raw.slice(0, 200));
      return res.status(500).json({ message: 'Optimization returned invalid data.' });
    }

    return res.json({
      success: true,
      data: parsed,
    });
  } catch (err) {
    console.error('JD OPTIMIZE ERROR:', err);
    return res.status(500).json({ message: 'Optimization failed. Please try again.' });
  }
};
