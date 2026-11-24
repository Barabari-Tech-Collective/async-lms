/**
 * Utility to match LMS courses, subjects, and verified projects to specific career tracks.
 * Prevents cross-contamination (e.g. web development courses leaking into accountant resumes)
 * and ensures AI only grounds resumes in courses relevant to the chosen track.
 */

const TRACK_KEYWORDS = {
  tech: [
    'web', 'javascript', 'js', 'typescript', 'ts', 'react', 'node', 'express', 'python',
    'java', 'c++', 'c#', 'golang', 'rust', 'html', 'css', 'tailwind', 'bootstrap',
    'backend', 'frontend', 'full stack', 'fullstack', 'database', 'sql', 'postgresql',
    'mongodb', 'redis', 'api', 'rest', 'graphql', 'git', 'github', 'docker', 'kubernetes',
    'aws', 'cloud', 'devops', 'ci/cd', 'dsa', 'data structures', 'algorithms', 'software',
    'app development', 'mobile', 'flutter', 'react native', 'android', 'ios', 'system design',
    'computer science', 'coding', 'programming'
  ],
  data: [
    'data', 'analytics', 'analyst', 'bi', 'business intelligence', 'power bi', 'powerbi',
    'tableau', 'sql', 'query', 'etl', 'data warehouse', 'bigquery', 'snowflake',
    'statistics', 'statistical', 'pandas', 'numpy', 'scipy', 'r programming', 'excel',
    'spreadsheet', 'machine learning', 'ml', 'ai', 'artificial intelligence', 'data science',
    'deep learning', 'nlp', 'data modeling', 'visualization'
  ],
  business_finance: [
    'account', 'accounting', 'finance', 'financial', 'tax', 'taxation', 'gst', 'tally',
    'audit', 'auditing', 'bookkeeping', 'balance sheet', 'excel', 'advanced excel',
    'financial modeling', 'valuation', 'banking', 'corporate finance', 'budgeting',
    'cost accounting', 'erp', 'sap', 'commerce', 'bcom', 'mcom', 'cma', 'ca', 'wealth',
    'investment', 'portfolio'
  ],
  sales_marketing: [
    'sales', 'marketing', 'digital marketing', 'growth', 'b2b', 'b2c', 'business development',
    'bde', 'lead generation', 'prospecting', 'crm', 'salesforce', 'hubspot', 'cold calling',
    'email marketing', 'seo', 'sem', 'social media', 'content marketing', 'advertising',
    'google ads', 'meta ads', 'campaign', 'brand', 'market research', 'inbound', 'outbound',
    'negotiation', 'pipeline'
  ],
  design: [
    'design', 'ui', 'ux', 'user interface', 'user experience', 'figma', 'adobe', 'xd',
    'photoshop', 'illustrator', 'wireframe', 'wireframing', 'prototype', 'prototyping',
    'design system', 'user research', 'usability', 'interaction design', 'visual design',
    'graphic design', 'canva', 'typography', 'user journey', 'persona'
  ],
  product_operations: [
    'product', 'product management', 'apm', 'operations', 'project management', 'agile',
    'scrum', 'kanban', 'jira', 'trello', 'confluence', 'sprint', 'user stories', 'prd',
    'backlog', 'stakeholder', 'process improvement', 'supply chain', 'logistics',
    'lean', 'six sigma', 'kpi', 'okr'
  ],
  general: [
    'communication', 'spoken english', 'soft skills', 'aptitude', 'problem solving',
    'critical thinking', 'office', 'ms office', 'excel', 'word', 'powerpoint',
    'presentation', 'business communication', 'professional ethics', 'time management'
  ]
};

// Pre-compile unified regex per track for O(1) matching with zero runtime RegExp creation overhead
const COMPILED_TRACK_REGEXES = {};
for (const [trackKey, list] of Object.entries(TRACK_KEYWORDS)) {
  const pattern = list
    .map((kw) => kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
    .join('|');
  COMPILED_TRACK_REGEXES[trackKey] = new RegExp(`(?:^|[^a-z0-9])(?:${pattern})(?:[^a-z0-9]|$)`, 'i');
}

function normalizeText(text) {
  return String(text || '').toLowerCase().trim();
}

/**
 * Checks if a subject/course name matches a specific career track.
 */
function isSubjectRelevantToTrack(subjectName, track) {
  if (!subjectName || !track) return false;
  const norm = normalizeText(subjectName);
  const regex = COMPILED_TRACK_REGEXES[track] || COMPILED_TRACK_REGEXES.general;
  return regex.test(norm);
}

/**
 * Checks if a capstone or project is relevant to a specific track.
 */
function isProjectRelevantToTrack(projectTitle, subjectName, track) {
  if (isSubjectRelevantToTrack(subjectName, track)) return true;
  if (!projectTitle || !track) return false;
  const norm = normalizeText(projectTitle);
  const regex = COMPILED_TRACK_REGEXES[track] || COMPILED_TRACK_REGEXES.general;
  return regex.test(norm);
}

/**
 * Filters user enrolled subjects and verified capstones strictly for a given career track.
 */
function filterLmsDataForTrack(subjects = [], capstones = [], track = 'general') {
  const normTrack = String(track || 'general').toLowerCase();

  const relevantSubjects = subjects.filter((s) => isSubjectRelevantToTrack(s.name, normTrack));
  const relevantCapstones = capstones.filter((c) => isProjectRelevantToTrack(c.title, c.subject, normTrack));

  return {
    relevantSubjects,
    relevantCapstones,
    hasRelevantCourses: relevantSubjects.length > 0 || relevantCapstones.length > 0,
  };
}

module.exports = {
  TRACK_KEYWORDS,
  isSubjectRelevantToTrack,
  isProjectRelevantToTrack,
  filterLmsDataForTrack,
};
