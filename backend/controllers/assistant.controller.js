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
      model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
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

exports.generateResume = async (req, res) => {
  const userId = req.user.id;
  const { workExperience = [], extraSkills = [], careerObjective = '' } = req.body;

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
      [userId],
    );

    const subjectsResult = await pool.query(
      `SELECT s.name AS subject_name,
              COUNT(DISTINCT utp.topic_id) FILTER (WHERE utp.is_completed = true) AS completed_topics,
              COUNT(DISTINCT t.id) AS total_topics,
              ROUND(COALESCE(COUNT(DISTINCT utp.topic_id) FILTER (WHERE utp.is_completed = true)::numeric / NULLIF(COUNT(DISTINCT t.id), 0) * 100, 0), 0) as progress_percent
       FROM public.user_subjects us
       JOIN public.subjects s ON s.id = us.subject_id
       LEFT JOIN public.topics t ON t.subject_id = s.id
       LEFT JOIN public.user_topic_progress utp ON utp.topic_id = t.id AND utp.user_id = $1
       WHERE us.user_id = $1
       GROUP BY s.name`,
      [userId],
    );

    const verifiedProjectsResult = await pool.query(
      `SELECT p.title, p.instructions, ps.score, s.name as subject
       FROM public.project_submissions ps
       JOIN public.projects p ON p.id = ps.project_id
       JOIN public.topics t ON p.topic_id = t.id
       JOIN public.subjects s ON t.subject_id = s.id
       WHERE ps.user_id = $1 AND ps.is_approved = true AND ps.score IS NOT NULL
       ORDER BY ps.score DESC
       LIMIT 3`,
      [userId],
    );

    const profile = profileResult.rows[0] || {};
    const subjects = subjectsResult.rows;
    const verifiedProjects = verifiedProjectsResult.rows;

    // Using exercises as projects since they contain the actual submission scores
    console.log('[resume] fetching projects (exercises)');
    const exercisesResult = await pool.query(
      `SELECT 
         e.title AS name, 
         CASE WHEN e.max_score > 0 THEN ROUND((es.score::numeric / e.max_score::numeric) * 100) ELSE 0 END AS score 
       FROM public.exercise_submissions es
       JOIN public.exercises e ON e.id = es.exercise_id
       WHERE es.user_id = $1`,
      [userId],
    );
    const allProjects = exercisesResult.rows;
    
    const eligibleProjects = allProjects.filter(p => p.score >= 75);

    if (eligibleProjects.length < 3) {
      let suggestionData;

      if (allProjects.length === 0) {
        suggestionData = "You haven't submitted any projects yet. Complete at least 3 projects with 75%+ score to unlock resume generation.";
      } else {
        suggestionData = allProjects
          .filter(p => p.score == null || p.score < 75)
          .map(p => {
            if (p.score == null || p.score === 0) {
              return { name: p.name, needed: "Not attempted" };
            }
            return { name: p.name, needed: `Needs ${75 - p.score}% more to reach 75%` };
          });
      }

      return res.status(200).json({
        success: false,
        eligible: false,
        message: "You need at least 3 projects with 75%+ score to generate a resume.",
        suggestion: suggestionData,
      });
    }

    const systemPrompt = `You are a professional resume writer specializing in tech students and early-career developers.
Generate a structured, ATS-friendly resume in JSON format. Be concise and impactful. Use action verbs. Do not fabricate specifics not provided.`;

    const userPrompt = `Generate a professional resume for this student. Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence professional summary highlighting their current learning path and top skills",
  "education": [{ "degree": "", "institution": "", "year": "", "details": "" }],
  "skills": ["skill1", "skill2"],
  "projects": [{ "name": "", "description": "", "technologies": [] }],
  "achievements": ["achievement1"],
  "experience": [{ "title": "", "company": "", "duration": "", "points": [""] }]
}

Student Data:
- Name: ${profile.full_name || 'Student'}
- College: ${profile.college_name || 'Not specified'}
- Degree: ${profile.degree || 'Not specified'}, Year: ${profile.year || 'Not specified'}
- Total XP Points: ${profile.total_points || 0}
- Course Status: ${subjects.map((s) => `${s.subject_name}: ${s.progress_percent}% Complete (${s.completed_topics}/${s.total_topics} topics mastering)`).join(', ') || 'None'}
- Verified Projects (Top Performance): ${verifiedProjects.length ? JSON.stringify(verifiedProjects) : 'None yet'}
- Badges Earned: ${profile.badge_count || 0} badges
- Career Objective: ${careerObjective || 'To grow as a software developer'}
- Extra Skills: ${extraSkills.join(', ') || 'None provided'}
- Work Experience: ${workExperience.length ? JSON.stringify(workExperience) : 'None'}
- Eligible Projects: ${eligibleProjects.length ? JSON.stringify(eligibleProjects.map(p => ({ name: p.name, score: p.score }))) : 'None'}

Instructions:
- Summary: Mention the student's status in their current courses (e.g. "Currently mastering Web Development (85% completed)").
- Skills: Include programming languages and tools inferred from enrolled subjects plus extra skills provided.
- Projects: ONLY include the verified projects listed above. Do not create placeholder projects. If no verified projects are present, leave the projects array empty.
- Achievements: Mention badge counts and XP milestones.
- Experience: Only include if work experience was provided.
- Keep the tone professional and data-driven.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';

    let resumeData;
    try {
      resumeData = JSON.parse(raw);
    } catch {
      console.error('RESUME JSON PARSE ERROR: invalid JSON from model:', raw.slice(0, 200));
      return res.status(500).json({ message: 'Resume generation returned invalid data. Please try again.' });
    }

    res.json({
      success: true,
      data: {
        personalInfo: {
          name: profile.full_name || '',
          email: profile.email || '',
          college: profile.college_name || '',
          degree: profile.degree || '',
          year: profile.year || '',
        },
        ...resumeData,
      },
    });
  } catch (err) {
    console.error('RESUME GENERATION ERROR:', err);
    res.status(500).json({ message: 'Failed to generate resume. Please try again.' });
  }
};

exports.optimizeWithJD = async (req, res) => {
  const { resumeData, jobDescription } = req.body;

  if (!resumeData || !jobDescription) {
    return res.status(400).json({ message: 'resumeData and jobDescription are required' });
  }

  const truncatedJD = jobDescription.slice(0, 2000);
  const jdWasTruncated = jobDescription.length > 2000;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
      messages: [
        {
          role: 'system',
          content: `You are an ATS optimization expert. Analyze a resume against a job description and return JSON with improvement suggestions and keyword matches.`,
        },
        {
          role: 'user',
          content: `Analyze this resume against the job description and return ONLY valid JSON with this structure:
{
  "atsScore": <number 0-100>,
  "keywordMatch": <number 0-100>,
  "contentQuality": <number 0-100>,
  "formatting": <number 0-100>,
  "missingKeywords": ["keyword1", "keyword2"],
  "suggestions": ["suggestion1", "suggestion2", "suggestion3"],
  "optimizedSummary": "Rewritten summary tailored to the JD"
}

Resume Summary: ${resumeData.summary || ''}
Resume Skills: ${(resumeData.skills || []).join(', ')}
Resume Experience: ${JSON.stringify(resumeData.experience || [])}
Resume Projects: ${JSON.stringify(resumeData.projects || [])}

Job Description:
${truncatedJD}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('JD OPTIMIZE JSON PARSE ERROR:', raw.slice(0, 200));
      return res.status(500).json({ message: 'Optimization returned invalid data. Please try again.' });
    }

    res.json({ success: true, data: parsed, ...(jdWasTruncated && { warning: 'Job description was truncated to 2000 characters.' }) });
  } catch (err) {
    console.error('JD OPTIMIZE ERROR:', err);
    res.status(500).json({ message: 'Optimization failed. Please try again.' });
  }
};
