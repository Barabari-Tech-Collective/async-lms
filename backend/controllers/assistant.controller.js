const jwt = require('jsonwebtoken');
const OpenAI = require('openai');
const pool = require('../config/pg');
const { filterLmsDataForTrack } = require('../utils/resumeDomainMatcher');

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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

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
      if (isLmsCert || (cert.issuer && (cert.issuer.toLowerCase().includes('barabari') || cert.issuer.toLowerCase().includes('codeguru')))) {
        verificationStatus = 'LMS_VERIFIED';
      } else if (credUrl) {
        verificationStatus = 'CREDENTIAL_LINK_PROVIDED';
      }

      return {
        ...cert,
        id: cert.id || `cert_${Date.now()}_${idx}`,
        title: String(cert.title || 'Certification').slice(0, 150),
        issuer: String(cert.issuer || 'Barabari').slice(0, 100),
        credentialUrl: credUrl || undefined,
        verificationStatus,
      };
    });
  }

  // 4b. Process work experience
  if (Array.isArray(document.experience)) {
    document.experience = document.experience.map((exp, idx) => ({
      ...exp,
      id: exp.id || `exp_${Date.now()}_${idx}`,
      role: String(exp.role || '').slice(0, 150),
      organization: String(exp.organization || exp.company || '').slice(0, 150),
      company: exp.company ? String(exp.company).slice(0, 150) : undefined,
      employmentType: exp.employmentType ? String(exp.employmentType).slice(0, 50) : undefined,
      location: exp.location ? String(exp.location).slice(0, 100) : undefined,
      startDate: String(exp.startDate || '').slice(0, 50),
      endDate: exp.current ? 'Present' : String(exp.endDate || '').slice(0, 50),
      current: Boolean(exp.current),
      bullets: Array.isArray(exp.bullets) ? exp.bullets.map(b => String(b).slice(0, 1000)).filter(Boolean) : [],
    }));
  }

  // 4c. Process and sanitize education (Degree, Intermediate, Schooling, etc.)
  if (Array.isArray(document.education)) {
    document.education = document.education.map((edu, idx) => ({
      ...edu,
      id: edu.id || `edu_${Date.now()}_${idx}`,
      institution: String(edu.institution || '').slice(0, 200),
      degree: String(edu.degree || '').slice(0, 200),
      score: edu.score !== undefined && edu.score !== null ? String(edu.score).slice(0, 30) : undefined,
      gradingSystem: ['CGPA_10', 'GPA_4', 'PERCENTAGE'].includes(edu.gradingSystem) ? edu.gradingSystem : 'CGPA_10',
      startYear: edu.startYear ? String(edu.startYear).slice(0, 10) : undefined,
      endYear: edu.endYear ? String(edu.endYear).slice(0, 10) : undefined,
      level: edu.level ? String(edu.level).slice(0, 50) : undefined,
    })).filter(edu => edu.institution || edu.degree);
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

  // 6. Process optional events & workshops
  if (Array.isArray(document.events)) {
    document.events = document.events.map((evt, idx) => {
      const credUrl = sanitizeUrl(evt.credentialUrl, 'web');
      return {
        ...evt,
        id: evt.id || `evt_${Date.now()}_${idx}`,
        title: String(evt.title || 'Event / Workshop').slice(0, 150),
        eventType: evt.eventType ? String(evt.eventType).slice(0, 50) : undefined,
        organizer: evt.organizer ? String(evt.organizer).slice(0, 120) : undefined,
        date: evt.date ? String(evt.date).slice(0, 50) : undefined,
        location: evt.location ? String(evt.location).slice(0, 80) : undefined,
        learnings: String(evt.learnings || '').slice(0, 2000),
        credentialUrl: credUrl || undefined,
      };
    });
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

// ── DELETE /api/assistant/resume (Legacy Primary Delete) ─────────────────────
exports.deleteResume = async (req, res) => {
  const userId = req.user.id;
  try {
    await pool.query(
      `DELETE FROM public.student_resumes WHERE user_id = $1`,
      [userId]
    );
    return res.json({ success: true, message: 'Resume deleted successfully.' });
  } catch (err) {
    console.error('DELETE RESUME ERROR:', err);
    return res.status(500).json({ message: 'Failed to delete resume.' });
  }
};

// ── GET /api/assistant/resumes (List All Resumes for Student) ─────────────────
exports.getAllResumes = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT id, title, schema_version, version, is_primary,
              document->>'templateId' as template_id,
              document->>'category' as category,
              document->>'targetRole' as target_role,
              created_at, updated_at
       FROM public.student_resumes
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY is_primary DESC, updated_at DESC`,
      [userId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET ALL RESUMES ERROR:', err);
    return res.status(500).json({ message: 'Failed to retrieve resumes.' });
  }
};

// ── GET /api/assistant/resume/:id (Get Specific Resume) ───────────────────────
// -- GET /api/assistant/public/resume/:id (Public Resume View for Recruiters) --
exports.getPublicResumeById = async (req, res) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(404).json({ success: false, message: 'Resume not found or has been made private.' });
  }

  // Optional author identity extraction: allows the student to preview their own private draft
  let requestingUserId = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      requestingUserId = decoded.id;
    } catch {}
  }

  try {
    const result = await pool.query(
      `SELECT sr.id, sr.user_id, sr.title, sr.schema_version, sr.version, sr.document, sr.updated_at,
              u.full_name as author_name
       FROM public.student_resumes sr
       LEFT JOIN public.users u ON u.id = sr.user_id
       WHERE sr.id = $1 AND sr.deleted_at IS NULL
       LIMIT 1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Resume not found or has been made private.' });
    }

    const row = result.rows[0];
    const isPublic = Boolean(row.document && (row.document.is_public === true || row.document.is_public === 'true'));
    const isAuthor = requestingUserId && String(requestingUserId) === String(row.user_id);

    // If private and requester is not the authenticated owner, reject access
    if (!isPublic && !isAuthor) {
      return res.status(404).json({ success: false, message: 'Resume not found or has been made private.' });
    }

    return res.json({
      success: true,
      data: {
        ...row,
        is_author_preview: !isPublic && isAuthor,
      },
    });
  } catch (err) {
    console.error('GET PUBLIC RESUME ERROR:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve public resume.' });
  }
};

exports.getResumeById = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(404).json({ message: 'Resume not found.' });
  }
  try {
    const result = await pool.query(
      `SELECT id, title, schema_version, version, document, is_primary, created_at, updated_at
       FROM public.student_resumes
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Resume not found.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET RESUME BY ID ERROR:', err);
    return res.status(500).json({ message: 'Failed to retrieve resume.' });
  }
};

// ── POST /api/assistant/resume/new (Create New Named Resume) ─────────────────
exports.createResume = async (req, res) => {
  const userId = req.user.id;
  const { title, document, is_primary = false } = req.body;

  if (!document || typeof document !== 'object') {
    return res.status(400).json({ message: 'A valid resume document object is required.' });
  }

  const defaultCategory = document?.category || 'general';
  const fallbackTitle = defaultCategory === 'general' ? 'General Job Resume' : `${defaultCategory.charAt(0).toUpperCase() + defaultCategory.slice(1)} Resume`;
  const sanitizedTitle = String(title || fallbackTitle).trim().slice(0, 150);

  try {
    const sanitizedDocument = await computeVerificationProvenance(userId, document);

    // Check if student currently has any active resumes
    const countRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM public.student_resumes WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const isFirstResume = countRes.rows[0].count === 0;
    const shouldBePrimary = isFirstResume || Boolean(is_primary);

    if (shouldBePrimary) {
      await pool.query(
        `UPDATE public.student_resumes SET is_primary = FALSE WHERE user_id = $1`,
        [userId]
      );
    }

    const insertRes = await pool.query(
      `INSERT INTO public.student_resumes (user_id, title, document, version, is_primary)
       VALUES ($1, $2, $3::jsonb, 1, $4)
       RETURNING id, title, schema_version, version, document, is_primary, created_at, updated_at`,
      [userId, sanitizedTitle, JSON.stringify(sanitizedDocument), shouldBePrimary]
    );

    return res.status(201).json({
      success: true,
      message: 'Resume created successfully.',
      data: insertRes.rows[0],
    });
  } catch (err) {
    console.error('CREATE RESUME ERROR:', err);
    return res.status(500).json({ message: 'Failed to create resume.' });
  }
};

// ── PUT /api/assistant/resume/:id (Update Specific Resume) ───────────────────
exports.updateResumeById = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid resume ID format.' });
  }
  const { title, document, expectedVersion } = req.body;

  if (!document || typeof document !== 'object') {
    return res.status(400).json({ message: 'A valid resume document object is required.' });
  }

  try {
    const sanitizedDocument = await computeVerificationProvenance(userId, document);

    if (expectedVersion == null) {
      const updateRes = await pool.query(
        `UPDATE public.student_resumes
         SET document = $1::jsonb,
             title = COALESCE($2, title),
             version = version + 1,
             updated_at = NOW()
         WHERE id = $3 AND user_id = $4
         RETURNING id, title, schema_version, version, document, is_primary, created_at, updated_at`,
        [JSON.stringify(sanitizedDocument), title ? String(title).slice(0, 150) : null, id, userId]
      );
      if (updateRes.rows.length === 0) {
        return res.status(404).json({ message: 'Resume not found.' });
      }
      return res.json({
        success: true,
        message: 'Resume updated successfully.',
        data: updateRes.rows[0],
      });
    }

    // Optimistic concurrency version check
    const updateRes = await pool.query(
      `UPDATE public.student_resumes
       SET document = $1::jsonb,
           title = COALESCE($2, title),
           version = version + 1,
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4 AND version = $5
       RETURNING id, title, schema_version, version, document, is_primary, created_at, updated_at`,
      [JSON.stringify(sanitizedDocument), title ? String(title).slice(0, 150) : null, id, userId, expectedVersion]
    );

    if (updateRes.rows.length === 0) {
      const checkRes = await pool.query(
        `SELECT id, title, schema_version, version, document, is_primary, updated_at
         FROM public.student_resumes
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [id, userId]
      );

      if (checkRes.rows.length > 0) {
        if (Math.abs(checkRes.rows[0].version - expectedVersion) <= 2) {
          const syncRes = await pool.query(
            `UPDATE public.student_resumes
             SET document = $1::jsonb,
                 title = COALESCE($2, title),
                 version = version + 1,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING id, title, schema_version, version, document, is_primary, created_at, updated_at`,
            [JSON.stringify(sanitizedDocument), title ? String(title).slice(0, 150) : null, id]
          );
          return res.json({
            success: true,
            message: 'Resume synced successfully.',
            data: syncRes.rows[0],
          });
        }

        return res.status(409).json({
          message: 'Resume was modified in another session.',
          currentVersion: checkRes.rows[0].version,
          currentResume: checkRes.rows[0],
        });
      }

      return res.status(404).json({ message: 'Resume not found.' });
    }

    return res.json({
      success: true,
      message: 'Resume saved successfully.',
      data: updateRes.rows[0],
    });
  } catch (err) {
    console.error('UPDATE RESUME BY ID ERROR:', err);
    return res.status(500).json({ message: 'Failed to update resume.' });
  }
};

// ── PATCH /api/assistant/resume/:id/rename (Rename Title) ─────────────────────
exports.renameResume = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid resume ID format.' });
  }
  const { title } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ message: 'A non-empty title string is required.' });
  }

  const sanitizedTitle = title.trim().slice(0, 150);

  try {
    const updateRes = await pool.query(
      `UPDATE public.student_resumes
       SET title = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, title, version, is_primary, updated_at`,
      [sanitizedTitle, id, userId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ message: 'Resume not found.' });
    }

    return res.json({
      success: true,
      message: 'Resume renamed successfully.',
      data: updateRes.rows[0],
    });
  } catch (err) {
    console.error('RENAME RESUME ERROR:', err);
    return res.status(500).json({ message: 'Failed to rename resume.' });
  }
};

// ── POST /api/assistant/resume/:id/duplicate (Duplicate/Clone Resume) ─────────
exports.duplicateResume = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid resume ID format.' });
  }
  const { title } = req.body || {};

  try {
    const originalRes = await pool.query(
      `SELECT title, document FROM public.student_resumes WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (originalRes.rows.length === 0) {
      return res.status(404).json({ message: 'Original resume not found.' });
    }

    const original = originalRes.rows[0];
    const cloneTitle = title && String(title).trim()
      ? String(title).trim().slice(0, 150)
      : `${original.title} (Copy)`.slice(0, 150);

    const insertRes = await pool.query(
      `INSERT INTO public.student_resumes (user_id, title, document, version, is_primary)
       VALUES ($1, $2, $3::jsonb, 1, FALSE)
       RETURNING id, title, schema_version, version, document, is_primary, created_at, updated_at`,
      [userId, cloneTitle, JSON.stringify(original.document)]
    );

    return res.status(201).json({
      success: true,
      message: 'Resume duplicated successfully.',
      data: insertRes.rows[0],
    });
  } catch (err) {
    console.error('DUPLICATE RESUME ERROR:', err);
    return res.status(500).json({ message: 'Failed to duplicate resume.' });
  }
};

// ── PATCH /api/assistant/resume/:id/primary (Set As Primary) ──────────────────
exports.setPrimaryResume = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid resume ID format.' });
  }

  try {
    const checkRes = await pool.query(
      `SELECT id, title FROM public.student_resumes WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ message: 'Resume not found.' });
    }

    await pool.query(
      `UPDATE public.student_resumes SET is_primary = FALSE WHERE user_id = $1`,
      [userId]
    );

    const updateRes = await pool.query(
      `UPDATE public.student_resumes
       SET is_primary = TRUE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, title, is_primary, updated_at`,
      [id, userId]
    );

    return res.json({
      success: true,
      message: `"${checkRes.rows[0].title}" set as primary resume.`,
      data: updateRes.rows[0],
    });
  } catch (err) {
    console.error('SET PRIMARY RESUME ERROR:', err);
    return res.status(500).json({ message: 'Failed to set primary resume.' });
  }
};

// ── DELETE /api/assistant/resume/:id (Soft-Delete Specific Resume to Recycle Bin) ──
exports.deleteResumeById = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid resume ID format.' });
  }

  try {
    const targetRes = await pool.query(
      `SELECT id, title, is_primary FROM public.student_resumes WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId]
    );
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ message: 'Resume not found.' });
    }

    const wasPrimary = targetRes.rows[0].is_primary;

    // Soft delete: set deleted_at = NOW() and remove is_primary
    await pool.query(
      `UPDATE public.student_resumes
       SET deleted_at = NOW(), is_primary = FALSE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    // If deleted resume was primary, promote most recently updated remaining active resume
    if (wasPrimary) {
      await pool.query(
        `UPDATE public.student_resumes
         SET is_primary = TRUE
         WHERE id = (
           SELECT id FROM public.student_resumes
           WHERE user_id = $1 AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT 1
         )`,
        [userId]
      );
    }

    return res.json({
      success: true,
      message: `"${targetRes.rows[0].title}" moved to Recycle Bin.`,
      data: { id, title: targetRes.rows[0].title },
    });
  } catch (err) {
    console.error('DELETE RESUME BY ID ERROR:', err);
    return res.status(500).json({ message: 'Failed to delete resume.' });
  }
};

// ── GET /api/assistant/resumes/bin (List Soft-Deleted Resumes for Student) ────
exports.getRecycleBinResumes = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT id, title, schema_version, version, is_primary,
              document->>'templateId' as template_id,
              document->>'category' as category,
              document->>'targetRole' as target_role,
              deleted_at, created_at, updated_at
       FROM public.student_resumes
       WHERE user_id = $1 AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC`,
      [userId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET RECYCLE BIN RESUMES ERROR:', err);
    return res.status(500).json({ message: 'Failed to load recycle bin.' });
  }
};

// ── PATCH /api/assistant/resume/:id/restore (Restore Soft-Deleted Resume) ─────
exports.restoreResumeById = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid resume ID format.' });
  }

  try {
    const checkRes = await pool.query(
      `SELECT id, title FROM public.student_resumes WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL`,
      [id, userId]
    );
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ message: 'Resume not found in recycle bin.' });
    }

    // Check if user currently has any active resumes
    const activeCountRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM public.student_resumes WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const shouldBePrimary = activeCountRes.rows[0].count === 0;

    const restoreRes = await pool.query(
      `UPDATE public.student_resumes
       SET deleted_at = NULL,
           is_primary = $3,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, title, schema_version, version, is_primary, created_at, updated_at`,
      [id, userId, shouldBePrimary]
    );

    return res.json({
      success: true,
      message: `"${checkRes.rows[0].title}" restored successfully.`,
      data: restoreRes.rows[0],
    });
  } catch (err) {
    console.error('RESTORE RESUME ERROR:', err);
    return res.status(500).json({ message: 'Failed to restore resume.' });
  }
};

// ── DELETE /api/assistant/resume/:id/destroy (Permanently Delete from Recycle Bin) ──
exports.destroyResumeById = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid resume ID format.' });
  }

  try {
    const targetRes = await pool.query(
      `SELECT id, title FROM public.student_resumes WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL`,
      [id, userId]
    );
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ message: 'Resume not found in recycle bin.' });
    }

    await pool.query(
      `DELETE FROM public.student_resumes WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL`,
      [id, userId]
    );

    return res.json({
      success: true,
      message: `"${targetRes.rows[0].title}" permanently destroyed.`,
    });
  } catch (err) {
    console.error('DESTROY RESUME ERROR:', err);
    return res.status(500).json({ message: 'Failed to permanently destroy resume.' });
  }
};

// ── DELETE /api/assistant/resumes/bin/empty (Empty Recycle Bin for Student) ──
exports.emptyRecycleBin = async (req, res) => {
  const userId = req.user.id;

  try {
    const deleteRes = await pool.query(
      `DELETE FROM public.student_resumes WHERE user_id = $1 AND deleted_at IS NOT NULL`,
      [userId]
    );

    return res.json({
      success: true,
      message: `Recycle bin emptied (${deleteRes.rowCount} resumes purged).`,
    });
  } catch (err) {
    console.error('EMPTY RECYCLE BIN ERROR:', err);
    return res.status(500).json({ message: 'Failed to empty recycle bin.' });
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

// ── GET /api/assistant/resume/course-capstones (LMS Course Capstones with Track/Role Matching) ──
exports.getCourseCapstones = async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. Get user enrolled subjects and submissions
    const userEnrolled = await pool.query(
      `SELECT s.id, s.name, s.slug, us.progress_percent, us.is_completed
       FROM public.user_subjects us
       JOIN public.subjects s ON s.id = us.subject_id
       WHERE us.user_id = $1`,
      [userId]
    );
    const enrolledSubjectNames = new Set(userEnrolled.rows.map((r) => r.name.toLowerCase()));

    const submissionsResult = await pool.query(
      `SELECT p.id as project_id, p.title, p.instructions, ps.score, ps.submission_link, s.name as subject_name,
              ps.is_approved, ps.submitted_at
       FROM public.project_submissions ps
       JOIN public.projects p ON p.id = ps.project_id
       JOIN public.topics t ON p.topic_id = t.id
       JOIN public.subjects s ON t.subject_id = s.id
       WHERE ps.user_id = $1`,
      [userId]
    );
    const submissionsMap = new Map();
    submissionsResult.rows.forEach((s) => {
      submissionsMap.set(String(s.project_id), s);
      submissionsMap.set(s.title.toLowerCase().trim(), s);
    });

    // 2. Query any existing database projects
    let dbProjects = [];
    try {
      const dbProjRes = await pool.query(
        `SELECT p.id, p.title, p.instructions, p.evaluator_type,
                s.name as course_name, s.slug as subject_slug
         FROM public.projects p
         JOIN public.topics t ON p.topic_id = t.id
         JOIN public.subjects s ON t.subject_id = s.id
         WHERE (p.is_deleted = false OR p.is_deleted IS NULL)
         ORDER BY s.order_index ASC, p.id ASC`
      );
      dbProjects = dbProjRes.rows || [];
    } catch (err) {
      console.error('Error querying db projects:', err);
    }

    // 3. Helper to determine track and tech stack from CodeGuru course name
    const getTrackAndStack = (courseName = '', title = '') => {
      const c = courseName.toLowerCase();
      const t = title.toLowerCase();

      if (c.includes('excel') || c.includes('data') || t.includes('excel')) {
        return {
          track: 'data',
          techStack: ['Advanced Excel', 'Pivot Tables', 'Data Cleaning', 'VLOOKUP / XLOOKUP', 'KPI Dashboards'],
        };
      }
      if (c.includes('java') || t.includes('java')) {
        return {
          track: 'tech',
          techStack: ['Java', 'OOP', 'Data Structures', 'Collections Framework', 'JDBC'],
        };
      }
      if (c.includes('frontend')) {
        return {
          track: 'tech',
          techStack: ['React', 'TypeScript', 'Tailwind CSS', 'Component Architecture', 'Vite'],
        };
      }
      if (c.includes('full stack') || c.includes('fullstack')) {
        return {
          track: 'tech',
          techStack: ['React', 'Node.js', 'Express', 'PostgreSQL', 'REST APIs', 'Git'],
        };
      }
      // General web dev
      return {
        track: 'tech',
        techStack: ['HTML5', 'CSS3', 'JavaScript', 'Responsive UI', 'DOM Manipulation'],
      };
    };

    // 4. CodeGuru Real DB Projects (Primary Source)
    const allCapstones = [];
    const addedTitles = new Set();

    for (const dbP of dbProjects) {
      const titleLower = dbP.title.trim().toLowerCase();
      if (!addedTitles.has(titleLower)) {
        addedTitles.add(titleLower);
        const { track, techStack } = getTrackAndStack(dbP.course_name, dbP.title);

        const cleanDesc = dbP.instructions
          ? String(dbP.instructions).replace(/<[^>]*>?/gm, '').slice(0, 220)
          : `Official verified capstone project for CodeGuru's ${dbP.course_name} curriculum.`;

        allCapstones.push({
          id: `db_proj_${dbP.id}`,
          title: dbP.title,
          course_name: dbP.course_name,
          track,
          techStack,
          description: cleanDesc,
          bullets: [
            `Engineered complete solution for ${dbP.title} adhering to CodeGuru evaluation guidelines.`,
            `Implemented core functionality utilizing ${techStack.slice(0, 3).join(', ')} with clean, modular code.`,
            `Validated end-to-end user workflows and test cases to ensure robust error handling and performance.`,
          ],
          githubUrl: '',
          liveDemoUrl: '',
          isDbProject: true,
        });
      }
    }

    // 5. CodeGuru Standard Capstone Catalog (Exclusively for CodeGuru LMS Courses)
    const codeguruStandardCapstones = [
      {
        id: 'capstone_fs_ecommerce',
        title: 'Full-Stack E-Commerce & Inventory Management Platform',
        course_name: 'Full Stack Web Development',
        track: 'tech',
        techStack: ['React', 'Node.js', 'Express', 'PostgreSQL', 'Stripe', 'Git'],
        description: 'Engineered an end-to-end full-stack e-commerce web application featuring dynamic catalog filtering, secure user authentication with JWT, Stripe checkout integration, and inventory management.',
        bullets: [
          'Engineered full-stack responsive web platform using React and Node.js with secure JWT auth and Stripe checkout integration.',
          'Built optimized PostgreSQL queries with indexing, reducing search latency by 40% across 10,000+ SKU records.',
          'Developed modular RESTful API endpoints with structured request validation and error handling.',
        ],
        githubUrl: 'https://github.com/barabari-tech/ecommerce-capstone',
        liveDemoUrl: 'https://ecommerce.codeguru.app',
      },
      {
        id: 'capstone_digital_clock_dom',
        title: 'Digital Clock & Interactive DOM Application',
        course_name: 'Full Stack Web Development',
        track: 'tech',
        techStack: ['JavaScript', 'HTML5', 'CSS3', 'DOM APIs', 'Event Loop'],
        description: 'Built a real-time responsive digital clock and timezone converter utilizing vanilla JavaScript, CSS animations, and precise interval-driven DOM synchronization.',
        bullets: [
          'Implemented real-time digital clock engine utilizing JavaScript Date APIs and requestAnimationFrame for smooth UI rendering.',
          'Designed responsive glassmorphism interface with dark/light mode toggle and custom sound alarms.',
          'Optimized DOM update cycles to eliminate layout reflows and minimize memory consumption.',
        ],
        githubUrl: 'https://github.com/barabari-tech/digital-clock-project',
        liveDemoUrl: 'https://clock.codeguru.app',
      },
      {
        id: 'capstone_frontend_spa',
        title: 'Modern Single-Page Application & Component System',
        course_name: 'Frontend Development',
        track: 'tech',
        techStack: ['React', 'TypeScript', 'Tailwind CSS', 'Zustand', 'Vite'],
        description: 'Architected a modular single-page dashboard featuring reusable component design systems, client-side routing, and global state management.',
        bullets: [
          'Designed 20+ reusable React UI components with TypeScript type safety and accessible ARIA attributes.',
          'Integrated Zustand for centralized state management, eliminating prop drilling across nested component trees.',
          'Configured Vite build optimizations and code splitting, achieving 98+ Google Lighthouse performance score.',
        ],
        githubUrl: 'https://github.com/barabari-tech/frontend-component-system',
        liveDemoUrl: 'https://frontend-showcase.codeguru.app',
      },
      {
        id: 'capstone_web_responsive',
        title: 'Responsive Multi-Page Web Platform & Portfolio Engine',
        course_name: 'Web Development',
        track: 'tech',
        techStack: ['HTML5', 'CSS3', 'JavaScript', 'Flexbox & CSS Grid', 'Mobile-First'],
        description: 'Developed an accessible, mobile-first responsive web portal with custom CSS layout grids, interactive navigation drawers, and cross-browser compatibility.',
        bullets: [
          'Constructed semantic HTML5 layout with mobile-first CSS Flexbox and Grid layouts ensuring 100% responsiveness.',
          'Implemented smooth scroll animations and dynamic modal overlays using vanilla JavaScript event listeners.',
          'Tested and validated cross-browser rendering fidelity across Chrome, Firefox, Safari, and Edge.',
        ],
        githubUrl: 'https://github.com/barabari-tech/responsive-web-capstone',
        liveDemoUrl: 'https://web-showcase.codeguru.app',
      },
      {
        id: 'capstone_java_oop',
        title: 'Core Java Enterprise Banking & Account Management System',
        course_name: 'Java Programing',
        track: 'tech',
        techStack: ['Java', 'OOP Principles', 'Collections Framework', 'Exception Handling', 'File I/O'],
        description: 'Implemented a robust Java console and transaction processing system applying core Object-Oriented Programming (encapsulation, inheritance, polymorphism, abstraction) and thread-safe operations.',
        bullets: [
          'Designed modular domain architecture leveraging OOP design patterns and custom exception hierarchies.',
          'Utilized Java Collections Framework (ArrayList, HashMap) to manage in-memory user ledgers with O(1) account lookups.',
          'Implemented persistent file I/O serialization to guarantee transactional data durability across application sessions.',
        ],
        githubUrl: 'https://github.com/barabari-tech/java-banking-capstone',
        liveDemoUrl: 'https://github.com/barabari-tech/java-banking-capstone',
      },
      {
        id: 'capstone_excel_analytics',
        title: 'Business Sales Analytics & Executive KPI Dashboard',
        course_name: 'Excel For Data Analysis',
        track: 'data',
        techStack: ['Advanced Excel', 'Pivot Tables & Slicers', 'Power Query', 'XLOOKUP / VLOOKUP', 'Data Visualization'],
        description: 'Built a dynamic commercial sales and operations dashboard in Microsoft Excel, processing multi-year transaction tables, automated data cleaning pipelines, and interactive executive reporting.',
        bullets: [
          'Engineered automated ETL workflows using Excel Power Query to ingest, clean, and merge 50,000+ transactional records.',
          'Constructed dynamic KPI summary cards and cross-filtering Pivot Tables using advanced formulas (XLOOKUP, SUMIFS, INDEX/MATCH).',
          'Designed executive presentation dashboard with interactive timeline slicers and trend charts for operational insights.',
        ],
        githubUrl: '',
        liveDemoUrl: 'https://docs.google.com/spreadsheets/d/codeguru-excel-dashboard',
      },
    ];

    // Append standard CodeGuru capstones only if not already present from DB
    for (const std of codeguruStandardCapstones) {
      if (!addedTitles.has(std.title.trim().toLowerCase())) {
        addedTitles.add(std.title.trim().toLowerCase());
        allCapstones.push(std);
      }
    }

    // 6. Enrich with student's genuine enrollment and submission statuses
    const enriched = allCapstones.map((cap) => {
      const match =
        submissionsMap.get(String(cap.id)) ||
        submissionsMap.get(cap.title.toLowerCase().trim()) ||
        submissionsMap.get(String(cap.id).replace('db_proj_', ''));

      const isEnrolled =
        enrolledSubjectNames.has(cap.course_name.toLowerCase()) ||
        enrolledSubjectNames.has(String(cap.track).toLowerCase());

      return {
        ...cap,
        isEnrolled,
        isSubmitted: Boolean(match),
        score: match?.score !== null && match?.score !== undefined ? Number(match.score) : null,
        userSubmissionLink: match?.submission_link || null,
        isApproved: match?.is_approved || false,
      };
    });

    return res.json({
      success: true,
      data: enriched,
    });
  } catch (err) {
    console.error('Error fetching course capstones:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch course capstones.' });
  }
};

// ── POST /api/assistant/resume/generate (Grounded AI Initial Generation) ──────
exports.generateResume = async (req, res) => {
  const userId = req.user.id;
  const {
    category = 'general',
    targetRole = '',
    careerObjective = '',
    extraSkills = [],
    workExperience = [],
    events = [],
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

    // Filter LMS enrolled courses & capstone projects strictly for this career track
    const { relevantSubjects, relevantCapstones, hasRelevantCourses } = filterLmsDataForTrack(
      subjectsResult.rows,
      capstonesResult.rows,
      category
    );

    // Define Category-Specific Prompts & Configurations with Strict Anti-Hallucination Grounding
    const categoryConfigs = {
      general: {
        roleLabel: 'Campus Fresher & Multi-Disciplinary Professional',
        templateId: 'first-job-fresh',
        systemPrompt: `You are an expert Career Advisor & Placement Resume Specialist for entry-level, campus graduate, and general roles.
You create simple, clean, crisp resumes emphasizing versatile strengths, communication, work ethic, and core academic achievements.
CRITICAL ANTI-HALLUCINATION RULES:
1. Grounding: ONLY use facts and skills explicitly provided in the prompt. DO NOT invent skills, certifications, metrics, or company claims.
2. STAR Method: Structure bullet points with clear active verbs (Organized, Coordinated, Delivered, Resolved, Facilitated) highlighting initiative and reliability.
3. Categorized Skills: ONLY include skills explicitly provided or derived from verified courses. If none provided, return an EMPTY ARRAY []. Never insert made-up tools or languages.`,
        skillCategoryLabels: {
          languages: 'Core Strengths & Abilities',
          frameworks: 'Communication & Interpersonal',
          databases: 'Office & Productivity Tools',
          tools: 'Key Professional Competencies',
        },
      },
      tech: {
        roleLabel: 'Software Engineer | Full-Stack Developer',
        templateId: 'modern-mercury',
        systemPrompt: `You are an elite Placement Technical Resume Specialist.
You craft high-impact, professional tech resumes for college students and developers following strict placement standards.
CRITICAL ANTI-HALLUCINATION RULES:
1. Grounding: ONLY use programming languages, frameworks, and developer tools explicitly provided in the prompt or derived from verified courses. NEVER invent technologies (e.g. AWS, Docker, Kubernetes) if not listed.
2. STAR Method: Structure project bullet points with active verbs (Architected, Implemented, Engineered, Integrated) describing feature, technical approach, and result. DO NOT invent false metrics.
3. Categorized Skills: Categorize skills cleanly into programming languages, frameworks, databases, and developer tools. If no skills exist in the input, return an EMPTY ARRAY [].`,
        skillCategoryLabels: {
          languages: 'Programming Languages',
          frameworks: 'Frameworks & Libraries',
          databases: 'Databases & Storage',
          tools: 'Developer Tools & Cloud',
        },
      },
      data: {
        roleLabel: 'Data Analyst | Business Intelligence',
        templateId: 'atlantic-sidebar',
        systemPrompt: `You are a Lead Data Science & Analytics Hiring Specialist.
You craft high-impact resumes for Data Analysts, BI Developers, and Data Scientists.
CRITICAL ANTI-HALLUCINATION RULES:
1. Grounding: ONLY use facts and data tools provided in the prompt. NEVER invent tools (e.g. Power BI, Tableau, Snowflake) unless explicitly studied or stated.
2. Data Storytelling: Emphasize SQL query design, ETL data pipelines, dashboards, and analytical reasoning based strictly on real work.
3. Categorized Skills: Group into query/scripting languages, BI & visualization, data warehouses, and analytics/statistical tools. If none exist in the input, return an EMPTY ARRAY [].`,
        skillCategoryLabels: {
          languages: 'Query & Scripting Languages',
          frameworks: 'BI & Data Visualization Tools',
          databases: 'Data Warehousing & Databases',
          tools: 'Analytics, Modeling & Statistics',
        },
      },
      design: {
        roleLabel: 'UI/UX Designer | Product Designer',
        templateId: 'creative-cobalt',
        systemPrompt: `You are a Principal Product Design & UI/UX Recruiter.
You craft compelling design resumes emphasizing human-centered design, user research, wireframing, design systems, and prototyping.
CRITICAL ANTI-HALLUCINATION RULES:
1. Grounding: ONLY use facts provided. NEVER invent design tools (e.g. Figma, Adobe XD) or client design projects unless explicitly provided.
2. Design Focus: Emphasize problem definition, user journey mapping, and prototyping based strictly on provided student data.
3. Categorized Skills: Group into design disciplines, design systems & prototyping, user research & usability, and design software. If none exist, return an EMPTY ARRAY [].`,
        skillCategoryLabels: {
          languages: 'Design Disciplines & UX Methodologies',
          frameworks: 'Design Systems & Prototyping',
          databases: 'User Research & Usability Testing',
          tools: 'Design Software & Tooling',
        },
      },
      sales_marketing: {
        roleLabel: 'Business Development Executive | Sales Specialist',
        templateId: 'classic-corporate',
        systemPrompt: `You are a Commercial Sales & Growth Marketing Recruitment Director.
You craft high-conversion resumes for B2B Sales, Business Development, and Digital Marketing professionals.
CRITICAL ANTI-HALLUCINATION RULES:
1. Grounding: ONLY use facts provided. NEVER invent CRM tools (e.g. Salesforce, HubSpot), sales quotas, or languages (English, Hindi, Telugu) unless explicitly provided in the prompt.
2. Commercial Clarity: Structure provided experience and achievements with active verbs. DO NOT fabricate false revenue or quota numbers.
3. Categorized Skills: Group into sales competencies, growth & inbound marketing, CRM platforms, and productivity suites. If none exist, return an EMPTY ARRAY [].`,
        skillCategoryLabels: {
          languages: 'Core Sales & Deal Competencies',
          frameworks: 'Growth & Inbound Marketing',
          databases: 'CRM Platforms & Outreach Tools',
          tools: 'Analytics & Productivity Suites',
        },
      },
      product_operations: {
        roleLabel: 'Associate Product Manager | Operations Analyst',
        templateId: 'executive-serif',
        systemPrompt: `You are a Senior Product & Operations Hiring Manager.
You craft impactful resumes for Associate Product Managers (APMs), Scrum Masters, and Operations Analysts.
CRITICAL ANTI-HALLUCINATION RULES:
1. Grounding: ONLY use facts provided. NEVER invent project management tools (e.g. Jira, Confluence) or metrics unless explicitly provided.
2. Product Leadership: Emphasize agile delivery, cross-functional alignment, and problem-solving strictly based on real coursework or student input.
3. Categorized Skills: Group into product methodologies, tracking tools, product analytics, and communication suites. If none exist, return an EMPTY ARRAY [].`,
        skillCategoryLabels: {
          languages: 'Product Management Methodologies',
          frameworks: 'Tracking & Project Management Tools',
          databases: 'Product Analytics & Metrics',
          tools: 'Documentation & Communication Suites',
        },
      },
      business_finance: {
        roleLabel: 'Financial Analyst | Business Operations',
        templateId: 'classic-corporate',
        systemPrompt: `You are a Corporate Finance & Business Strategy Hiring Specialist.
You craft structured, credible resumes for Financial Analysts, Accountants, and Corporate Operations.
CRITICAL ANTI-HALLUCINATION RULES:
1. Grounding: ONLY use facts provided. NEVER invent ERP systems (e.g. SAP, Tally) or accounting certifications unless explicitly provided.
2. Financial Precision: Emphasize financial analysis, Excel modeling, and compliance based strictly on provided student data.
3. Categorized Skills: Group into financial modeling, accounting/compliance standards, ERP systems, and enterprise software. If none exist, return an EMPTY ARRAY [].`,
        skillCategoryLabels: {
          languages: 'Financial Modeling & Analysis',
          frameworks: 'Accounting & Compliance Standards',
          databases: 'ERP & Accounting Systems',
          tools: 'Corporate Software & Analytics',
        },
      },
    };

    const activeConfig = categoryConfigs[category] || categoryConfigs.general;
    const resolvedRole = targetRole || careerObjective || activeConfig.roleLabel;

    const enrolledCoursesText = relevantSubjects.length
      ? relevantSubjects.map((s) => `${s.name} (${s.progress_percent}% mastery)`).join(', ')
      : 'None (No courses completed in this domain yet)';

    const verifiedCapstonesText = relevantCapstones.length
      ? JSON.stringify(relevantCapstones)
      : 'None (No verified capstones in this domain yet)';

    const studentSkillsText = Array.isArray(extraSkills) && extraSkills.length
      ? extraSkills.join(', ')
      : (typeof extraSkills === 'string' && extraSkills.trim() ? extraSkills : 'None provided');

    const studentProjectsText = Array.isArray(manualProjects) && manualProjects.length
      ? JSON.stringify(manualProjects)
      : 'None provided';

    const userPrompt = `Generate a structured, professional resume JSON for this student:
Target Career Track: ${category.toUpperCase()}
Target Role: ${resolvedRole}
Student Details:
- Name: ${personalInfo.fullName || profile.full_name || 'Candidate'}
- Headline: ${personalInfo.headline || resolvedRole}
- Degree: ${profile.degree || 'Bachelor Degree'}, Class of ${profile.year || '2025'}
- College: ${profile.college_name || 'University Institute'}
- Relevant Enrolled LMS Courses for ${category.toUpperCase()}: ${enrolledCoursesText}
- Career Focus: ${resolvedRole}
- Student Stated Skills: ${studentSkillsText}
- Verified LMS Capstones / Achievements for ${category.toUpperCase()}: ${verifiedCapstonesText}
- Student Stated Projects: ${studentProjectsText}
- Work Experience: ${workExperience.length ? JSON.stringify(workExperience) : 'None'}
- Education: ${education.length ? JSON.stringify(education) : 'None'}
- Contact Links: ${JSON.stringify(personalInfo.links || [])}

CRITICAL ANTI-HALLUCINATION INSTRUCTIONS:
- You are an editor and formatter. You must NEVER invent skills, tools, programming languages, spoken languages, or technologies that are not explicitly in the courses or student skills above.
- If no skills are provided or verified for a category, you MUST return an empty array [] for that category.
- If no verified capstones or student projects are provided, you MUST return an empty array [] for "projects".
- Structure summary and existing project bullets using active verbs and the STAR method, but DO NOT invent fictional numbers or metrics.

Return ONLY valid JSON matching this exact structure:
{
  "personalInfo": {
    "fullName": "${personalInfo.fullName || profile.full_name || ''}",
    "headline": "${personalInfo.headline || resolvedRole}",
    "email": "${personalInfo.email || profile.email || ''}",
    "phone": "${personalInfo.phone || ''}",
    "location": "${personalInfo.location || 'India'}",
    "links": ${JSON.stringify(personalInfo.links && personalInfo.links.length ? personalInfo.links : [
      { label: "LinkedIn", url: "https://linkedin.com" }
    ])}
  },
  "summary": "Concise 2-3 sentence summary tailored specifically to the ${resolvedRole} role and ${category} track, highlighting the candidate's genuine background.",
  "skills": {
    "languages": [],
    "frameworks": [],
    "databases": [],
    "tools": []
  },
  "projects": [],
  "experience": ${JSON.stringify(workExperience || [])},
  "education": ${education && education.length ? JSON.stringify(education) : `[
    {
      "id": "edu_1",
      "institution": "${profile.college_name || 'University'}",
      "degree": "${profile.degree || 'Bachelor Degree'}",
      "score": 8.5,
      "gradingSystem": "CGPA_10",
      "startYear": 2021,
      "endYear": 2025
    }
  ]`},
  "certifications": []
}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: activeConfig.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1800,
      temperature: 0.4,
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

    // Safety guard 1: If student has no relevant LMS courses and provided no manual skills,
    // guarantee skills remain strictly empty arrays (prevents any rogue LLM hallucination).
    const studentProvidedSkillsCount = Array.isArray(extraSkills)
      ? extraSkills.length
      : (typeof extraSkills === 'string' && extraSkills.trim() ? 1 : 0);
    if (!hasRelevantCourses && studentProvidedSkillsCount === 0) {
      resumeDoc.skills = {
        languages: [],
        frameworks: [],
        databases: [],
        tools: [],
      };
    }

    // Safety guard 2: If student has no verified capstones and provided no manual projects,
    // guarantee projects array remains strictly empty.
    if (relevantCapstones.length === 0 && (!manualProjects || manualProjects.length === 0)) {
      resumeDoc.projects = [];
    }

    // Attach category, role, and recommended template
    resumeDoc.category = category;
    resumeDoc.targetRole = resolvedRole;
    resumeDoc.templateId = activeConfig.templateId;

    // Merge student-provided personalInfo directly so AI never overwrites genuine links with dummy placeholders
    if (personalInfo && typeof personalInfo === 'object') {
      resumeDoc.personalInfo = {
        ...resumeDoc.personalInfo,
        ...personalInfo,
        headline: personalInfo.headline || resolvedRole,
        links: (personalInfo.links && personalInfo.links.length) ? personalInfo.links : resumeDoc.personalInfo?.links || [],
      };
    }

    // Preserve any student-entered events
    if (Array.isArray(events) && events.length > 0) {
      resumeDoc.events = events;
    } else if (!resumeDoc.events) {
      resumeDoc.events = [];
    }

    // Preserve any student-entered education (Degree, Intermediate, Schooling)
    if (Array.isArray(education) && education.length > 0) {
      resumeDoc.education = education;
    } else if (!resumeDoc.education) {
      resumeDoc.education = [];
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
  const { resumeData, targetRole, jobDescription } = req.body;

  const trimmedRole = (targetRole || resumeData?.targetRole || '').trim();
  const trimmedJD = (jobDescription || '').trim();

  if (!resumeData || (!trimmedRole && !trimmedJD)) {
    return res.status(400).json({ message: 'Target role or job description is required.' });
  }

  const roleText = trimmedRole ? `Target Role: ${trimmedRole}\n` : '';
  const jdText = trimmedJD
    ? `Job Description / Recruiter Notes:\n${trimmedJD.slice(0, 3000)}`
    : 'No full job description provided; evaluate against standard industry hiring requirements for this target role.';

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a Senior Technical Recruiter and hiring manager performing a Resume Role & Job Match Analysis.
Evaluate candidate alignment against the target role and any job description or informal notes provided. If only a job role or partial notes are provided, evaluate against standard industry technical requirements and core competencies expected for that role.
Identify keyword matches, missing technologies/tools that the role demands, formatting/content readability, and actionable recommendations.
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
          content: `Analyze this resume against the target role and job criteria:
${roleText}${jdText}

Resume Content:
${JSON.stringify({
  targetRole: trimmedRole || resumeData.targetRole,
  summary: resumeData.summary,
  skills: resumeData.skills,
  projects: (resumeData.projects || []).map(p => ({ title: p.title, techStack: p.techStack, bullets: p.bullets })),
  experience: resumeData.experience,
})}`,
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
