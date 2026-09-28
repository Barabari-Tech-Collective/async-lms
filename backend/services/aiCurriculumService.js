const OpenAI = require('openai');
const { recommendBestVideo } = require('./videoRecommendation.service');

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com' 
});

/**
 * Generate a full curriculum tree from course metadata + JD.
 * Returns structured JSON that maps to ai_course_modules → topics → lessons.
 */
async function generateCurriculum({
  title,
  domain,
  roleFocus,
  jdText,
  skills,
  audience,
  level,
  learningGoal,
  durationWeeks,
  dailyHours,
  contentPreference,
  numModules,
}) {
  const skillsList = skills?.length
    ? skills.map((s) => `${s.name} (${s.category})`).join(', ')
    : 'to be determined from JD';

  const audienceStr = Array.isArray(audience)
    ? audience.join(', ')
    : audience || 'students';

  const prompt = `You are an expert curriculum designer for a job-focused Learning Management System (LMS).

The LMS has this EXACT hierarchy that you MUST follow:
  Course → Topics → Units → Subtopics

- **Topic**: A major subject domain within the course (e.g. for a Web Dev course: "JavaScript", "HTML & CSS", "React", "Express.js"). Each topic is like a mini-subject in itself.
- **Unit**: A chapter within a topic (e.g. within "JavaScript": "Variables & Data Types", "Functions & Scope", "Arrays & Objects"). Each unit gets its own Quiz + Assignment when published.
- **Subtopic**: An individual lesson within a unit (e.g. within "Variables & Data Types": "Declaring Variables", "Constants", "Type Conversion"). Each subtopic has a VIDEO + MARKDOWN content + EXERCISE(s).

Design a complete, job-aligned curriculum for:

**Course Title:** ${title}
**Domain:** ${domain}
**Target Role:** ${roleFocus}
**Target Audience:** ${audienceStr}
**Level:** ${level}
**Learning Goal:** ${learningGoal}
**Duration:** ${durationWeeks ? `${durationWeeks} weeks` : 'flexible'}
**Daily Time:** ${dailyHours ? `${dailyHours} hours/day` : 'flexible'}
**Content Style:** ${contentPreference || 'balanced'}
**Key Skills to Cover:** ${skillsList}
${jdText ? `\n**Job Description:**\n${jdText}` : ''}

Generate ${numModules ? `exactly ${numModules} topics` : '4–7 topics'}. Each topic must have 3–6 units. Each unit must have 2–4 subtopics.

Return ONLY a valid JSON object matching this exact schema (no markdown, no explanation).
The JSON keys use "modules/topics/lessons" as internal names but they map to Topics/Units/Subtopics in the LMS:

{
  "capstone_project": {
    "title": "Final capstone project title — the culminating real-world deliverable for the entire course",
    "description": "What the learner builds end-to-end to prove mastery of everything in the course",
    "instructions": "Detailed step-by-step instructions: what to build, acceptance criteria, submission format, evaluation rubric"
  },
  "modules": [
    {
      "title": "Topic title — a major subject domain (e.g. 'JavaScript Fundamentals', 'HTML & CSS', 'React')",
      "description": "What this topic/subject domain covers and why it matters for the role",
      "practice_tasks": ["Real-world task 1", "Real-world task 2"],
      "case_studies": ["Case study scenario 1", "Case study scenario 2"],
      "topics": [
        {
          "title": "Unit title — a chapter within this topic (e.g. 'Variables & Data Types', 'Functions & Scope')",
          "description": "Brief unit description",
          "assignment": {
            "title": "Assignment title — a graded practical task covering this entire unit",
            "instructions": "Clear step-by-step instructions: what to build/submit, format, criteria",
            "max_score": 100
          },
          "quiz_questions": [
            {
              "question": "Clear multiple-choice question covering a concept from this unit",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correct_index": 0,
              "explanation": "Why this answer is correct"
            }
          ],
          "lessons": [
            {
              "title": "Subtopic title — a single lesson concept (e.g. 'Declaring Variables', 'let vs const', 'Type Conversion')",
              "duration_mins": 20,
              "video_url": "https://www.youtube.com/results?search_query=specific+subtopic+tutorial",
              "explanation": "Full markdown explanation — use ## subheadings, bullet points, \`\`\`code blocks\`\`\`. Minimum 4 paragraphs. This is the main reading content shown alongside the video.",
              "example": "Concrete, role-relevant code or concept example",
              "activity": "Short in-lesson activity the learner does immediately",
              "interview_questions": ["Interview Q1 about this subtopic", "Interview Q2 about this subtopic"],
              "exercise": {
                "title": "Exercise title — a real coding/practical task for this subtopic",
                "description": "Clear instructions for what the learner must build or do",
                "tasks": ["Step 1", "Step 2", "Step 3"],
                "starter_code": "// starter code, HTML scaffold, or empty string if non-technical"
              }
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Topics must be real subject domains for this course (like "JavaScript", "HTML & CSS", "React") — NOT generic names like "Module 1" or "Introduction"
- Units must be specific chapters within the topic (like "Variables & Data Types", "Functions & Scope") — NOT generic like "Unit 1"
- Subtopics must be individual, atomic concepts (like "let vs const", "Arrow Functions") — granular enough to each have its own video
- capstone_project is ONE final project for the entire course — what students complete to earn a certificate
- Every topic (module) MUST have practice_tasks and case_studies (minimum 2 each)
- Every unit (topic) MUST have an assignment (graded, practical, max_score 100)
- Every subtopic (lesson) MUST have ALL of: video_url, explanation, example, activity, interview_questions, exercise — NO quiz_questions inside lessons
- quiz_questions belong ONLY at the unit (topic) level — each unit MUST have 5–10 MCQ questions covering all lessons in that unit
- video_url must be a YouTube search URL: "https://www.youtube.com/results?search_query=" + URL-encoded terms. The search terms MUST strictly target the exact lesson topic using a natural, 3-to-6 word search phrase (e.g., "Excel Requirements Analysis tutorial"). Do NOT use complex academic phrases or negative keywords.
- duration_mins: total estimated time for video + reading (15–45 mins)
- quiz_questions: exactly 4 options per question, correct_index (0–3), and explanation
- exercise: one hands-on exercise per subtopic with 3–5 concrete tasks. Include starter_code ONLY if the topic involves programming or technical coding; otherwise, leave it as an empty string.
- explanation must be rich markdown — use ## subheadings, bullet lists, and \`\`\`language code blocks\`\`\`
- Level appropriateness: ${level} — calibrate depth and complexity accordingly
- Avoid generic filler — every subtopic must teach something directly employable for ${roleFocus}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 32000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  const parsed = JSON.parse(content);

  if (!parsed.modules || !Array.isArray(parsed.modules)) {
    throw new Error('AI returned invalid curriculum structure');
  }

  return parsed;
}

/**
 * Regenerate a single lesson block with a specific instruction.
 */
async function regenerateLesson({ lesson, instruction, roleFocus, level }) {
  const prompt = `You are an expert curriculum designer.

Here is an existing lesson:
Title: ${lesson.title}
Explanation: ${lesson.explanation}
Example: ${lesson.example}
Activity: ${lesson.activity}
Interview Questions: ${JSON.stringify(lesson.interview_questions)}

Target role: ${roleFocus}
Level: ${level}
Instruction: ${instruction}

Rewrite this lesson following the instruction. Return ONLY a valid JSON object:
{
  "title": "...",
  "explanation": "...",
  "example": "...",
  "activity": "...",
  "interview_questions": ["...", "..."]
}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}

/**
 * Extract skills from a job description.
 */
async function extractSkillsFromJD(jdText) {
  const prompt = `Extract skills from this job description and categorize them.

Job Description:
${jdText}

Return ONLY a valid JSON object:
{
  "skills": [
    { "name": "Skill name", "category": "technical" },
    { "name": "Tool name", "category": "tools" },
    { "name": "Soft skill", "category": "soft" }
  ]
}

Categories must be exactly: "technical", "tools", or "soft".
Extract 8–20 skills. Focus on what's directly required, not implied.`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return parsed.skills || [];
}

/**
 * Generate topic suggestions for Step 2 of the course builder.
 * Returns a flat list — the user picks which ones to keep.
 */
async function generateTopics({
  title,
  domain,
  roleFocus,
  level,
  learningGoal,
  numTopics,
}) {
  const prompt = `You are an expert curriculum designer for a job-focused LMS.

Generate the major subject topics for this course:
Course Title: ${title}
Domain: ${domain}
Target Role: ${roleFocus}
Level: ${level}
Learning Goal: ${learningGoal}

Return ${numTopics ? `exactly ${numTopics}` : '5–8'} topics. Each topic is a major subject domain students must master.

Return ONLY a valid JSON object (no markdown):
{ "topics": [{ "title": "Topic title", "description": "One-sentence description of what this topic covers" }] }

Rules:
- Titles must be real subject domains (e.g. "JavaScript Fundamentals", "React", "Node.js & Express")
- NOT generic labels like "Module 1" or "Introduction"
- Each topic must be directly essential to the target role
- Order them from foundational to advanced`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  if (!parsed.topics || !Array.isArray(parsed.topics)) {
    throw new Error('AI returned invalid topics structure');
  }
  return parsed;
}

/**
 * Generate unit suggestions for a given topic.
 */
async function generateUnits({ courseTitle, roleFocus, level, topicTitle }) {
  const prompt = `You are an expert curriculum designer.

Generate the units (chapters) for this topic within a course:
Course: ${courseTitle}
Topic: ${topicTitle}
Role: ${roleFocus}
Level: ${level}

Return 3–6 units. Each unit is a focused chapter within the topic.

Return ONLY a valid JSON object:
{ "units": [{ "title": "Unit title", "description": "One-sentence description" }] }

Rules:
- Titles must be specific chapters (e.g. "Variables & Data Types", "Functions & Scope")
- NOT generic ("Unit 1", "Basics")
- Progress logically from foundational concepts to more complex ones within the topic`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  if (!parsed.units || !Array.isArray(parsed.units)) {
    throw new Error('AI returned invalid units structure');
  }
  return parsed;
}

/**
 * Generate subtopic suggestions for a given unit.
 */
async function generateSubtopics({
  courseTitle,
  roleFocus,
  level,
  topicTitle,
  unitTitle,
}) {
  const prompt = `You are an expert curriculum designer.

Generate the subtopics (individual lessons) for this unit:
Course: ${courseTitle}
Topic: ${topicTitle}
Unit: ${unitTitle}
Role: ${roleFocus}
Level: ${level}

Return 2–4 subtopics. Each subtopic is a single, atomic lesson concept with its own video.

Return ONLY a valid JSON object:
{ "subtopics": [{ "title": "Subtopic title", "duration_mins": 20 }] }

Rules:
- Titles must be atomic concepts (e.g. "let vs const", "Arrow Functions", "Array destructuring")
- duration_mins: estimated total study time including video + reading (15–40 mins)
- Each must be granular enough to have its own 10–15 minute video`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
    max_tokens: 600,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  if (!parsed.subtopics || !Array.isArray(parsed.subtopics)) {
    throw new Error('AI returned invalid subtopics structure');
  }
  return parsed;
}

/**
 * Search YouTube Data API v3 for a real video URL.
 * Falls back to a search results URL if YOUTUBE_API_KEY is not set.
 */
async function searchYouTubeVideo(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoDuration=medium&order=relevance&maxResults=1&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.items?.length) {
      return `https://www.youtube.com/watch?v=${data.items[0].id.videoId}`;
    }
  } catch (err) {
    console.warn('YouTube API search failed, falling back to search URL:', err.message);
  }
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/**
 * Search YouTube Data API v3 and return multiple results for user selection.
 */
async function searchYouTubeVideos(query, maxResults = 3) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return [];
  }
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoDuration=medium&order=relevance&maxResults=${maxResults}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.items?.length) {
      return data.items.map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
        channel: item.snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }));
    }
  } catch (err) {
    console.warn('YouTube API multi-search failed:', err.message);
  }
  return [];
}

/**
 * Generate specific content for a subtopic lesson.
 * type: 'video' | 'markdown' | 'exercise'
 */
async function generateLessonContent({
  type,
  courseTitle,
  roleFocus,
  level,
  topicTitle,
  unitTitle,
  lessonTitle,
  lessonId = null,
  excludeUrls = [],
}) {
  if (type === 'video') {
    let searchQuery = `${lessonTitle} tutorial`; // Safe fallback in case of OpenAI failure

    const prompt = `You are an expert at finding educational YouTube videos.
We need to find a video for a lesson.
Course: ${courseTitle}
Topic: ${topicTitle}
Unit: ${unitTitle}
Lesson: ${lessonTitle}
Role: ${roleFocus}

You are a master curriculum search specialist.
Your task is to generate a highly effective YouTube search query (3 to 7 words maximum) to find the perfect educational video for the lesson "${lessonTitle}" within the topic "${topicTitle}" for the course "${courseTitle}".

CRITICAL RULES:
1. ANALYZE THE DOMAIN: First, determine the overarching domain of the course (e.g., IT, Business, Beauty, Science, Art). 
2. DOMAIN SPECIFICITY: Include the core subject or technology from the Course Title in the search query to anchor the context (e.g., "Java", "Soil Science", "Bridal Makeup").
3. LESSON SPECIFICITY: You MUST explicitly include the core conceptual focus of the lesson title in the query. Do not generalize to the whole course.
4. TONE & FORMAT: Add 1 or 2 format keywords ONLY if appropriate for the domain. For IT: "tutorial", "hands-on". For Science: "explained", "animation". For Beauty/Art: "step-by-step", "demonstration". For Business: "overview", "case study". 
5. Do NOT use negative keywords or operators, just provide a clean, simple search phrase.

Return ONLY a valid JSON object:
{ "search_query": "the best youtube search string" }`;

    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });
      
      const parsed = JSON.parse(response.choices[0].message.content);
      if (parsed.search_query) {
        searchQuery = parsed.search_query;
      }
    } catch (err) {
      console.warn("OpenAI LLM failed, using fallback query:", err.message);
    }
    
    // Use the robust Video Recommendation Engine instead of the naive legacy search
    const { video_url, video_results } = await recommendBestVideo({ 
      query: searchQuery, 
      lessonId, 
      excludeUrls,
      lessonTitle,
      topicTitle,
      courseTitle
    });
    return { video_url, video_results };
  }

  const context = `Course: ${courseTitle}\nTopic: ${topicTitle}\nUnit: ${unitTitle}\nSubtopic: ${lessonTitle}\nRole: ${roleFocus}\nLevel: ${level}`;
  let prompt, maxTokens;

  if (type === 'markdown') {
    prompt = `${context}

Write a comprehensive markdown explanation for this subtopic lesson.

Return ONLY a valid JSON object:
{
  "explanation": "Full markdown content here",
  "example": "Concrete role-relevant code or concept example",
  "activity": "Short in-lesson activity",
  "interview_questions": ["Interview Q1", "Interview Q2"],
  "duration_mins": 25
}

Rules for explanation:
- Use ## subheadings, bullet points, and \`\`\`language code blocks\`\`\`
- Minimum 4 paragraphs
- Directly applicable to ${roleFocus} role`;
    maxTokens = 3000;
  } else if (type === 'exercise') {
    prompt = `${context}

Create a hands-on coding exercise for this subtopic.

Return ONLY a valid JSON object:
{
  "exercise": {
    "title": "Exercise title",
    "description": "What the learner must build or do",
    "tasks": ["Step 1", "Step 2", "Step 3"],
    "starter_code": "// starter code, HTML scaffold, or empty string if non-technical"
  }
}

Rules:
- Must be practical and directly related to ${roleFocus} work
- 3–5 concrete, actionable task steps
- Include starter_code ONLY if the topic involves programming or technical coding; otherwise, leave it as an empty string.`;
    maxTokens = 1000;
  } else {
    throw new Error(`Unknown content type: ${type}`);
  }

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}

/**
 * Generate quiz questions for a unit.
 */
async function generateUnitQuiz({
  courseTitle,
  roleFocus,
  level,
  topicTitle,
  unitTitle,
  subtopics,
}) {
  const subtopicList = subtopics?.length
    ? subtopics.map((s) => `- ${s}`).join('\n')
    : '(general unit content)';

  const prompt = `You are an expert quiz designer.

Generate MCQ quiz questions for this unit:
Course: ${courseTitle}
Topic: ${topicTitle}
Unit: ${unitTitle}
Role: ${roleFocus}
Level: ${level}
Subtopics covered:
${subtopicList}

Return 5–8 multiple-choice questions covering the key concepts across all subtopics.

Return ONLY a valid JSON object:
{
  "quiz_questions": [
    {
      "question": "Clear MCQ question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0,
      "explanation": "Why this answer is correct"
    }
  ]
}

Rules:
- Exactly 4 options per question
- correct_index is 0-based
- Mix recall, understanding, and application questions
- Focus on what a ${roleFocus} must know`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  if (!parsed.quiz_questions || !Array.isArray(parsed.quiz_questions)) {
    throw new Error('AI returned invalid quiz structure');
  }
  return parsed;
}

/**
 * Generate an assignment for a unit.
 */
async function generateUnitAssignment({
  courseTitle,
  roleFocus,
  level,
  topicTitle,
  unitTitle,
}) {
  const prompt = `You are an expert curriculum designer.

Create a graded assignment for this unit:
Course: ${courseTitle}
Topic: ${topicTitle}
Unit: ${unitTitle}
Role: ${roleFocus}
Level: ${level}

Return ONLY a valid JSON object:
{
  "assignment": {
    "title": "Assignment title",
    "instructions": "Step-by-step instructions: what to build/submit, format, acceptance criteria",
    "max_score": 100
  }
}

Rules:
- Must be a practical, real-world task relevant to ${roleFocus}
- Instructions must be clear enough to submit without ambiguity
- Covers the key skills from the entire unit`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  if (!parsed.assignment) {
    throw new Error('AI returned invalid assignment structure');
  }
  return parsed;
}

/**
 * Generate a capstone project for a course.
 */
async function generateCapstone({ courseTitle, roleFocus, level, moduleTitle, unitTitles }) {
  const prompt = `You are an expert curriculum designer.

Create a capstone project for this topic:
Course: ${courseTitle}
Topic: ${moduleTitle}
Units covered: ${unitTitles.join(', ')}
Role: ${roleFocus}
Level: ${level}

Return ONLY a valid JSON object:
{
  "capstone_project": {
    "title": "Capstone project title — a compelling real-world deliverable",
    "description": "What the learner builds to prove mastery of all units in this topic (2-3 sentences)",
    "instructions": "Detailed step-by-step instructions: what to build, acceptance criteria, deliverables, submission format, and evaluation rubric"
  }
}

Rules:
- Must integrate skills from ALL units in the topic
- Must be a realistic, portfolio-worthy project for a ${roleFocus}
- Instructions must be clear and self-contained`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  if (!parsed.capstone_project) {
    throw new Error('AI returned invalid capstone structure');
  }
  return parsed;
}

async function generateExerciseTests({ instructions, language, roleFocus, level }) {
  const prompt = `You are an expert software tester, curriculum designer, and programming language specialist.

## Your Task
Generate automated test cases for a coding assignment based on the provided content.

## Inputs
- **Task Instructions:** ${instructions}
- **Programming Language:** ${language}
- **Target Role:** ${roleFocus}
- **Complexity Level:** ${level}

## Output Format
Return ONLY a valid JSON object with NO markdown wrappers (no \`\`\`json blocks):

{
  "test_cases": [
    {
      "description": "Clear description of what this test verifies",
      "test_code": "The grading code using the required syntax below",
      "is_hidden": false
    }
  ]
}

---

## UNIVERSAL SYNTAX RULES (Apply based on ${language})

### Test Block Syntax
- **JavaScript:** Use \`__test(description, async () => { ... })\` if async, else \`__test(description, () => { ... })\`
- **Python:** Use \`async def _t(): ... \\n__test(description, _t)\` if async, else \`__test(description, lambda: (...))\`

### Assertion Syntax
- **JavaScript:** Use \`__expect(actual).toBe(expected)\`
- **Python:** Use \`__expect(actual).to_be(expected)\`
- **Strict equality is used.** The expected value MUST match the actual output in both value AND type.

---

## CRITICAL GENERATION RULES (Follow in exact order)

### Rule 1: Identify ALL Executable Tasks
Read the entire assignment and identify EVERY task that requires the student to output an answer. 
- Some tasks provide code for the student to run ("Predict the output").
- Other tasks only describe a problem for the student to solve ("Calculate factorial of 5").
You must generate a test for EVERY expected \`console.log()\` or \`print()\` statement.

### Rule 2: Determine Expected Output BEFORE Writing Tests
For every task identified in Rule 1, you MUST determine the exact expected output.
1. **For provided code:** Mentally execute it step-by-step. Respect operator precedence and type coercion.
2. **For problem descriptions:** Determine the correct mathematical or logical answer (e.g., factorial of 5 is 120).
3. **Pure Expressions (ENGINE DELEGATION):** Do NOT calculate the answer for pure expressions yourself. Write the raw expression in .toBe(). e.g., \`__expect(__logs[0]).toBe("9" > "100")\`.
4. **Mutation Operators (++, --, +=):** NEVER inline these onto literal numbers. Hardcode the final result. e.g., \`__expect(__logs[5]).toBe('56')\`.

### Rule 3: ALWAYS use __logs — NEVER test variables directly
**The golden rule:** ALL assertions MUST use \`__logs\`. Never assert a variable name directly.

- ❌ FORBIDDEN: \`__expect(x).toBe(24)\`
- ❌ FORBIDDEN: \`__expect(p).toBe(5)\`  
- ✅ CORRECT: \`__expect(__logs[n]).toBe(24)\` (because the student logged x)
- ✅ CORRECT: \`__expect(__logs[n]).toBe(5)\` (because the student logged p)

This works because assignments instruct the student to console.log ALL their final answers.

### Rule 4: No Code Inside Test Blocks — ONLY __expect Statements
**The test block body MUST ONLY contain \`__expect(__logs[n]).toBe(...)\` statements.**

- ❌ FORBIDDEN (variable declaration): \`__test('...', () => { let x = 10; x += 5; __expect(x).toBe(15); })\`
- ❌ FORBIDDEN (console.log in test): \`__test('...', () => { console.log(a + b); __expect(__logs[5]).toBe(...); })\`
- ✅ CORRECT: \`__test('...', () => { __expect(__logs[5]).toBe(15); })\`

### Rule 5: Maintain Continuous Log Indexing
\`__logs\` is a SINGLE global array accumulating ALL \`console.log\` / \`print\` outputs.
- Start at \`__logs[0]\` for the very first log in the entire solution.
- NEVER reset to 0 for a new test.
- Mentally map every console.log → index before writing the JSON.

### Rule 6: Type Matching is NON-NEGOTIABLE
The value in .toBe() MUST match the runtime output type exactly.
- Numbers: \`.toBe(16)\` not \`.toBe('16')\`
- Strings: \`.toBe("hello")\`
- Booleans: \`.toBe(true)\` not \`.toBe('true')\`
- null/undefined/None: use exact keyword

### Rule 7: Test Case Grouping
- Generate one test per logical section.
- Do NOT skip any section.

### Rule 8: Asynchronous Operations
If the student's code is asynchronous (setTimeout, Promises, fetch, asyncio):
- **JavaScript:** \`__test(description, async () => { await new Promise(r => setTimeout(r, 1100)); __expect(__logs[n]).toBe(...); })\`
- **Python:** \`async def _t(): await asyncio.sleep(1.1); __expect(__logs[n]).to_be(...)\n__test(description, _t)\`

### Rule 9: Language-Specific Adaptations
- **JavaScript:** == vs === differ. Template literals, coercions.
- **Python:** / is float, // is int. None is not False. Indentation matters.

---

## FINAL VERIFICATION CHECKLIST
Before returning JSON, confirm:
1. Every test body contains ONLY \`__expect(__logs[n]).toBe(...)\` statements.
2. No variable declarations (let/const/var/def) inside any test block.
3. No console.log or print inside any test block.
4. Pure expressions are delegated to the engine.
5. Mutation/sequential results are hardcoded final values.
6. __logs indices are continuous from 0 with no gaps.
7. Types match exactly.
8. Return only raw JSON.`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return parsed.test_cases || [];
}

/**
 * Analyze an uploaded document to extract or synthesize lesson content.
 */
async function generateExerciseFromFile(fileText, lessonTitle) {
  const prompt = `You are an expert curriculum designer. The user has uploaded a document to generate an exercise for the lesson titled: "${lessonTitle}".

Read the following document text carefully.

Intelligent Instructions:
1. Extract or invent a practical, hands-on exercise based on the concepts found in the document.
2. The exercise must have a clear description, a list of actionable tasks, and some starter code to help the learner begin.

Output ONLY a valid JSON object matching this schema (no markdown blocks around the JSON):
{
  "description": "Clear instructions for the overall exercise and what the learner must build or do. Minimum 1 paragraph.",
  "tasks": ["Actionable task 1", "Actionable task 2", "Actionable task 3"],
  "starter_code": "Boilerplate code to get them started. If the document has code snippets, use them to create a realistic starting point. ALWAYS wrap in \`\`\`language code blocks\`\`\`."
}

Document Text (truncated if too long):
${fileText.substring(0, 15000)}
`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}

async function generateContentFromFile(fileText, lessonTitle) {
  const prompt = `You are an expert curriculum designer. The user has uploaded a document for the lesson titled: "${lessonTitle}".

Read the following document text carefully.

Intelligent Instructions:
1. If the document explicitly contains a clearly defined Explanation, Example, and Activity, extract and format them nicely into Markdown.
2. If the document only contains raw informational text (e.g., just an explanation of concepts), use that text to write a comprehensive Explanation, but you must INVENT a highly relevant Example and a short Activity based on the concepts found in the document.

Output ONLY a valid JSON object matching this schema (no markdown blocks around the JSON):
{
  "explanation": "Full markdown explanation using the document content. Use ## subheadings, bullet points, \`\`\`code blocks\`\`\`. Minimum 3 paragraphs. This is the main reading content.",
  "example": "Concrete, role-relevant code or concept example. MUST be nicely formatted using Markdown! If it contains code, ALWAYS wrap it in \`\`\`language code blocks\`\`\` and ensure it spans multiple lines cleanly with proper indentation.",
  "activity": "Short in-lesson activity the learner does immediately (extracted or invented). Format using Markdown."
}

Document Text (truncated if too long):
${fileText.substring(0, 15000)}
`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 2500,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}

module.exports = {
  generateCurriculum,
  regenerateLesson,
  extractSkillsFromJD,
  generateTopics,
  generateUnits,
  generateSubtopics,
  generateLessonContent,
  generateUnitQuiz,
  generateUnitAssignment,
  generateCapstone,
  generateExerciseTests,
  generateContentFromFile,
  generateExerciseFromFile,
};
