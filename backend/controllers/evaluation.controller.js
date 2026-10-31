const serverError = require('../utils/serverError');
const pool = require('../config/pg');
const axios = require('axios');
const { notify } = require('../services/notificationService');
const { presignS3Url } = require('../utils/s3');
const OpenAI = require('openai');

const EVALUATOR_APIS = {
  JS: 'JavaScript Evaluator',
  REACT: 'React Evaluator',
  AI: 'AI / Backend Evaluator',
  VISUAL: 'Visual / DOM Evaluator',
  PYTHON: 'Python Evaluator',
  FULLSTACK: 'Fullstack Evaluator',
  EXCEL: 'Excel Spreadsheet Evaluator',
  SQL: 'SQL Database Evaluator',
};

// Render free-tier services can accept the TCP connection right after waking
// but still reject the first request for a few seconds while the app finishes
// booting. A single retry after a short delay absorbs that without needing an
// even longer single timeout.
async function postToEvaluatorWithRetry(url, payload, config) {
  try {
    return await axios.post(url, payload, config);
  } catch (err) {
    const isNetworkFailure = !err.response && err.request;
    if (!isNetworkFailure) throw err;
    console.warn('Evaluator API request failed with no response, retrying once in 5s:', err.message);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return axios.post(url, payload, config);
  }
}

function isAllowedGitUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const trimmed = urlStr.trim();
    if (!trimmed) return false;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    const allowed = ['github.com', 'gitlab.com', 'bitbucket.org'];
    return allowed.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function isAllowedSpreadsheetUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const trimmed = urlStr.trim();
    if (!trimmed) return false;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    const allowed = [
      'docs.google.com',
      'drive.google.com',
      'sheets.google.com',
      'onedrive.live.com',
      '1drv.ms',
      'sharepoint.com',
      'api.onedrive.com',
      'dropbox.com',
      'box.com',
      'amazonaws.com',
      'storage.googleapis.com',
    ];
    if (allowed.some(h => host === h || host.endsWith('.' + h))) return true;
    const pathLower = parsed.pathname.toLowerCase();
    return pathLower.endsWith('.xlsx') || pathLower.endsWith('.xlsm') || parsed.search.toLowerCase().includes('format=xlsx') || pathLower.includes('/root/content');
  } catch {
    return false;
  }
}

async function getSpreadsheetDownloadUrl(sub) {
  if (sub?.submission_file_url) {
    return await presignS3Url(sub.submission_file_url);
  }
  const link = (sub?.submission_link || '').trim();
  if (!link) return null;
  if (link.includes('.amazonaws.com/')) {
    return await presignS3Url(link);
  }
  if (link.includes('docs.google.com/spreadsheets')) {
    const match = link.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
    }
  }
  if (link.includes('drive.google.com')) {
    const match = link.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                  link.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                  link.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  if (link.includes('1drv.ms') || link.includes('onedrive.live.com')) {
    try {
      const cleanUrl = link.replace(/[?&]download=\d+/, '');
      const b64 = Buffer.from(cleanUrl, 'utf-8')
        .toString('base64')
        .replace(/=+$/, '')
        .replace(/\//g, '_')
        .replace(/\+/g, '-');
      return `https://api.onedrive.com/v1.0/shares/u!${b64}/root/content`;
    } catch {
      const separator = link.includes('?') ? '&' : '?';
      return `${link}${separator}download=1`;
    }
  }
  if (link.includes('sharepoint.com')) {
    try {
      const u = new URL(link);
      if (!u.searchParams.has('download')) {
        u.searchParams.set('download', '1');
      }
      return u.toString();
    } catch {
      const separator = link.includes('?') ? '&' : '?';
      return `${link}${separator}download=1`;
    }
  }
  return link;
}

function isAllowedSqlUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const trimmed = urlStr.trim();
    if (!trimmed) return false;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    // 1. Google Drive / Docs
    if (host.includes('drive.google.com') || host.includes('docs.google.com')) return true;
    // 2. OneDrive / SharePoint / Dropbox
    if (['onedrive.live.com', '1drv.ms', 'sharepoint.com', 'dropbox.com'].some(h => host === h || host.endsWith('.' + h))) return true;
    // 3. Git hosts (GitHub, GitLab, Bitbucket)
    if (isAllowedGitUrl(trimmed)) return true;
    // 4. Direct file extensions (.sql, .txt)
    const pathLower = parsed.pathname.toLowerCase();
    if (pathLower.endsWith('.sql') || pathLower.endsWith('.txt')) return true;
    // 5. Cloud storage / presigned URLs
    if (host.includes('amazonaws.com') || host.includes('s3') || host.includes('storage.googleapis.com') || host.includes('blob.core.windows.net')) return true;
    return true; // Accept any valid http/https URL that might host an SQL submission file
  } catch {
    return false;
  }
}

async function getSqlDownloadUrl(sub) {
  if (sub?.submission_file_url) {
    return await presignS3Url(sub.submission_file_url);
  }
  const link = (sub?.submission_link || '').trim();
  if (!link) return null;
  if (link.includes('.amazonaws.com/')) {
    return await presignS3Url(link);
  }
  // Convert Google Drive view / share links to direct raw download URL
  if (link.includes('drive.google.com') || link.includes('docs.google.com')) {
    const match = link.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                  link.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                  link.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  // Convert GitHub blob links to raw file content
  if (link.includes('github.com') && !link.includes('/raw/') && link.includes('/blob/')) {
    return link.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }
  return link;
}

function resolveEvaluatorType(evaluation, assignment = null) {
  let type = (
    assignment?.evaluator_type ||
    evaluation?.assignment_evaluator_type ||
    evaluation?.evaluator_type ||
    ''
  ).toString().trim().toUpperCase();

  // If type is not explicitly set, or is generic fallback ('JS', 'NONE', 'AI'),
  // verify against rubric, test cases, feedback, and assignment title to ensure correct evaluator matching.
  if (!type || type === 'NONE' || type === 'JS') {
    const testCasesStr = typeof (assignment?.test_cases || evaluation?.test_cases) === 'string'
      ? (assignment?.test_cases || evaluation?.test_cases)
      : JSON.stringify(assignment?.test_cases || evaluation?.test_cases || '');
    const rubricStr = typeof (assignment?.rubric || evaluation?.rubric) === 'string'
      ? (assignment?.rubric || evaluation?.rubric)
      : JSON.stringify(assignment?.rubric || evaluation?.rubric || '');
    const titleStr = (assignment?.title || evaluation?.assignment_name || '').toLowerCase();
    
    // Also inspect feedback / breakdown if evaluation contains results or feedback
    let feedbackStr = '';
    if (evaluation?.results && Array.isArray(evaluation.results)) {
      feedbackStr = JSON.stringify(evaluation.results.map(r => r.feedback || ''));
    } else if (evaluation?.feedback) {
      feedbackStr = typeof evaluation.feedback === 'string' ? evaluation.feedback : JSON.stringify(evaluation.feedback);
    }

    const combined = (testCasesStr + ' ' + rubricStr + ' ' + titleStr + ' ' + feedbackStr).toLowerCase();

    if (
      combined.includes('formula_range_check') ||
      combined.includes('acceptedfunctions') ||
      combined.includes('openxml') ||
      combined.includes('vlookup') ||
      combined.includes('pivot_check') ||
      combined.includes('excel') ||
      combined.includes('spreadsheet') ||
      combined.includes('.xlsx') ||
      combined.includes('.csv') ||
      combined.includes('sumif')
    ) {
      type = 'EXCEL';
    } else if (
      combined.includes('inner join') ||
      combined.includes('left join') ||
      combined.includes('right join') ||
      combined.includes('full outer') ||
      combined.includes('cross join') ||
      combined.includes('referencequery') ||
      combined.includes('astrequirements') ||
      combined.includes('setupsql') ||
      combined.includes('query_only') ||
      combined.includes('data modeling') ||
      combined.includes('data model') ||
      combined.includes('create table') ||
      combined.includes('alter table') ||
      combined.includes('foreign key') ||
      combined.includes('primary key') ||
      combined.includes('database') ||
      combined.includes('schema') ||
      combined.includes('ddl') ||
      combined.includes('.sql') ||
      combined.includes('join ') ||
      combined.includes('sql') ||
      combined.includes('select ')
    ) {
      type = 'SQL';
    } else if (
      combined.includes('def ') ||
      combined.includes('pytest') ||
      combined.includes('python') ||
      combined.includes('.py')
    ) {
      type = 'PYTHON';
    } else if (
      combined.includes('components render correctly') ||
      combined.includes('state updates') ||
      combined.includes('props handling') ||
      combined.includes('react') ||
      combined.includes('.jsx') ||
      combined.includes('.tsx')
    ) {
      type = 'REACT';
    } else if (
      combined.includes('api endpoints') ||
      combined.includes('controller logic') ||
      combined.includes('database operations')
    ) {
      type = 'AI';
    }
  }

  return type || 'JS';
}

exports.runEvaluation = async (req, res) => {
  const { assignmentId, projectId, evaluatorType: reqEvaluatorType, scope = 'pending' } = req.body;
  const targetId = projectId || assignmentId;

  if (!targetId) {
    return res.status(400).json({ success: false, message: 'Assignment or Project ID is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let assignment = null;
    let isCollegeAssignment = false;
    let isProject = false;

    // 0. If projectId is explicitly provided, fetch project
    if (projectId) {
      const projRes = await client.query(
        `SELECT p.id, p.title, p.evaluator_type, p.test_cases, p.rubric, p.max_score, 'project' as type, t.subject_id
         FROM projects p
         JOIN topics t ON p.topic_id = t.id
         WHERE p.id = $1`,
        [projectId],
      );
      assignment = projRes.rows[0];
      if (assignment) isProject = true;
    }

    if (!assignment && assignmentId) {
      // 1. Try fetching from curriculum assignments first
      let assignmentRes = await client.query(
        `SELECT a.id, a.title, a.evaluator_type, a.test_cases, a.rubric, 'unit' as type, t.subject_id
         FROM assignments a
         JOIN units u ON a.unit_id = u.id
         JOIN topics t ON u.topic_id = t.id
         WHERE a.id = $1`,
        [assignmentId],
      );

      assignment = assignmentRes.rows[0];

      // 2. If not found, try facilitator-created college assignments
      if (!assignment) {
        assignmentRes = await client.query(
          `SELECT id, title, evaluator_type, test_cases, rubric, 'college' as type, college_id, created_by, course
           FROM college_assignments
           WHERE id = $1`,
          [assignmentId],
        );
        assignment = assignmentRes.rows[0];
        isCollegeAssignment = !!assignment;
      }

      // 3. Fallback: check if assignmentId was actually a projectId
      if (!assignment) {
        const projRes = await client.query(
          `SELECT p.id, p.title, p.evaluator_type, p.test_cases, p.rubric, p.max_score, 'project' as type, t.subject_id
           FROM projects p
           JOIN topics t ON p.topic_id = t.id
           WHERE p.id = $1`,
          [assignmentId],
        );
        assignment = projRes.rows[0];
        if (assignment) isProject = true;
      }
    }

    if (!assignment) {
      throw new Error('Assignment or Project not found');
    }

    // Guard facilitator access
    if (req.user.role === 'facilitator') {
      const subjectIds = req.user.subject_ids || [];
      const collegeIds = req.user.college_ids || [];
      if (isProject || !isCollegeAssignment) {
        if (!subjectIds.includes(assignment.subject_id)) {
          throw new Error('Access denied: Item does not belong to your assigned subjects');
        }
      } else {
        if (!collegeIds.includes(assignment.college_id)) {
          throw new Error('Access denied: Assignment belongs to a college not assigned to you');
        }
        const isAuthor = assignment.created_by === req.user.id;
        let isSubjectAssigned = assignment.course === 'General';
        if (!isSubjectAssigned && assignment.course && subjectIds.length > 0) {
          const check = await client.query(
            `SELECT 1 FROM subjects 
             WHERE (id::text = $1 OR slug = $1 OR name = $1) 
               AND id = ANY($2::uuid[]) AND is_deleted = false`,
            [assignment.course, subjectIds],
          );
          isSubjectAssigned = check.rows.length > 0;
        }
        if (!isAuthor && !isSubjectAssigned) {
          throw new Error('Access denied: Assignment does not belong to your assigned subjects');
        }
      }
    }

    // 3. Get submissions from the correct table.
    // scope: 'pending' (default) evaluates only submissions with no completed
    // result yet; 'all' re-evaluates every submission regardless of history.
    const scopeFilter =
      scope === 'pending'
        ? ` AND s.id NOT IN (
              SELECT r.submission_id FROM evaluation_results r
              JOIN evaluations e ON r.evaluation_id = e.id
              WHERE (e.assignment_id = $1 OR e.college_assignment_id = $1 OR e.project_id = $1) AND r.status = 'completed'
            )`
        : '';

    const subParams = [targetId];
    let facSubFilter = '';
    if (req.user.role === 'facilitator') {
      subParams.push(req.user.college_ids || []);
      facSubFilter = ` AND sp.college_id = ANY($${subParams.length}::uuid[])`;
    }

    const queryStr = isProject
      ? `SELECT
          s.id as submission_id,
          s.submission_link,
          s.user_id,
          u.full_name as student_name
         FROM project_submissions s
         JOIN users u ON s.user_id = u.id
         JOIN student_profiles sp ON sp.user_id = u.id
         WHERE s.project_id = $1${scopeFilter}${facSubFilter}`
      : isCollegeAssignment
      ? `SELECT
          s.id as submission_id,
          s.submission_type,
          s.submission_link,
          s.submission_file_url,
          s.submission_file_name,
          s.student_id as user_id,
          u.full_name as student_name
         FROM college_assignment_submissions s
         JOIN users u ON s.student_id = u.id
         JOIN student_profiles sp ON sp.user_id = u.id
         WHERE s.assignment_id = $1${scopeFilter}${facSubFilter}`
      : `SELECT
          s.id as submission_id,
          s.submission_type,
          s.submission_link,
          s.submission_file_url,
          s.submission_file_name,
          s.user_id,
          u.full_name as student_name
         FROM assignment_submissions s
         JOIN users u ON s.user_id = u.id
         JOIN student_profiles sp ON sp.user_id = u.id
         WHERE s.assignment_id = $1${scopeFilter}${facSubFilter}`;

    const submissionsRes = await client.query(queryStr, subParams);
    const submissions = submissionsRes.rows;

    if (!submissions.length) {
      throw new Error('No submissions found to evaluate');
    }

    let evaluatorType = reqEvaluatorType || assignment.evaluator_type;
    evaluatorType = resolveEvaluatorType({
      evaluator_type: evaluatorType,
      test_cases: assignment.test_cases,
      rubric: assignment.rubric,
      assignment_name: assignment.title,
    }, assignment);

    //  Create evaluation
    const evalRes = await client.query(
      isProject
        ? `INSERT INTO evaluations
           (project_id, evaluator_type, status, total_submissions)
           VALUES ($1, $2, 'running', $3)
           RETURNING *`
        : isCollegeAssignment
        ? `INSERT INTO evaluations
           (college_assignment_id, evaluator_type, status, total_submissions)
           VALUES ($1, $2, 'running', $3)
           RETURNING *`
        : `INSERT INTO evaluations
           (assignment_id, evaluator_type, status, total_submissions)
           VALUES ($1, $2, 'running', $3)
           RETURNING *`,
      [targetId, evaluatorType, submissions.length],
    );

    const evaluation = evalRes.rows[0];

    // Tier 1 Carry-Forward: If scope is 'pending', copy forward prior completed/failed results
    if (scope === 'pending') {
      const currentSubIds = submissions.map((s) => s.submission_id || s.id).filter(Boolean);
      const currentStudentIds = submissions.map((s) => s.user_id || s.student_id).filter(Boolean);
      const targetCol = isProject
        ? 'e.project_id'
        : isCollegeAssignment
        ? 'e.college_assignment_id'
        : 'e.assignment_id';
      const carryForwardRes = await client.query(
        `INSERT INTO evaluation_results (
          evaluation_id, submission_id, student_id, student_name, job_id, status, marks, feedback, status_url, created_at
        )
        SELECT 
          $1, 
          prev.submission_id, 
          prev.student_id, 
          prev.student_name, 
          prev.job_id, 
          prev.status, 
          prev.marks, 
          prev.feedback, 
          prev.status_url, 
          prev.created_at
        FROM (
          SELECT DISTINCT ON (COALESCE(r.student_id, r.submission_id)) r.*
          FROM evaluation_results r
          JOIN evaluations e ON r.evaluation_id = e.id
          WHERE ${targetCol}::text = $2::text
            AND r.status IN ('completed', 'failed')
            AND r.submission_id != ALL($3::uuid[])
            AND (r.student_id IS NULL OR r.student_id != ALL($4::uuid[]))
            AND (
              r.submission_id IS NULL OR r.submission_id IN (
                SELECT id FROM ${isCollegeAssignment ? 'college_assignment_submissions' : isProject ? 'project_submissions' : 'assignment_submissions'}
                WHERE ${isCollegeAssignment ? 'assignment_id' : isProject ? 'project_id' : 'assignment_id'} = $2
              )
            )
          ORDER BY COALESCE(r.student_id, r.submission_id), e.created_at DESC, r.created_at DESC
        ) prev
        ON CONFLICT (evaluation_id, submission_id) DO NOTHING
        RETURNING id`,
        [evaluation.id, targetId, currentSubIds, currentStudentIds]
      );
      const carriedOverCount = carryForwardRes.rowCount || 0;
      if (carriedOverCount > 0) {
        const totalCohortCount = submissions.length + carriedOverCount;
        await client.query(
          `UPDATE evaluations SET total_submissions = $1 WHERE id = $2`,
          [totalCohortCount, evaluation.id]
        );
        evaluation.total_submissions = totalCohortCount;
      }
    }

    //validation
    if (evaluatorType === 'JS' && !assignment.test_cases) {
      throw new Error('Test cases missing for JS evaluator');
    }
    if (evaluatorType === 'REACT' && !assignment.rubric) {
      throw new Error('Rubric missing for REACT evaluator');
    }

    const evaluatorUrl = `${process.env.CENTRAL_EVALUATOR_URL || 'http://localhost:4000'}/evaluate`;
    const evaluatorApiKey = process.env.CENTRAL_EVALUATOR_API_KEY;

    console.log('Evaluator service api & key: ', evaluatorUrl, evaluatorApiKey);

    let isMock = false;
    let jobIdsAndLinks = []; // { jobId, statusUrl, submissionId, studentName, studentId }

    try {
      const isExcelEvaluation = (evaluatorType === 'EXCEL' || evaluatorType === 'excel');
      const isSqlEvaluation = (evaluatorType === 'SQL' || evaluatorType === 'sql');

      // Filter submissions based on evaluator requirements
      let validSubmissions = [];
      let nonGitSubmissions = [];
      let invalidSubmissions = [];

      if (isExcelEvaluation) {
        validSubmissions = submissions.filter(
          (s) => !!(s.submission_file_url || (s.submission_link && isAllowedSpreadsheetUrl(s.submission_link)))
        );
        invalidSubmissions = submissions.filter(
          (s) => !(s.submission_file_url || (s.submission_link && isAllowedSpreadsheetUrl(s.submission_link)))
        );
      } else if (isSqlEvaluation) {
        validSubmissions = submissions.filter(
          (s) => !!(s.sql_text || s.sqlText || s.submission_file_url || (s.submission_link && isAllowedSqlUrl(s.submission_link)) || (s.ideFiles && s.ideFiles.length > 0))
        );
        invalidSubmissions = submissions.filter(
          (s) => !(s.sql_text || s.sqlText || s.submission_file_url || (s.submission_link && isAllowedSqlUrl(s.submission_link)) || (s.ideFiles && s.ideFiles.length > 0))
        );
      } else {
        validSubmissions = submissions.filter(
          (s) =>
            ((s.submission_type === 'github' || (!s.submission_type && s.submission_link)) && !!s.submission_link && isAllowedGitUrl(s.submission_link)) ||
            (s.submission_type === 'file' && !!s.submission_file_url) ||
            (!s.submission_link && !!s.submission_file_url) ||
            !!s.submission_file_url
        );
        nonGitSubmissions = submissions.filter(
          (s) =>
            s.submission_type &&
            s.submission_type !== 'github' &&
            s.submission_type !== 'file' &&
            !s.submission_file_url
        );
        invalidSubmissions = submissions.filter(
          (s) =>
            !validSubmissions.includes(s) && !nonGitSubmissions.includes(s)
        );
      }

      if (nonGitSubmissions.length > 0) {
        // Queue non-git submissions for manual facilitator review
        for (const nonGit of nonGitSubmissions) {
          const typeName = nonGit.submission_type || 'File';
          const pendingFeedback = JSON.stringify({
            summary: `${typeName.toUpperCase()} submission queued for manual facilitator review.`,
            strengths: [],
            issues: [],
            breakdown: [],
          });
          await client.query(
            `INSERT INTO evaluation_results
             (evaluation_id, submission_id, student_id, student_name, status, marks, feedback)
             VALUES ($1, $2, $3, $4, 'pending', 0, $5::jsonb)
             ON CONFLICT (evaluation_id, submission_id) DO UPDATE
             SET status = 'pending', marks = 0, feedback = EXCLUDED.feedback`,
            [
              evaluation.id,
              nonGit.submission_id || nonGit.id,
              nonGit.user_id || nonGit.student_id,
              nonGit.student_name,
              pendingFeedback,
            ],
          );
        }
      }

      if (invalidSubmissions.length > 0) {
        console.warn(
          `Skipped ${invalidSubmissions.length} submissions due to missing or non-git repoUrl.`,
        );
        // Instantly mark them as failed in the DB
        for (const invalid of invalidSubmissions) {
          let reason = isExcelEvaluation
            ? 'No spreadsheet URL or file provided by student.'
            : isSqlEvaluation
            ? 'No SQL query, file, Google Drive link, or repository provided by student.'
            : 'No repository URL provided by student.';
          if (invalid.submission_link) {
            try {
              const h = new URL(invalid.submission_link).hostname;
              reason = isExcelEvaluation
                ? `Invalid spreadsheet host (${h}). Submissions must be a Google Sheets link, OneDrive/SharePoint, or direct .xlsx file.`
                : isSqlEvaluation
                ? `Invalid SQL submission source (${h}). Submissions must be a .sql file, Google Drive share link, or git repository.`
                : `Invalid repository host (${h}). Submissions must be a public repository on GitHub, GitLab, or Bitbucket.`;
            } catch {
              reason = isExcelEvaluation
                ? 'Invalid spreadsheet URL format.'
                : isSqlEvaluation
                ? 'Invalid SQL URL format.'
                : 'Invalid repository URL format. Must be a valid HTTP/HTTPS git repository URL.';
            }
          }
          const failFeedback = JSON.stringify({
            summary: reason,
            strengths: [],
            issues: [reason],
            breakdown: [],
          });
          await client.query(
            `INSERT INTO evaluation_results
             (evaluation_id, submission_id, student_id, student_name, status, marks, feedback)
             VALUES ($1, $2, $3, $4, 'failed', 0, $5::jsonb)
             ON CONFLICT (evaluation_id, submission_id) DO UPDATE
             SET status = 'failed', marks = 0, feedback = EXCLUDED.feedback`,
            [
              evaluation.id,
              invalid.submission_id || invalid.id,
              invalid.user_id || invalid.student_id,
              invalid.student_name,
              failFeedback,
            ],
          );
        }
      }

      if (validSubmissions.length === 0 && nonGitSubmissions.length > 0) {
        // All submissions were non-git and queued for manual review
        await client.query(
          `UPDATE evaluations SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [evaluation.id],
        );
        await client.query('COMMIT');
        return res.json({
          success: true,
          message: 'Submissions recorded and queued for manual facilitator review.',
          data: { evaluationId: evaluation.id },
        });
      }

      if (validSubmissions.length === 0) {
        throw new Error(
          'No valid submissions with repository links found to evaluate.',
        );
      }

      // Create payloads based on evaluator type capabilities
      // visual, javascript, and excel accept batch arrays. backend and react accept singles.
      if (evaluatorType === 'EXCEL' || evaluatorType === 'excel') {
        let formattedRubric;
        if (assignment.rubric && Array.isArray(assignment.rubric)) {
          formattedRubric = { criteria: assignment.rubric };
        } else if (
          assignment.rubric &&
          assignment.rubric.criteria &&
          Array.isArray(assignment.rubric.criteria)
        ) {
          formattedRubric = assignment.rubric;
        } else {
          formattedRubric = {
            criteria: [{ name: 'Standard Grading', weight: 100 }],
          };
        }

        let rawTestCases = assignment.test_cases;
        while (typeof rawTestCases === 'string') {
          try {
            rawTestCases = JSON.parse(rawTestCases);
          } catch (e) {
            break;
          }
        }

        const payload = {
          type: 'excel',
          submissions: await Promise.all(
            validSubmissions.map(async (s) => ({
              submissionId: s.submission_id || s.id,
              fileUrl: await getSpreadsheetDownloadUrl(s),
              studentName: s.student_name,
              studentId: s.user_id || s.student_id,
            }))
          ),
          rubric: formattedRubric,
          testCases: Array.isArray(rawTestCases) ? rawTestCases : (rawTestCases?.testCases || []),
          assignmentId: targetId,
          skipCache: true,
          reEvaluate: true,
        };

        const response = await postToEvaluatorWithRetry(evaluatorUrl, payload, {
          headers: { 'x-api-key': evaluatorApiKey },
          timeout: 45000,
        });

        const jobs = response.data.jobs || [response.data];
        jobs.forEach((job, index) => {
          jobIdsAndLinks.push({
            jobId: job.jobId || job.id,
            statusUrl: job.statusUrl,
            submissionId:
              validSubmissions[index].submission_id ||
              validSubmissions[index].id,
            studentName: validSubmissions[index].student_name,
            studentId:
              validSubmissions[index].user_id ||
              validSubmissions[index].student_id,
          });
        });
      } else if (evaluatorType === 'SQL' || evaluatorType === 'sql') {
        let formattedRubric;
        if (assignment.rubric && Array.isArray(assignment.rubric)) {
          formattedRubric = { criteria: assignment.rubric };
        } else if (
          assignment.rubric &&
          assignment.rubric.criteria &&
          Array.isArray(assignment.rubric.criteria)
        ) {
          formattedRubric = assignment.rubric;
        } else {
          formattedRubric = {
            criteria: [{ name: 'SQL Query & Schema Verification', weight: 100 }],
          };
        }

        let rawManifest = assignment.test_cases || assignment.manifest;
        while (typeof rawManifest === 'string') {
          try {
            rawManifest = JSON.parse(rawManifest);
          } catch (e) {
            break;
          }
        }

        const manifestObj = typeof rawManifest === 'object' && rawManifest !== null ? { ...rawManifest } : {};
        if (!manifestObj.mode) {
          const combinedMeta = `${assignment.title || ''} ${JSON.stringify(assignment.rubric || '')} ${JSON.stringify(rawManifest || '')}`.toLowerCase();
          if (combinedMeta.includes('data model') || combinedMeta.includes('create table') || combinedMeta.includes('schema') || combinedMeta.includes('ddl') || combinedMeta.includes('foreign key')) {
            manifestObj.mode = 'script';
          }
        }

        const payload = {
          type: 'sql',
          submissions: await Promise.all(
            validSubmissions.map(async (s) => ({
              submissionId: s.submission_id || s.id,
              sqlText: s.sql_text || s.sqlText || (s.ideFiles && s.ideFiles.find((f) => (f.name || '').endsWith('.sql'))?.content),
              ideFiles: s.ideFiles,
              fileUrl: await getSqlDownloadUrl(s),
              studentName: s.student_name,
              studentId: s.user_id || s.student_id,
            }))
          ),
          rubric: formattedRubric,
          manifest: manifestObj,
          testCases: Array.isArray(rawManifest) ? rawManifest : (rawManifest?.testCases || []),
          assignmentId: targetId,
          assignmentTitle: assignment.title,
          skipCache: true,
          reEvaluate: true,
        };

        const response = await postToEvaluatorWithRetry(evaluatorUrl, payload, {
          headers: { 'x-api-key': evaluatorApiKey },
          timeout: 45000,
        });

        const jobs = response.data.jobs || [response.data];
        jobs.forEach((job, index) => {
          jobIdsAndLinks.push({
            jobId: job.jobId || job.id,
            statusUrl: job.statusUrl,
            submissionId:
              validSubmissions[index].submission_id ||
              validSubmissions[index].id,
            studentName: validSubmissions[index].student_name,
            studentId:
              validSubmissions[index].user_id ||
              validSubmissions[index].student_id,
          });
        });
      } else if (evaluatorType === 'JS' || evaluatorType === 'VISUAL' || evaluatorType === 'javascript' || evaluatorType === 'visual' || evaluatorType === 'PYTHON' || evaluatorType === 'python') {
        const payloadType = (evaluatorType === 'JS') ? 'javascript' : (evaluatorType === 'VISUAL' ? 'visual' : (evaluatorType === 'PYTHON' ? 'python' : evaluatorType));
        
        let rawTestCases = assignment.test_cases;
        while (typeof rawTestCases === 'string') {
          try {
            rawTestCases = JSON.parse(rawTestCases);
          } catch (e) {
            break;
          }
        }

        let jsConfig = { testCases: rawTestCases };
        
        // If test_cases is a JSON object containing advanced JS configs, extract them
        if ((payloadType === 'javascript' || payloadType === 'python') && rawTestCases && typeof rawTestCases === 'object' && !Array.isArray(rawTestCases)) {
           jsConfig = {
             testCases: rawTestCases.testCases || [],
             evaluationMode: rawTestCases.evaluationMode || 'function',
             entryFunction: rawTestCases.entryFunction,
             entryFile: rawTestCases.entryFile,
             functions: rawTestCases.functions,
             expectedLogs: rawTestCases.expectedLogs
           };
        }

        const payload = {
          type: payloadType,
          submissions: await Promise.all(
            validSubmissions.map(async (s) => ({
              submissionId: s.submission_id || s.id,
              repoUrl: s.submission_file_url ? await presignS3Url(s.submission_file_url) : (s.submission_link ? await presignS3Url(s.submission_link) : null),
              studentName: s.student_name,
              studentId: s.user_id || s.student_id,
            }))
          ),
          ...jsConfig,
          rubricText: assignment.rubric
            ? JSON.stringify(assignment.rubric)
            : 'Standard evaluation',
          expectedUrl: assignment.expected_url || 'https://example.com',
          assignmentId: targetId,
          skipCache: true,
          reEvaluate: true,
        };

        const response = await postToEvaluatorWithRetry(evaluatorUrl, payload, {
          headers: { 'x-api-key': evaluatorApiKey },
          timeout: 45000, // generous: Render free-tier evaluator service can take ~15-20s to cold-start when idle
        });

        // jobs returns an array
        const jobs = response.data.jobs || [response.data]; // fallback if it returns single job
        jobs.forEach((job, index) => {
          jobIdsAndLinks.push({
            jobId: job.jobId || job.id,
            statusUrl: job.statusUrl,
            submissionId:
              validSubmissions[index].submission_id ||
              validSubmissions[index].id,
            studentName: validSubmissions[index].student_name,
            studentId:
              validSubmissions[index].user_id ||
              validSubmissions[index].student_id,
          });
        });
      } else {
        const typeMap = {
          REACT: 'react',
          PYTHON: 'python',
          FULLSTACK: 'fullstack',
          AI: 'backend',
        };
        const payloadType =
          typeMap[evaluatorType] ||
          typeMap[evaluatorType.toUpperCase()] ||
          'backend';

        let formattedRubric;
        if (assignment.rubric && Array.isArray(assignment.rubric)) {
          formattedRubric = { criteria: assignment.rubric };
        } else if (
          assignment.rubric &&
          assignment.rubric.criteria &&
          Array.isArray(assignment.rubric.criteria)
        ) {
          formattedRubric = assignment.rubric;
        } else {
          formattedRubric = {
            criteria: [{ name: 'Standard Grading', weight: 100 }],
          };
        }

        let testCasesObj = assignment.test_cases;
        if (typeof testCasesObj === 'string') {
          try {
            testCasesObj = JSON.parse(testCasesObj);
          } catch (e) {
            console.error('Failed to parse test_cases:', e);
          }
        }
        if (testCasesObj && testCasesObj.specFile) {
          formattedRubric.specFile = testCasesObj.specFile;
        }
        for (const s of validSubmissions) {
          const targetRepoUrl = s.submission_file_url
            ? await presignS3Url(s.submission_file_url)
            : (s.submission_link ? await presignS3Url(s.submission_link) : null);
          const payload = {
            type: payloadType,
            submissionId: s.submission_id || s.id,
            repoUrl: targetRepoUrl,
            rubric: formattedRubric,
          };
          
          console.log("EVALUATOR URL IS:", evaluatorUrl);
          const response = await axios.post(evaluatorUrl, payload, {
            headers: { 'x-api-key': evaluatorApiKey },
            timeout: 45000, // generous: Render free-tier evaluator service can take ~15-20s to cold-start when idle
          });

          jobIdsAndLinks.push({
            jobId: response.data.jobId || response.data.id,
            statusUrl: response.data.statusUrl,
            submissionId: s.submission_id || s.id,
            studentName: s.student_name,
            studentId: s.user_id || s.student_id,
          });
        }
      }

      console.log(`Queued ${jobIdsAndLinks.length} jobs via API`);

      // Save pending jobs in database
      for (const j of jobIdsAndLinks) {
        await client.query(
          `INSERT INTO evaluation_results
           (evaluation_id, submission_id, student_id, student_name, job_id, status, status_url)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6)
           ON CONFLICT (evaluation_id, submission_id) DO UPDATE
           SET job_id = EXCLUDED.job_id, status = 'pending', status_url = EXCLUDED.status_url`,
          [
            evaluation.id,
            j.submissionId,
            j.studentId,
            j.studentName,
            j.jobId,
            j.statusUrl,
          ],
        );
      }
    } catch (apiError) {
      if (apiError.response) {
        const errorMsg =
          apiError.response.data?.error || apiError.response.statusText;
        console.error('Evaluator API rejected request:', errorMsg);
        throw new Error(`Evaluator API rejected the request: ${errorMsg}`);
      } else if (apiError.request) {
        console.error('Evaluator API unreachable:', apiError.message);
        throw new Error(
          'Central evaluators API is currently unreachable. Please ensure the evaluator service is running.',
        );
      } else {
        console.error('Evaluator API setup failed:', apiError.message);
        throw new Error(`Evaluator API failed: ${apiError.message}`);
      }
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      evaluationId: evaluation.id,
      isMock,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.log('Evaluation Error:', error);
    // Explicitly return the error message so the frontend doesn't mask it
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};

exports.syncEvaluationStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify evaluation exists
    const evalRes = await pool.query(
      `SELECT id, status, total_submissions, evaluator_type FROM evaluations WHERE id = $1`,
      [id],
    );

    if (!evalRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Evaluation not found' });
    }

    // Count actual rows — don't trust the cached status field
    // (new students can be added after evaluation starts, making the cached counts stale)
    const countsRes = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('completed','failed') THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
       FROM evaluation_results
       WHERE evaluation_id = $1`,
      [id],
    );

    const totalRows     = parseInt(countsRes.rows[0].total)       || 0;
    const doneRows      = parseInt(countsRes.rows[0].done)        || 0;
    const pendingRows   = parseInt(countsRes.rows[0].pending_count) || 0;

    // If there are no pending rows at all, we're done — return immediately
    if (pendingRows === 0 && totalRows > 0) {
      await pool.query(`UPDATE evaluations SET status = 'completed' WHERE id = $1`, [id]);
      return res.json({
        success: true,
        progress: { total: totalRows, completed: doneRows, isFinished: true },
      });
    }

    // Fetch all pending jobs and try to advance them
    const pendingJobsRes = await pool.query(
      `SELECT id, job_id, status_url, submission_id, student_id, created_at
       FROM evaluation_results
       WHERE evaluation_id = $1 AND status = 'pending'`,
      [id],
    );

    let newlyCompleted = 0;
    const baseUrl = process.env.CENTRAL_EVALUATOR_URL || 'http://localhost:4000';

    // Batch Status Optimization: Query all job statuses in a single HTTP request (< 100ms)
    // rather than firing N individual sequential HTTP requests across hundreds of students.
    const activeJobIds = pendingJobsRes.rows.map((j) => {
      const urlId = (j.status_url || '').split('/').pop();
      return j.job_id || urlId;
    }).filter(Boolean);
    const batchMap = new Map();

    if (activeJobIds.length > 0) {
      try {
        let evalType = (evalRes.rows[0]?.evaluator_type || '').toLowerCase();
        if (!evalType && pendingJobsRes.rows[0]?.status_url) {
          const parts = pendingJobsRes.rows[0].status_url.split('/');
          evalType = (parts[2] || '').toLowerCase();
        }
        const batchResponse = await axios.post(
          `${baseUrl}/jobs/batch-status`,
          { type: evalType || undefined, jobIds: activeJobIds },
          {
            headers: { 'x-api-key': process.env.CENTRAL_EVALUATOR_API_KEY },
            timeout: 10000,
          },
        );
        if (batchResponse.data?.success && Array.isArray(batchResponse.data.statuses)) {
          for (const s of batchResponse.data.statuses) {
            if (s && s.id) {
              batchMap.set(String(s.id), s);
            }
          }
        }
      } catch (batchErr) {
        console.warn(`[Sync] Batch status endpoint query failed (${batchErr.message}).`);
      }
    }

    for (const job of pendingJobsRes.rows) {
      try {
        if (!job.status_url && !job.job_id) {
          // Job has no status URL — it was never queued.
          // Auto-fail after 10 minutes so the UI stops polling.
          const createdAtTime = job.created_at ? new Date(job.created_at).getTime() : Date.now();
          const ageMinutes = (Date.now() - createdAtTime) / 60000;
          if (ageMinutes > 10) {
            const failFeedback = JSON.stringify({
              summary: 'This submission was not sent to the grader (submitted after evaluation started). Please use "Evaluate Selected" to re-evaluate this student.',
              strengths: [],
              issues: ['Submission not queued for evaluation'],
              breakdown: [],
            });
            await pool.query(
              `UPDATE evaluation_results SET status = 'failed', marks = 0, feedback = $1::jsonb WHERE id = $2`,
              [failFeedback, job.id],
            );
            newlyCompleted++;
          }
          continue;
        }

        const lookupId = job.job_id || (job.status_url || '').split('/').pop();
        let jobData = null;
        if (lookupId && batchMap.has(String(lookupId))) {
          jobData = batchMap.get(String(lookupId));
        } else if (batchMap.size === 0 && job.status_url) {
          // Only fall back to individual GET if batch status call failed completely
          try {
            const url = `${baseUrl}${job.status_url}`;
            const response = await axios.get(url, {
              headers: { 'x-api-key': process.env.CENTRAL_EVALUATOR_API_KEY },
              timeout: 3000,
            });
            jobData = response.data.job || response.data;
          } catch {}
        }

        if (!jobData) continue;

        const jobState = jobData.status || jobData.state;

        if (jobState === 'completed' || jobState === 'failed') {
          console.log(`Job ${job.id} state: ${jobState}`);
          let marks = 0;
          let feedback = '';
          let rowStatus = 'completed';

          if (jobState === 'completed' && jobData.result) {
            const resData =
              jobData.result.results ||
              jobData.result.evaluation ||
              jobData.result.result ||
              jobData.result;
            const finalData = Array.isArray(resData) ? resData[0] : resData;

            if (!finalData || (typeof finalData === 'object' && Object.keys(finalData).length === 0)) {
              rowStatus = 'failed';
              feedback = {
                summary: 'Evaluation completed without scoring output from grader. Please re-evaluate.',
                strengths: [],
                issues: ['Grader returned empty evaluation result'],
                breakdown: [],
              };
            } else {
              marks = finalData?.score ?? finalData?.marks ?? 0;
              if (marks !== null && typeof marks === 'object' && marks.score !== undefined) {
                marks = marks.score;
              }
              feedback =
                finalData?.rubricFeedback ||
                finalData?.feedback ||
                finalData?.error ||
                'Evaluation completed.';
              if (typeof feedback === 'string') {
                try {
                  const parsedFb = JSON.parse(feedback);
                  if (parsedFb && typeof parsedFb === 'object') {
                    feedback = parsedFb;
                  } else {
                    const s = String(feedback || '').trim();
                    feedback = { summary: s && s !== '""' && s !== "''" ? s : 'Evaluation completed.', strengths: [], issues: [], breakdown: [] };
                  }
                } catch {
                  const s = String(feedback || '').trim();
                  feedback = { summary: s && s !== '""' && s !== "''" ? s : 'Evaluation completed.', strengths: [], issues: [], breakdown: [] };
                }
              }

              if (feedback && typeof feedback === 'object') {
                if (!feedback.cell_evidence && (finalData?.cell_evidence || finalData?.assertion_results)) {
                  feedback.cell_evidence = finalData.cell_evidence || finalData.assertion_results;
                }
                const bList = feedback.breakdown || feedback.rubric_breakdown;
                if (Array.isArray(bList) && bList.length > 0) {
                  const bSum = bList.reduce((acc, it) => acc + (Number(it.awarded ?? it.score ?? it.points ?? it.marks ?? 0)), 0);
                  if (bSum > 0 && marks !== bSum) {
                    console.log(`[Sync] Harmonizing marks (${marks} -> ${bSum}) to match rubric breakdown sum`);
                    marks = bSum;
                  }
                }
              }

              // Universal access & failure detection across all evaluators (SQL, Excel, React, Backend, Python, JS, Visual)
              const isExplicitFailure =
                finalData?.evaluation_status === 'FAILED' ||
                finalData?.status === 'failed' ||
                finalData?.success === false;

              const fbSummary = String(
                (typeof feedback === 'object' ? (feedback?.summary || feedback?.issues?.[0]) : feedback) || ''
              ).toLowerCase();

              const isAccessOrPermissionFailure =
                fbSummary.includes('private or restricted') ||
                fbSummary.includes('permission denied') ||
                fbSummary.includes('access denied') ||
                fbSummary.includes('anyone with the link') ||
                fbSummary.includes('returned an html web page instead of') ||
                fbSummary.includes('returned an html preview') ||
                fbSummary.includes('empty submission — no sql') ||
                fbSummary.includes('no sql content was found') ||
                fbSummary.includes('not public') ||
                fbSummary.includes('repository not found') ||
                fbSummary.includes('could not read username') ||
                fbSummary.includes('authentication failed');

              if (isExplicitFailure || (marks === 0 && isAccessOrPermissionFailure)) {
                rowStatus = 'failed';
                const summaryText = typeof feedback === 'object' ? (feedback.summary || 'Submission access or evaluation failed.') : feedback;
                if (!String(summaryText).toLowerCase().startsWith('evaluation failed')) {
                  if (typeof feedback === 'object') {
                    feedback.summary = `Evaluation Failed: ${summaryText}`;
                    if (!feedback.issues || feedback.issues.length === 0) {
                      feedback.issues = [summaryText];
                    }
                  } else {
                    feedback = { summary: `Evaluation Failed: ${summaryText}`, strengths: [], issues: [summaryText], breakdown: [] };
                  }
                }
              }
            }
          } else {
            rowStatus = 'failed';
            const failureReason =
              jobData.failedReason ||
              (jobData.stacktrace && jobData.stacktrace[0] ? jobData.stacktrace[0].split('\n')[0] : null) ||
              jobData.error ||
              'Evaluation worker was interrupted or encountered an unexpected error. Please retry evaluation.';
            feedback = { summary: `Evaluation Failed: ${failureReason}`, strengths: [], issues: [failureReason], breakdown: [] };
          }

          await pool.query(
            `UPDATE evaluation_results SET status = $1, marks = $2, feedback = $3::jsonb WHERE id = $4`,
            [rowStatus, marks, JSON.stringify(feedback), job.id],
          );
          newlyCompleted++;

          // Also sync score and feedback into project_submissions if this was a project submission
          await pool.query(
            `UPDATE project_submissions
             SET score = $1, rubric_breakdown = $2::jsonb, is_approved = CASE WHEN $1 > 0 THEN true ELSE is_approved END, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [marks, JSON.stringify(feedback), job.submission_id],
          ).catch(() => {});

          if (job.student_id && jobState === 'completed') {
            notify({
              userId: job.student_id,
              type: 'assignment_graded',
              title: 'Assignment Graded',
              body: `Your submission has been evaluated. Score: ${marks}`,
              link: '/dashboard/student/assignments',
            });
          }
        }
      } catch (err) {
        console.error(`Failed to poll status for job ${job.job_id}:`, err.message);
      }
    }

    // Re-count after processing
    const finalCountRes = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('completed','failed') THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS still_pending
       FROM evaluation_results WHERE evaluation_id = $1`,
      [id],
    );

    const finalTotal   = parseInt(finalCountRes.rows[0].total)        || 0;
    const finalDone    = parseInt(finalCountRes.rows[0].done)         || 0;
    const stillPending = parseInt(finalCountRes.rows[0].still_pending) || 0;
    const isFinished   = stillPending === 0 && finalTotal > 0;

    if (isFinished) {
      await pool.query(`UPDATE evaluations SET status = 'completed', total_submissions = $2 WHERE id = $1`, [id, finalTotal]);
    }

    return res.json({
      success: true,
      progress: { total: finalTotal, completed: finalDone, isFinished },
    });
  } catch (error) {
    console.error('Sync Evaluation Error:', error);
    return serverError(res, error);
  }
};

exports.getLatestEvaluationByAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { rows } = await pool.query(
      `SELECT id FROM evaluations
       WHERE assignment_id = $1 OR college_assignment_id = $1 OR project_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [assignmentId],
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({
          success: false,
          message: 'No evaluation found for this assignment or project',
        });
    }
    res.json({ success: true, evaluationId: rows[0].id });
  } catch (error) {
    serverError(res, error);
  }
};

exports.getResultsByAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const isFacilitator = req.user.role !== 'admin';
    const facilitatorCollegeIds = req.user.college_ids || [];
    const facilitatorSubjectIds = req.user.subject_ids || [];

    if (isFacilitator) {
      if (facilitatorCollegeIds.length === 0 || facilitatorSubjectIds.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied: No colleges or subjects assigned' });
      }

      // Check curriculum assignment
      const curSubj = await pool.query(
        `SELECT t.subject_id FROM assignments a
         JOIN units u ON a.unit_id = u.id
         JOIN topics t ON u.topic_id = t.id
         WHERE a.id = $1`,
        [assignmentId],
      );
      if (curSubj.rows.length > 0) {
        if (!facilitatorSubjectIds.includes(curSubj.rows[0].subject_id)) {
          return res.status(403).json({ success: false, message: 'Access denied: Assignment does not belong to your assigned subjects' });
        }
      } else {
        // Check college assignment
        const colSubj = await pool.query(
          `SELECT ca.college_id, ca.course, ca.created_by FROM college_assignments ca WHERE ca.id = $1`,
          [assignmentId],
        );
        if (colSubj.rows.length > 0) {
          const ca = colSubj.rows[0];
          if (!facilitatorCollegeIds.includes(ca.college_id)) {
            return res.status(403).json({ success: false, message: 'Access denied: College not assigned to you' });
          }
          const isAuthor = ca.created_by === req.user.id;
          let isSubjectAssigned = ca.course === 'General';
          if (!isSubjectAssigned && ca.course && facilitatorSubjectIds.length > 0) {
            const check = await pool.query(
              `SELECT 1 FROM subjects 
               WHERE (id::text = $1 OR slug = $1 OR name = $1) 
                 AND id = ANY($2::uuid[]) AND is_deleted = false`,
              [ca.course, facilitatorSubjectIds],
            );
            isSubjectAssigned = check.rows.length > 0;
          }
          if (!isAuthor && !isSubjectAssigned) {
            return res.status(403).json({ success: false, message: 'Access denied: Assignment does not belong to your assigned subjects' });
          }
        } else {
          // Check capstone project
          const projSubj = await pool.query(
            `SELECT t.subject_id FROM projects p
             JOIN topics t ON p.topic_id = t.id
             WHERE p.id = $1`,
            [assignmentId],
          );
          if (projSubj.rows.length > 0) {
            if (!facilitatorSubjectIds.includes(projSubj.rows[0].subject_id)) {
              return res.status(403).json({ success: false, message: 'Access denied: Project does not belong to your assigned subjects' });
            }
          }
        }
      }
    }

    // Check if evaluation exists
    const evalRes = await pool.query(
      `SELECT e.*,
              COALESCE(NULLIF(c.evaluator_type, ''), NULLIF(a.evaluator_type, ''), NULLIF(p.evaluator_type, ''), e.evaluator_type) as evaluator_type,
              COALESCE(NULLIF(c.evaluator_type, ''), NULLIF(a.evaluator_type, ''), NULLIF(p.evaluator_type, ''), e.evaluator_type) as assignment_evaluator_type,
              COALESCE(c.title, a.title, p.title) as assignment_name,
              COALESCE(c.rubric, a.rubric, p.rubric) as rubric,
              COALESCE(c.test_cases, a.test_cases, p.test_cases) as test_cases
       FROM evaluations e
       LEFT JOIN college_assignments c ON (e.college_assignment_id = c.id OR e.assignment_id = c.id)
       LEFT JOIN assignments a ON (e.assignment_id = a.id AND c.id IS NULL)
       LEFT JOIN projects p ON (e.project_id = p.id OR (e.assignment_id = p.id AND c.id IS NULL))
       WHERE e.id::text = $1 OR e.assignment_id::text = $1 OR e.college_assignment_id::text = $1 OR e.project_id::text = $1
       ORDER BY e.created_at DESC LIMIT 1`,
      [assignmentId],
    );

    if (evalRes.rows.length > 0) {
      // Evaluation exists, fetch results just like getEvaluationResults
      const evaluation = evalRes.rows[0];
      const resolvedType = resolveEvaluatorType(evaluation);
      evaluation.evaluator_type = resolvedType;
      if (evaluation.id && evalRes.rows[0].evaluator_type !== resolvedType) {
        pool.query(`UPDATE evaluations SET evaluator_type = $1 WHERE id = $2`, [resolvedType, evaluation.id]).catch(() => {});
      }
      const resolvedAssignmentId =
        evaluation.college_assignment_id ||
        evaluation.project_id ||
        evaluation.assignment_id ||
        assignmentId;
      const values = [resolvedAssignmentId, evaluation.id || resolvedAssignmentId];
      let collegeFilter = '';
      if (isFacilitator) {
        values.push(facilitatorCollegeIds);
        collegeFilter = ` AND col.id = ANY($${values.length}::uuid[])`;
      }

      const resultsRes = await pool.query(
        `SELECT DISTINCT ON (COALESCE(r.student_id, r.submission_id))
                r.*,
                COALESCE(s.submission_link, cs.submission_link, ps.submission_link) as submission_link,
                cs.submission_file_url as submission_file_url,
                sp.expected_graduation_year,
                col.name as college_name,
                col.id as college_id
         FROM evaluation_results r
         JOIN evaluations e ON r.evaluation_id = e.id
         LEFT JOIN assignment_submissions s ON r.submission_id = s.id
         LEFT JOIN college_assignment_submissions cs ON r.submission_id = cs.id
         LEFT JOIN project_submissions ps ON r.submission_id = ps.id
         LEFT JOIN student_profiles sp ON r.student_id = sp.user_id
         LEFT JOIN colleges col ON sp.college_id = col.id
         WHERE (r.evaluation_id = $2 OR e.assignment_id::text = $1 OR e.college_assignment_id::text = $1 OR e.project_id::text = $1 OR e.id::text = $1)
           ${collegeFilter}
         ORDER BY COALESCE(r.student_id, r.submission_id),
                  e.created_at DESC,
                  r.created_at DESC`,
        values,
      );

      const results = await Promise.all(
        resultsRes.rows.map(async (row) => {
          let effectiveMarks = row.marks;
          let effectiveStatus = row.status;
          let fb = row.feedback;
          if (row.feedback) {
            if (typeof fb === 'string') {
              try { fb = JSON.parse(fb); } catch {}
            }
            if (fb && typeof fb === 'object') {
              const bList = fb.breakdown || fb.rubric_breakdown;
              if (Array.isArray(bList) && bList.length > 0) {
                const bSum = bList.reduce((acc, it) => acc + (Number(it.awarded ?? it.score ?? it.points ?? it.marks ?? 0)), 0);
                if (bSum > 0) {
                  effectiveMarks = bSum;
                }
              }
            }
          }
          const fbSummary = String(
            (typeof fb === 'object' ? (fb?.summary || fb?.message || fb?.issues?.[0]) : fb) || ''
          ).toLowerCase();
          if (
            effectiveStatus !== 'failed' &&
            effectiveStatus !== 'pending' &&
            effectiveStatus !== 'evaluating' &&
            effectiveStatus !== 'running' &&
            (effectiveMarks === 0 || row.marks === 0) &&
            (
              fbSummary.includes('private or restricted') ||
              fbSummary.includes('permission denied') ||
              fbSummary.includes('access denied') ||
              fbSummary.includes('anyone with the link') ||
              fbSummary.includes('returned an html web page instead of') ||
              fbSummary.includes('could not read username') ||
              fbSummary.includes('authentication failed') ||
              fbSummary.includes('no sql content was found') ||
              fbSummary.includes('evaluation failed')
            )
          ) {
            effectiveStatus = 'failed';
            pool.query(`UPDATE evaluation_results SET status = 'failed' WHERE id = $1`, [row.id]).catch(() => {});
          }
          return {
            ...row,
            status: effectiveStatus,
            marks: effectiveMarks,
            submission_link: await presignS3Url(row.submission_link),
            submission_file_url: await presignS3Url(row.submission_file_url),
          };
        }),
      );

      // Also fetch any NEW submissions that arrived after the evaluation was triggered
      // (they will have no evaluation_results row yet — show them as pending)
      let isCollege = !!evaluation.college_assignment_id;
      let isProj = !!evaluation.project_id;
      if (!isCollege && !isProj && resolvedAssignmentId) {
        const checkCollege = await pool.query(`SELECT 1 FROM college_assignments WHERE id::text = $1`, [resolvedAssignmentId]);
        if (checkCollege.rows.length > 0) {
          isCollege = true;
        } else {
          const checkProj = await pool.query(`SELECT 1 FROM projects WHERE id::text = $1`, [resolvedAssignmentId]);
          if (checkProj.rows.length > 0) isProj = true;
        }
      }
      const evaluatedSubmissionIds = resultsRes.rows.map((r) => r.submission_id).filter(Boolean);

      let newSubValues = [resolvedAssignmentId];
      let newSubCollegeFilter = '';
      if (isFacilitator) {
        newSubValues.push(facilitatorCollegeIds);
        newSubCollegeFilter = ' AND col.id = ANY($2::uuid[])';
      }

      let newSubQuery = '';
      if (isCollege) {
        newSubQuery = `
          SELECT s.id as submission_id,
                 s.submission_link,
                 s.submission_file_url,
                 s.student_id as student_id,
                 u.full_name as student_name,
                 sp.expected_graduation_year,
                 col.name as college_name,
                 col.id as college_id
          FROM college_assignment_submissions s
          JOIN users u ON s.student_id = u.id
          LEFT JOIN student_profiles sp ON u.id = sp.user_id
          LEFT JOIN colleges col ON sp.college_id = col.id
          WHERE s.assignment_id::text = $1${newSubCollegeFilter}
        `;
      } else if (isProj) {
        newSubQuery = `
          SELECT s.id as submission_id,
                 s.submission_link,
                 null as submission_file_url,
                 s.user_id as student_id,
                 u.full_name as student_name,
                 sp.expected_graduation_year,
                 col.name as college_name,
                 col.id as college_id
          FROM project_submissions s
          JOIN users u ON s.user_id = u.id
          LEFT JOIN student_profiles sp ON u.id = sp.user_id
          LEFT JOIN colleges col ON sp.college_id = col.id
          WHERE s.project_id::text = $1${newSubCollegeFilter}
        `;
      } else {
        newSubQuery = `
          SELECT s.id as submission_id,
                 s.submission_link,
                 null as submission_file_url,
                 s.user_id as student_id,
                 u.full_name as student_name,
                 sp.expected_graduation_year,
                 col.name as college_name,
                 col.id as college_id
          FROM assignment_submissions s
          JOIN users u ON s.user_id = u.id
          LEFT JOIN student_profiles sp ON u.id = sp.user_id
          LEFT JOIN colleges col ON sp.college_id = col.id
          WHERE s.assignment_id::text = $1${newSubCollegeFilter}
        `;
      }

      const allSubsRes = await pool.query(newSubQuery, newSubValues);

      // Deduplicate by student_id too — if a student re-submitted after evaluation,
      // their old submission_id is in evaluation_results but the new one isn't.
      // We must not show them as pending again if they were already evaluated.
      const evaluatedStudentIds = resultsRes.rows.map((r) => r.student_id).filter(Boolean);

      const pendingNewResults = await Promise.all(
        allSubsRes.rows
          .filter((s) => 
            !evaluatedSubmissionIds.includes(s.submission_id) &&
            !evaluatedStudentIds.includes(s.student_id)
          )
          .map(async (row) => ({
            ...row,
            submission_link: await presignS3Url(row.submission_link),
            submission_file_url: await presignS3Url(row.submission_file_url),
            status: 'not_evaluated',
            marks: null,
            feedback: null,
          }))
      );

      const allCombinedResults = [...results, ...pendingNewResults].sort((a, b) => {
        const nameA = (a.student_name || '').trim();
        const nameB = (b.student_name || '').trim();
        const cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return String(a.submission_id || a.id || '').localeCompare(String(b.submission_id || b.id || ''));
      });

      return res.json({
        success: true,
        evaluation: evaluation,
        results: allCombinedResults,
      });
    }

    // No evaluation exists, fetch all submissions and generate pending results
    const isCollegeAssignment = await pool.query(`SELECT id FROM college_assignments WHERE id::text = $1`, [assignmentId]);
    const isCollege = isCollegeAssignment.rows.length > 0;

    const isProjectAssignment = await pool.query(`SELECT id FROM projects WHERE id::text = $1`, [assignmentId]);
    const isProject = isProjectAssignment.rows.length > 0;

    let submissionQuery = '';
    let values = [assignmentId];

    if (isCollege) {
      submissionQuery = `
        SELECT s.id as submission_id,
               s.submission_link,
               s.submission_file_url,
               s.student_id as student_id,
               u.full_name as student_name,
               sp.expected_graduation_year,
               col.name as college_name,
               col.id as college_id
        FROM college_assignment_submissions s
        JOIN users u ON s.student_id = u.id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN colleges col ON sp.college_id = col.id
        WHERE s.assignment_id::text = $1
      `;
    } else if (isProject) {
      submissionQuery = `
        SELECT s.id as submission_id,
               s.submission_link,
               null as submission_file_url,
               s.user_id as student_id,
               u.full_name as student_name,
               sp.expected_graduation_year,
               col.name as college_name,
               col.id as college_id
        FROM project_submissions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN colleges col ON sp.college_id = col.id
        WHERE s.project_id = $1
      `;
    } else {
      submissionQuery = `
        SELECT s.id as submission_id,
               s.submission_link,
               null as submission_file_url,
               s.user_id as student_id,
               u.full_name as student_name,
               sp.expected_graduation_year,
               col.name as college_name,
               col.id as college_id
        FROM assignment_submissions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN student_profiles sp ON u.id = sp.user_id
        LEFT JOIN colleges col ON sp.college_id = col.id
        WHERE s.assignment_id = $1
      `;
    }

    if (isFacilitator) {
      values.push(facilitatorCollegeIds);
      submissionQuery += ` AND col.id = ANY($2::uuid[])`;
    }

    const submissionsRes = await pool.query(submissionQuery, values);

    const pendingResults = await Promise.all(
      submissionsRes.rows.map(async (row) => ({
        ...row,
        submission_link: await presignS3Url(row.submission_link),
        submission_file_url: await presignS3Url(row.submission_file_url),
        status: 'not_evaluated',
        marks: null,
        feedback: null,
      }))
    );

    let assignmentInfo;
    if (isCollege) {
      assignmentInfo = await pool.query(
        `SELECT title, evaluator_type, test_cases, rubric FROM college_assignments WHERE id::text = $1`,
        [assignmentId]
      );
    } else if (isProject) {
      assignmentInfo = await pool.query(
        `SELECT title, evaluator_type, test_cases, rubric FROM projects WHERE id::text = $1`,
        [assignmentId]
      );
    } else {
      assignmentInfo = await pool.query(
        `SELECT title, evaluator_type, test_cases, rubric FROM assignments WHERE id::text = $1`,
        [assignmentId]
      );
    }

    const resolvedFallbackType = resolveEvaluatorType(
      { evaluator_type: assignmentInfo.rows[0]?.evaluator_type },
      assignmentInfo.rows[0] || {}
    ) || 'REACT';

    pendingResults.sort((a, b) => {
      const nameA = (a.student_name || '').trim();
      const nameB = (b.student_name || '').trim();
      const cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return String(a.submission_id || a.id || '').localeCompare(String(b.submission_id || b.id || ''));
    });

    return res.json({
      success: true,
      evaluation: {
        id: null,
        assignment_id: assignmentId,
        assignment_name: assignmentInfo.rows[0]?.title || 'Capstone Project',
        evaluator_type: resolvedFallbackType,
        status: 'not_started',
        is_project: isProject,
      },
      results: pendingResults,
    });

  } catch (error) {
    serverError(res, error);
  }
};

exports.getEvaluationResults = async (req, res) => {
  try {
    const { id } = req.params;

    const evalRes = await pool.query(
      `SELECT e.*,
              COALESCE(NULLIF(c.evaluator_type, ''), NULLIF(a.evaluator_type, ''), NULLIF(p.evaluator_type, ''), e.evaluator_type) AS evaluator_type,
              COALESCE(c.evaluator_type, a.evaluator_type, p.evaluator_type) AS assignment_evaluator_type,
              COALESCE(c.test_cases, a.test_cases, p.test_cases) AS test_cases,
              COALESCE(a.title, c.title, p.title) as assignment_name,
              COALESCE(a.rubric, c.rubric, p.rubric) as rubric,
              COALESCE(t.subject_id, pt.subject_id) as curriculum_subject_id,
              c.college_id as college_assignment_college_id,
              c.course as college_assignment_course,
              c.created_by as college_assignment_created_by
       FROM evaluations e
       LEFT JOIN assignments a ON e.assignment_id = a.id
       LEFT JOIN units u ON a.unit_id = u.id
       LEFT JOIN topics t ON u.topic_id = t.id
       LEFT JOIN projects p ON e.project_id = p.id
       LEFT JOIN topics pt ON p.topic_id = pt.id
       LEFT JOIN college_assignments c ON e.college_assignment_id = c.id
       WHERE e.id = $1`,
      [id],
    );

    if (evalRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Evaluation not found' });
    }

    const evaluation = evalRes.rows[0];

    const resolvedEvalType = resolveEvaluatorType(evaluation, {
      evaluator_type: evaluation.assignment_evaluator_type,
      title: evaluation.assignment_name,
      test_cases: evaluation.test_cases,
      rubric: evaluation.rubric,
    });
    if (resolvedEvalType && resolvedEvalType !== evaluation.evaluator_type) {
      evaluation.evaluator_type = resolvedEvalType;
      pool.query(`UPDATE evaluations SET evaluator_type = $1 WHERE id = $2`, [resolvedEvalType, id]).catch(() => {});
    }
    const isFacilitator = req.user.role !== 'admin';
    const facilitatorCollegeIds = req.user.college_ids || [];
    const facilitatorSubjectIds = req.user.subject_ids || [];

    if (isFacilitator) {
      if (facilitatorCollegeIds.length === 0 || facilitatorSubjectIds.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied: No colleges or subjects assigned' });
      }
      if ((evaluation.assignment_id || evaluation.project_id) && evaluation.curriculum_subject_id) {
        if (!facilitatorSubjectIds.includes(evaluation.curriculum_subject_id)) {
          return res.status(403).json({ success: false, message: 'Access denied: Item does not belong to your assigned subjects' });
        }
      }
      if (evaluation.college_assignment_id && evaluation.college_assignment_college_id) {
        if (!facilitatorCollegeIds.includes(evaluation.college_assignment_college_id)) {
          return res.status(403).json({ success: false, message: 'Access denied: College not assigned to you' });
        }
        const isAuthor = evaluation.college_assignment_created_by === req.user.id;
        let isSubjectAssigned = evaluation.college_assignment_course === 'General';
        if (!isSubjectAssigned && evaluation.college_assignment_course && facilitatorSubjectIds.length > 0) {
          const check = await pool.query(
            `SELECT 1 FROM subjects 
             WHERE (id::text = $1 OR slug = $1 OR name = $1) 
               AND id = ANY($2::uuid[]) AND is_deleted = false`,
            [evaluation.college_assignment_course, facilitatorSubjectIds],
          );
          isSubjectAssigned = check.rows.length > 0;
        }
        if (!isAuthor && !isSubjectAssigned) {
          return res.status(403).json({ success: false, message: 'Access denied: Assignment does not belong to your assigned subjects' });
        }
      }
    }

    const values = [id];
    let collegeFilter = '';
    if (isFacilitator) {
      values.push(facilitatorCollegeIds);
      collegeFilter = ' AND col.id = ANY($2)';
    }

    const resultsRes = await pool.query(
      `SELECT r.*,
              COALESCE(s.submission_link, cs.submission_link, ps.submission_link) as submission_link,
              cs.submission_file_url as submission_file_url,
              sp.expected_graduation_year,
              col.name as college_name,
              col.id as college_id
       FROM evaluation_results r
       JOIN evaluations e ON r.evaluation_id = e.id
       LEFT JOIN assignment_submissions s ON r.submission_id = s.id AND e.assignment_id IS NOT NULL AND s.assignment_id = e.assignment_id
       LEFT JOIN college_assignment_submissions cs ON r.submission_id = cs.id AND e.college_assignment_id IS NOT NULL AND cs.assignment_id = e.college_assignment_id
       LEFT JOIN project_submissions ps ON r.submission_id = ps.id AND e.project_id IS NOT NULL AND ps.project_id = e.project_id
       LEFT JOIN student_profiles sp ON r.student_id = sp.user_id
       LEFT JOIN colleges col ON sp.college_id = col.id
       WHERE r.evaluation_id = $1${collegeFilter}
         AND (
           (e.assignment_id IS NOT NULL AND s.id IS NOT NULL) OR
           (e.college_assignment_id IS NOT NULL AND cs.id IS NOT NULL) OR
           (e.project_id IS NOT NULL AND ps.id IS NOT NULL) OR
           r.submission_id IS NULL
         )`,
      values,
    );

    const results = await Promise.all(
      resultsRes.rows.map(async (row) => {
        let effectiveMarks = row.marks;
        let effectiveStatus = row.status;
        let fb = row.feedback;
        if (row.feedback) {
          if (typeof fb === 'string') {
            try { fb = JSON.parse(fb); } catch {}
          }
          if (fb && typeof fb === 'object') {
            const bList = fb.breakdown || fb.rubric_breakdown;
            if (Array.isArray(bList) && bList.length > 0) {
              const bSum = bList.reduce((acc, it) => acc + (Number(it.awarded ?? it.score ?? it.points ?? it.marks ?? 0)), 0);
              if (bSum > 0) {
                effectiveMarks = bSum;
              }
            }
          }
        }
        const fbSummary = String(
          (typeof fb === 'object' ? (fb?.summary || fb?.message || fb?.issues?.[0]) : fb) || ''
        ).toLowerCase();
        if (
          effectiveStatus !== 'failed' &&
          (effectiveMarks === 0 || row.marks === 0) &&
          (
            fbSummary.includes('private or restricted') ||
            fbSummary.includes('permission denied') ||
            fbSummary.includes('access denied') ||
            fbSummary.includes('anyone with the link') ||
            fbSummary.includes('returned an html web page instead of') ||
            fbSummary.includes('could not read username') ||
            fbSummary.includes('authentication failed') ||
            fbSummary.includes('no sql content was found') ||
            fbSummary.includes('evaluation failed')
          )
        ) {
          effectiveStatus = 'failed';
          pool.query(`UPDATE evaluation_results SET status = 'failed' WHERE id = $1`, [row.id]).catch(() => {});
        }
        return {
          ...row,
          status: effectiveStatus,
          marks: effectiveMarks,
          submission_link: await presignS3Url(row.submission_link),
          submission_file_url: await presignS3Url(row.submission_file_url),
        };
      }),
    );

    res.json({
      success: true,
      evaluation: evaluation,
      results: results,
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.getAvailableEvaluators = (req, res) => {
  try {
    const evaluators = Object.keys(EVALUATOR_APIS).map((key) => ({
      id: key,
      name: EVALUATOR_APIS[key],
    }));
    res.json({ success: true, data: evaluators });
  } catch (error) {
    serverError(res, error);
  }
};

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com' 
});

exports.generateTestCases = async (req, res) => {
  try {
    const { title, instructions, evaluatorType, rubric } = req.body;

    if (!instructions) {
      return res.status(400).json({ success: false, message: "Instructions are required to generate test cases." });
    }

    let normalizedRubric = rubric;
    if (typeof rubric === 'string') {
      try {
        normalizedRubric = JSON.parse(rubric);
      } catch (e) {
        // keep as string or raw
      }
    }

    let systemPrompt;
    if (evaluatorType?.toLowerCase() === 'excel') {
      systemPrompt = `You are the world's foremost expert technical curriculum designer and spreadsheet engineer. Your task is to generate flawless, production-grade JSON test case configurations for an automated Excel spreadsheet grading system across ANY assignment domain (finance, business analysis, sales, HR, operations, science, engineering, basic marksheets, lookups, pivots, dashboards, text processing, or capstones).
    
Based on the Assignment Title, Instructions, and Evaluation Rubric provided, output ONLY a raw JSON array of test case objects. DO NOT output any markdown code blocks or explanations, just the raw JSON starting with [ and ending with ].

=============================================================
CRITICAL ARCHITECTURAL RULES (ZERO TOLERANCE FOR DEVIATION)
=============================================================

1. STRICT 1-TO-1 RUBRIC CRITERIA BINDING:
   - When an Evaluation Rubric is provided, EVERY generated test case MUST contain a "criterion" property whose value is an EXACT, VERBATIM, CHARACTER-FOR-CHARACTER copy of one of the "name" fields from the provided Evaluation Rubric.
   - DO NOT rephrase, DO NOT shorten, DO NOT append parentheticals like "(Text Functions)", and DO NOT invent custom criteria names.
   - EVERY criterion in the provided rubric MUST have at least one corresponding test case. If a criterion evaluates multiple aspects (e.g. "Table Formatting & Professional Structure" evaluating bold headers, currency, and percentages), create multiple distinct test cases all sharing that exact criterion name.
   - If no rubric is provided, analyze the instructions to generate 3-5 clean, professional criterion names and bind all test cases to them.

2. SPREADSHEET GRID GEOMETRY & COLUMN ALIGNMENT:
   - CAREFULLY check the column specifications in the instructions:
     * If the instructions define columns starting at Column A (e.g. "Col A", "Column A", "Cell A1", "Cell A3", "| Col A |"), you MUST use Column A! (e.g. Date in Col A, Sales Rep in Col A, Amount in Col B).
     * ONLY if the instructions explicitly mention a blank margin or state that data begins in Column B, should you shift to Column B.
     * NEVER shift tables to Columns B and C when the instructions state they reside in Columns A and B!
   - Identify which specific columns hold formulas, text, currency, and percentages based on the exact column letters or order described in the instructions.

3. DYNAMIC TEST CASE SCHEMAS WITH HEADER ANCHORS:
   - VERTICAL COLUMN ANCHORS: Include an "anchor" property containing the target column header name (e.g. "Profit Margin", "Contact", "Revenue", "Department") for vertical data and formula columns. This empowers the evaluation engine to dynamically find the student's column even if they insert helper columns or shift margins.
   - HORIZONTAL HEADER EXCLUSION RULE: DO NOT add an "anchor" property on "format_check" when checking a horizontal table header row (e.g. range "A1:F1" or "B2:I2")! Anchors are column finders and will collapse horizontal multi-column ranges into a single column.
   - SUMMARY FORMULA EXCLUSION RULE: DO NOT add an "anchor" on "function_check" when evaluating a summary total cell (e.g. range "F5:F5" with acceptedFunctions: ["SUM"])! The anchor label (e.g. "Grand Total") resides in an adjacent text cell (E5); adding the anchor redirects the function check to the text cell and causes a false failure. Use "range" directly without an anchor.
   - SUMMARY VALUE CHECKS: For "value_check", DO use the summary label as an anchor with direction "right" and offset 1 (e.g. anchor: "Grand Total", direction: "right", offset: 1, expectedValue: 8000).
   - NEVER specify a multi-column rectangle (like "D4:E35") when evaluating a single formula or function! Target ONLY the single formula column (e.g. "E4:E35") and provide the "anchor".

A. "formula_range_check" (Dynamic Calculations & Anti-Cheat):
   Verifies that a column contains dynamic calculated formulas without static hardcoded numbers or static math cheats (e.g. =1000).
   CRITICAL ARITHMETIC RULE: In Excel, basic math operations (multiplication *, division /, addition +, subtraction -) use operators like =F2*G2, NOT named functions! For all basic arithmetic operations, ALWAYS and ONLY use "formula_range_check". NEVER use "function_check" with "PRODUCT"!
   {
     "criterion": "<Exact Rubric Criterion Name>",
     "type": "formula_range_check",
     "sheet": "<Sheet Name>",
     "range": "J4:J35",
     "anchor": "Profit Margin",
     "mustBeFormula": true,
     "forbiddenConstants": true
   }

B. "function_check" (Specific Required Named Excel Functions):
   Verifies that specific built-in named Excel functions are actively used in formulas.
   DO NOT use function_check for simple arithmetic (*, +, -, /) or "PRODUCT".
   - Text cleaning (PROPER, TRIM, UPPER, LOWER):
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "function_check",
       "sheet": "<Sheet Name>",
       "range": "E4:E35",
       "anchor": "Contact",
       "acceptedFunctions": ["PROPER", "TRIM"]
     }
   - Text extraction & separation (LEFT, MID, RIGHT, FIND, SEARCH, TEXTBEFORE, TEXTAFTER, TRIM):
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "function_check",
       "sheet": "<Sheet Name>",
       "range": "D4:D35",
       "anchor": "First Name",
       "acceptedFunctions": ["LEFT", "MID", "RIGHT", "FIND", "SEARCH", "TEXTBEFORE", "TEXTAFTER", "TRIM"]
     }
   - Lookup functions (VLOOKUP, XLOOKUP, INDEX, MATCH):
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "function_check",
       "sheet": "<Sheet Name>",
       "range": "E4:E35",
       "anchor": "Department",
       "acceptedFunctions": ["VLOOKUP", "XLOOKUP", "INDEX"],
       "requireAbsoluteReferences": true
     }
   - Conditional aggregations & math (SUMIF, SUMIFS, COUNTIF, COUNTIFS, AVERAGEIF):
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "function_check",
       "sheet": "<Sheet Name>",
       "range": "B4:B13",
       "anchor": "Sum of Amount",
       "acceptedFunctions": ["SUMIF", "SUMIFS"]
     }
   - Summary total function check (DO NOT provide anchor; target exact formula cell):
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "function_check",
       "sheet": "<Sheet Name>",
       "range": "F5:F5",
       "acceptedFunctions": ["SUM"],
       "mustBeFormula": true
     }
   - Logical conditions (IF, IFS, AND, OR, IFERROR):
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "function_check",
       "sheet": "<Sheet Name>",
       "range": "G4:G35",
       "anchor": "Status",
       "acceptedFunctions": ["IF", "AND", "OR", "IFERROR"]
     }

C. "format_check" (Styling, Headers, Currency, Percentages):
   Tests styling and number formatting. ONLY test attributes explicitly requested in instructions!
   - Bold Table Header (HORIZONTAL ROW: DO NOT include anchor):
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "format_check",
       "sheet": "<Sheet Name>",
       "range": "A1:F1",
       "bold": true
     }
   - Bold Summary / Total Row:
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "format_check",
       "sheet": "<Sheet Name>",
       "range": "A14:B14",
       "bold": true
     }
   - Currency Formatting (VERTICAL COLUMN: include anchor):
     NOTE: In multi-sheet assignments, ONLY check currency on the presentation/Dashboard sheet where explicit currency styling was requested! Do NOT demand currency on raw database sheets unless explicitly asked.
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "format_check",
       "sheet": "<Sheet Name>",
       "range": "G4:H35",
       "anchor": "Sum of Amount",
       "numberFormat": "currency"
     }
   - Percentage Formatting (for Profit Margin, Growth Rates, Tax Rates):
     {
       "criterion": "<Exact Rubric Criterion Name>",
       "type": "format_check",
       "sheet": "<Sheet Name>",
       "range": "J4:J35",
       "anchor": "Profit Margin",
       "numberFormat": "percent"
     }

D. "data_check" (Data Entry Completeness & Non-Empty Records):
   Verifies that data rows are fully entered and no required fields are blank.
   Always target the actual populated columns (e.g. B4:I35), never blank spacer margins!
   {
     "criterion": "<Exact Rubric Criterion Name>",
     "type": "data_check",
     "sheet": "<Sheet Name>",
     "range": "B4:I35",
     "disallowBlanks": true
   }

E. "value_check" (Specific Fixed Numerical or Text Answers):
   CRITICAL ANTI-HALLUCINATION RULE:
   ONLY use "value_check" with "expectedValue" if the assignment instructions EXPLICITLY specify the exact starting numbers so the mathematical answer is uniquely determined.
   If students entered their own data or numbers were not given, NEVER use "value_check" with invented numbers or 0. Use "formula_range_check" or "function_check" instead!
   When checking totals, prefer dynamic anchors:
   {
     "criterion": "<Exact Rubric Criterion Name>",
     "type": "value_check",
     "sheet": "<Sheet Name>",
     "anchor": "Grand Total",
     "direction": "right",
     "offset": 1,
     "expectedValue": 25000,
     "tolerance": 1.0
   }

F. "chart_check" (Charts & Graphs):
   The engine scans all sheets across the workbook. Always keep chartType simple (e.g. "column", "bar", "line", "pie") and set minCharts to 1:
   {
     "criterion": "<Exact Rubric Criterion Name>",
     "type": "chart_check",
     "sheet": "<Sheet Name>",
     "minCharts": 1,
     "chartType": "column",
     "title": "Sales Performance"
   }

G. "pivot_check" (Pivot Tables & Data Modeling):
   Verifies that the student created native Pivot Table(s) or Data Model aggregations.
   CRITICAL COMPETENCY RULE:
   - Always set "minPivotTables": 1.
   - ONLY provide "requiredField" if the assignment instructions literally and explicitly mandate that specific field name.
   - If the instructions do not explicitly mandate exact field names, DO NOT invent arbitrary field names (like "Department" or "Product_ID")! Omit "requiredField" so the engine evaluates the student's true competency in building working Pivot Tables and aggregations.
   {
     "criterion": "<Exact Rubric Criterion Name>",
     "type": "pivot_check",
     "minPivotTables": 1
   }

H. "macro_check" (VBA Macros):
   {
     "criterion": "<Exact Rubric Criterion Name>",
     "type": "macro_check",
     "requireVba": true,
     "requiredSub": "CalculateTotal"
   }

4. RESILIENT SHEET TARGETING & ANCHORS:
   - If the instructions explicitly mandate a worksheet name (e.g. "You must name the sheet 'Dashboard'"), include "sheet": "<Sheet Name>".
   - If the sheet name is not explicitly prescribed in the instructions, DO NOT invent arbitrary sheet names (like "repository" or "Customers"). Omit "sheet" or use default "Sheet1" and provide the "anchor".
   - CRITICAL: Always include "anchor" on test cases where possible. The engine uses a 6-tier fuzzy resolver with synonyms (e.g. "Dashboard" matches "Summary", "Overview", "Sheet2") and scans cell anchors to find the correct sheet even if students keep default names like "Sheet1" or "Sheet2".

5. INTRODUCTORY / DATA ENTRY ONLY:
   If the instructions only ask students to enter data and format it with NO calculations requested, DO NOT generate "formula_range_check". Use "data_check" and "format_check".

Output ONLY the raw JSON array starting with [ and ending with ].`;
    } else if (evaluatorType?.toLowerCase() === 'sql') {
      systemPrompt = `You are the world's foremost expert Database Architect and SQL instructor. Your task is to generate flawless, production-grade JSON test case configurations for an automated PostgreSQL database grading system.

The grading engine evaluates student SQL submissions by executing their submitted SQL file/script or query in an isolated PostgreSQL database sandbox against test cases, comparing the result set mathematically with a canonical reference query.

Based on the Assignment Title, Instructions, and Evaluation Rubric provided, you must output ONLY a raw JSON object conforming to the SQL Evaluator manifest contract. DO NOT output any markdown blocks or explanations, just output the raw JSON string starting with { and ending with }.

=============================================================
CRITICAL RULES FOR SQL SCHEMA & TEST DATA (ZERO TOLERANCE FOR DEVIATION)
=============================================================

1. ZERO-TABLE & SYSTEM / CALCULATION QUERIES (CRITICAL):
   - If the assignment instructions describe an environment setup, installation check, connection check, version check, date/time check, or math calculation without custom user tables:
     * STRICT GROUNDING: You MUST inspect the instructions and extract the EXACT SQL statement requested (e.g. "SELECT 100 * 5 AS calculation_result;", "SELECT 10 * 5;", "SELECT version();", "SELECT now();").
     * ZERO TOLERANCE FOR HALLUCINATIONS: NEVER default to or substitute "SELECT version();" unless the instructions LITERALLY instruct the student to execute "SELECT version();"!
     * SINGLE QUERY CONSISTENCY: In query_only mode, the student executes one statement. Therefore, EVERY test case in the testCases array MUST use the EXACT SAME referenceQuery matching the instruction query. NEVER give different, conflicting referenceQuery values across test cases!
     * You MUST set "schema": "" (empty string).
     * You MUST set "setupSql": "" (empty string).
     * Set the root "referenceQuery" to the exact query extracted from instructions.
     * Set "mode": "query_only".
     * In "astRequirements", set "requiredClauses": [] and "forbiddenClauses": [].
     * DO NOT create fake or placeholder tables like departments or employees!
     * In "testCases", every testCase's "setupSql" MUST also be "" (empty string).
     * In "testCases", every testCase's "referenceQuery" MUST match the exact query extracted from the instructions.

2. DDL & SCRIPT MODE ASSIGNMENTS:
   - If the assignment instructions ask students to write a complete SQL script that creates tables (CREATE TABLE) and inserts records (INSERT INTO):
     * Set "mode": "script".
     * Set "referenceScript": "CREATE TABLE ...; CREATE TABLE ...;" (The canonical solution DDL/DML script matching the instructions).
     * Set "schema": "" (the student's script creates the tables).
     * Set "setupSql": "" (the student's script inserts data).
     * Set "referenceQuery" to a verification query (e.g. "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema();").

3. DOMAIN-SPECIFIC SCHEMA ADAPTATION (QUERY & PRACTICE LAB MODES):
   - If the assignment asks students to write SELECT queries against tables (single query or multi-step practice lab):
     * CAREFULLY analyze the Assignment Instructions to discover the exact tables, column names, and data types specified:
       - If hospital management: patients and appointments tables.
       - If e-commerce store: products, customers, and orders tables.
       - If university: students, courses, and enrollments tables.
       - NEVER default to departments and employees unless the instructions explicitly specify departments and employees!
     * Provide complete, valid PostgreSQL DDL in "schema" using "CREATE TABLE IF NOT EXISTS ..." with SERIAL PRIMARY KEY, INT, VARCHAR(N), NUMERIC(10,2), DATE, TIMESTAMP, BOOLEAN. Using "CREATE TABLE IF NOT EXISTS" ensures student scratchpad scripts never collide.
     * Provide clean, realistic multi-row seed data in "setupSql" (at least 3-6 rows per table).
     * MULTI-STEP / MULTI-QUERY LABS:
       - If the assignment has multiple steps or asks for multiple queries (e.g., Step 1: Top-N items, Step 2: Pagination with OFFSET):
         * Set "allowMultiStatements": true at the root level of the manifest.
         * In "testCases", map each rubric criterion/step to its own specific "referenceQuery" (e.g. Test Case 1 tests the Step 1 query, Test Case 2 tests the Step 2 query).
       - DO NOT forbid "CREATE" or "INSERT" in "forbiddenClauses" in practice labs—students frequently paste their local workbench scratchpads.
     * Set the root "referenceQuery" to the primary or final canonical query solving the prompt.

4. EXACT 1-TO-1 RUBRIC BINDING:
   - If an Evaluation Rubric is provided:
     * EVERY test case's "name" property MUST BE AN EXACT, VERBATIM COPY of one of the rubric criteria names.
     * Each test case's "weight" MUST match the weight of that rubric criterion.
     * Every criterion in the rubric must have at least one corresponding test case.
     * The sum of all test case weights across the testCases array MUST equal exactly 100.

5. PURE POSTGRESQL SYNTAX:
   - NEVER use MySQL backticks (\`column\`), MySQL AUTO_INCREMENT, or DATETIME. Always use standard PostgreSQL syntax.

=============================================================
MANIFEST SCHEMA TEMPLATE
=============================================================
{
  "contractVersion": "1.0",
  "mode": "query_only", // "query_only" or "script"
  "allowMultiStatements": true, // set to true if assignment has multiple query steps (e.g. Step 1 + Step 2) or allows practice scripts
  "dialect": "postgres",
  "schema": "CREATE TABLE IF NOT EXISTS ... (PostgreSQL DDL, or \"\" if no user tables are needed)",
  "setupSql": "INSERT INTO ... (PostgreSQL DML seed data, or \"\" if no user tables are needed)",
  "referenceQuery": "SELECT ... (Canonical optimal solution query)",
  "enforceOrder": false, // set to true ONLY if instructions explicitly require sorting via ORDER BY
  "enforceColumnNames": false, // set to true ONLY if instructions strictly mandate specific alias names
  "astRequirements": {
    "requiredClauses": [], // e.g. "JOIN", "GROUP BY", "HAVING", "ORDER BY", "WHERE", "LIMIT" (leave empty [] for system queries)
    "forbiddenClauses": []
  },
  "testCases": [
    // CRITICAL: The testCases array MUST contain one test case for EVERY criterion in the Evaluation Rubric (2, 3, 4, 5, etc.)
    {
      "name": "<Exact Rubric Criterion 1 Name>",
      "kind": "visible",
      "weight": 30,
      "referenceQuery": "SELECT ...",
      "enforceOrder": false,
      "setupSql": ""
    },
    {
      "name": "<Exact Rubric Criterion 2 Name>",
      "kind": "hidden",
      "weight": 35,
      "referenceQuery": "SELECT ...",
      "enforceOrder": false,
      "setupSql": ""
    },
    {
      "name": "<Exact Rubric Criterion 3 Name>",
      "kind": "hidden",
      "weight": 35,
      "referenceQuery": "SELECT ...",
      "enforceOrder": false,
      "setupSql": ""
    }
  ]
}

Output ONLY the raw JSON object starting with { and ending with }.`;
    } else {
      systemPrompt = `You are an expert technical curriculum designer. Your task is to generate strict JSON test case configurations for an automated code grading system.
    
Based on the Assignment Title, Instructions, and Evaluation Rubric provided by the user, you must output ONLY a raw JSON object that will be used by our JavaScript automated evaluator. DO NOT output any markdown blocks like \`\`\`json, just output the raw JSON string starting with { and ending with }.

CRITICAL RULE: Your generated test cases must closely align with the provided Evaluation Rubric criteria. Ensure that the tests verify exactly what the rubric expects the student to build.

If the assignment asks students to write global variables and use console.log (e.g. basic variables assignment), use "script" mode.
CRITICAL RULES FOR SCRIPT MODE:
1. A script executes exactly ONCE from top to bottom. It cannot test multiple conflicting variable values in a single run (like Test Case 1 vs Test Case 2 for the same variable).
2. If the instructions list multiple different scenarios for the SAME variables, ONLY generate \`expectedLogs\` for the VERY FIRST scenario. Ignore the other scenarios, as the student's script can only have one hardcoded state at a time.
3. Our evaluator uses an AI Judge to evaluate script outputs, so it's okay to just provide the core expected values (e.g. ["Rohit Sharma", "20"]). The AI Judge will handle students who add conversational text like "My name is Rohit Sharma".

Example output for script mode:
{
  "evaluationMode": "script",
  "expectedLogs": ["Expected log 1", "Expected log 2"]
}

If the assignment asks students to write a specific function with inputs and expected return values, use "function" mode.
Example output for function mode:
{
  "evaluationMode": "function",
  "entryFunction": "functionName",
  "testCases": [
    { "input": [arg1, arg2], "expected": expectedResult }
  ]
}

If you are unsure or it doesn't fit neatly into function mode, fallback to script mode.
Do not include any explanation.`;
    }

    let rubricList = [];
    if (Array.isArray(normalizedRubric)) {
      rubricList = normalizedRubric;
    } else if (normalizedRubric && Array.isArray(normalizedRubric.criteria)) {
      rubricList = normalizedRubric.criteria;
    }
    const rubricNames = rubricList.map((r) => (typeof r === 'string' ? r : r.name || '')).filter(Boolean);

    // Fuzzy matching helper to snap any slight paraphrasing to exact rubric name
    const snapToExactRubricName = (criterionName) => {
      if (!criterionName || rubricNames.length === 0) return criterionName;
      if (rubricNames.includes(criterionName)) return criterionName;

      const cleanCrit = criterionName.toLowerCase().trim();
      // 1. Direct case-insensitive match
      for (const rName of rubricNames) {
        if (rName.toLowerCase().trim() === cleanCrit) return rName;
      }

      // 2. Substring match
      for (const rName of rubricNames) {
        const cleanR = rName.toLowerCase().trim();
        if (cleanR.includes(cleanCrit) || cleanCrit.includes(cleanR)) return rName;
      }

      // 3. Token overlap match
      const critTokens = new Set(cleanCrit.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean));
      let bestMatch = null;
      let maxOverlap = 0;

      for (const rName of rubricNames) {
        const rTokens = new Set(rName.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean));
        const intersection = [...critTokens].filter((t) => rTokens.has(t));
        const union = new Set([...critTokens, ...rTokens]);
        const score = union.size > 0 ? intersection.length / union.size : 0;
        if (score > maxOverlap) {
          maxOverlap = score;
          bestMatch = rName;
        }
      }

      return maxOverlap >= 0.25 ? bestMatch : criterionName;
    };

    let userPrompt = `Assignment Title: ${title || 'Untitled'}

Instructions:
${instructions}

Evaluation Rubric:
${normalizedRubric ? JSON.stringify(normalizedRubric, null, 2) : 'No rubric provided'}`;

    if (evaluatorType?.toLowerCase() === 'excel' && rubricNames.length > 0) {
      userPrompt += `\n\nCRITICAL BINDING CONTRACT:
The following are the EXACT allowed criteria names. Every test case's "criterion" property MUST be one of these exact strings (copy verbatim):
${rubricNames.map((n) => `- "${n}"`).join('\n')}
Do NOT alter spelling, casing, punctuation, or add parentheticals. Every criterion above must have at least one test case.`;
    } else if (evaluatorType?.toLowerCase() === 'sql' && rubricNames.length > 0) {
      userPrompt += `\n\nCRITICAL BINDING CONTRACT FOR SQL EVALUATOR:
The following are the EXACT allowed criteria names and weights from the Evaluation Rubric:
${rubricList.map((r) => `- "${typeof r === 'string' ? r : r.name}" (weight: ${typeof r === 'object' && Number(r.weight) > 0 ? r.weight : 50})`).join('\n')}

In your generated "testCases" array:
1. Every test case's "name" MUST be an exact, verbatim copy of one of these criteria names.
2. Every test case's "weight" MUST match the criterion's weight.
3. Every criterion above must have at least one test case so that all rubric criteria are evaluated.`;
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
    });

    let rawJson = completion.choices[0].message.content.trim();
    // In case the model outputs markdown anyway, clean it
    if (rawJson.startsWith('```json')) rawJson = rawJson.substring(7);
    if (rawJson.startsWith('```')) rawJson = rawJson.substring(3);
    if (rawJson.endsWith('```')) rawJson = rawJson.substring(0, rawJson.length - 3);
    rawJson = rawJson.trim();

    // Verify it parses correctly
    const parsedJson = JSON.parse(rawJson);

    // Deterministic Post-processing Sanitizer Guard for Excel test cases
    if (evaluatorType?.toLowerCase() === 'excel' && Array.isArray(parsedJson)) {
      const lowerInstructions = (instructions || '').toLowerCase();
      const mentionsZero = lowerInstructions.includes('zero') || lowerInstructions.includes(' 0');
      const mentionsFill = lowerInstructions.includes('fill') || lowerInstructions.includes('background') || lowerInstructions.includes('shading') || lowerInstructions.includes('color');
      const sheetMatch = instructions.match(/(?:sheet|worksheet)\s+(?:named|called|titled)?\s*["']?([A-Za-z0-9_ \(\)-]+?)["']?(?:[.,;\n\r]|$)/i);
      const targetSheet = sheetMatch && sheetMatch[1] ? sheetMatch[1].trim() : null;

      for (let i = parsedJson.length - 1; i >= 0; i--) {
        const tc = parsedJson[i];
        if (!tc) continue;

        // Auto-snap criterion name to exact rubric name
        if (tc.criterion && rubricNames.length > 0) {
          tc.criterion = snapToExactRubricName(tc.criterion);
        }

        // Auto-inject sheet name if specified in instructions and not set
        if (targetSheet && !tc.sheet) {
          tc.sheet = targetSheet;
        }

        // Sanitize Column A in data_check: only rewrite to B if instructions didn't specify Column A
        if (tc.type === 'data_check' && tc.range && typeof tc.range === 'string') {
          const rangeMatch = tc.range.match(/^A([0-9]+):([A-Z]+[0-9]+)$/i);
          const hasColAData = /col\s*a|column\s*a|cell\s*a|[|]\s*[*]*col\s*a/i.test(lowerInstructions);
          if (rangeMatch && !hasColAData) {
            tc.range = `B${rangeMatch[1]}:${rangeMatch[2]}`;
          }
        }

        // Align column letter with anchor if AI shifted column to B/C unnecessarily
        if (tc.range && typeof tc.range === 'string') {
          if (tc.anchor === 'Sales Rep' && /^[BC]/i.test(tc.range)) {
            tc.range = tc.range.replace(/^[BC]/i, 'A');
          } else if (tc.anchor === 'Sum of Amount' && /^[C]/i.test(tc.range)) {
            tc.range = tc.range.replace(/^[C]/i, 'B').replace(/:[C]/i, ':B');
          } else if (tc.anchor === 'Grand Total' && /^[BC]/i.test(tc.range)) {
            tc.range = tc.range.replace(/^[BC]/i, 'A');
          }
        }

        // Sanitize value_check: Eliminate 0-trap when exact numbers were not provided
        if (tc.type === 'value_check' && (tc.expectedValue === 0 || tc.expectedValue === '0') && !mentionsZero) {
          // Convert to function_check on the cell so student is verified for using correct formula without failing
          tc.type = 'function_check';
          tc.range = tc.cell || tc.range || 'A1';
          tc.acceptedFunctions = tc.acceptedFunctions || ['SUM'];
          delete tc.cell;
          delete tc.expectedValue;
          delete tc.tolerance;
        }

        // Sanitize function_check: eliminate arithmetic PRODUCT trap (students write =A*B, not =PRODUCT(A,B))
        if (tc.type === 'function_check' && Array.isArray(tc.acceptedFunctions)) {
          const isOnlyProduct = tc.acceptedFunctions.every(f => f.toUpperCase() === 'PRODUCT');
          if (isOnlyProduct) {
            tc.type = 'formula_range_check';
            tc.mustBeFormula = true;
            tc.forbiddenConstants = true;
            delete tc.acceptedFunctions;
          }
        }

        // Auto-inject anchor if missing based on criterion keywords
        if (!tc.anchor && tc.criterion) {
          const lowerC = tc.criterion.toLowerCase();
          if (lowerC.includes('margin') || lowerC.includes('profit margin')) {
            tc.anchor = 'Profit Margin';
          } else if (lowerC.includes('contact') || lowerC.includes('name')) {
            tc.anchor = 'Contact';
          } else if (lowerC.includes('department') || lowerC.includes('dept')) {
            tc.anchor = 'Department';
          } else if (lowerC.includes('revenue') || lowerC.includes('sales')) {
            tc.anchor = 'Revenue';
          }
        }

        // Sanitize format_check: Strip anchor if range is a multi-column horizontal row (e.g. A1:F1 or B2:I2)
        if (tc.type === 'format_check' && tc.range) {
          const headerRowMatch = tc.range.match(/^([A-Z]+)([0-9]+):([A-Z]+)([0-9]+)$/i);
          if (headerRowMatch && headerRowMatch[2] === headerRowMatch[4] && headerRowMatch[1].toUpperCase() !== headerRowMatch[3].toUpperCase()) {
            delete tc.anchor; // Horizontal row range: DO NOT anchor to a single column!
          }
        }

        // Sanitize function_check: Strip anchor if checking summary formulas (e.g. F5 or F5:F5 with SUM)
        if (tc.type === 'function_check' && tc.anchor && /total|sum|grand/i.test(tc.anchor)) {
          delete tc.anchor;
        }

        // Sanitize data_check: Strip anchor if checking a multi-column data range (e.g. A2:C3, B1:F4)
        if (tc.type === 'data_check' && tc.range && tc.anchor) {
          const multiColDataMatch = tc.range.match(/^([A-Z]+)([0-9]+):([A-Z]+)([0-9]+)$/i);
          if (multiColDataMatch && multiColDataMatch[1].toUpperCase() !== multiColDataMatch[3].toUpperCase()) {
            delete tc.anchor;
          }
        }

        // Multi-column formula narrowing: if range spans multiple columns for a single formula (e.g. D4:E35), target the rightmost formula column
        if ((tc.type === 'function_check' || tc.type === 'formula_range_check') && tc.range && typeof tc.range === 'string') {
          const multiColMatch = tc.range.match(/^([A-Z])([0-9]+):([A-Z])([0-9]+)$/i);
          if (multiColMatch && multiColMatch[1].toUpperCase() !== multiColMatch[3].toUpperCase()) {
            tc.range = `${multiColMatch[3].toUpperCase()}${multiColMatch[2]}:${multiColMatch[3].toUpperCase()}${multiColMatch[4]}`;
          }
        }

        // Sanitize format_check: Strip hasFill if instructions never asked for background fill
        if (tc.type === 'format_check' && tc.hasFill && !mentionsFill) {
          delete tc.hasFill;
        }

        // De-duplicate redundant formula_range_checks for the same sheet and anchor
        if (tc.type === 'formula_range_check') {
          const dupIndex = parsedJson.findIndex((other, idx) => 
            idx !== i && other && other.type === 'formula_range_check' && 
            other.sheet === tc.sheet && other.anchor === tc.anchor && other.criterion === tc.criterion
          );
          if (dupIndex !== -1 && dupIndex < i) {
            parsedJson.splice(i, 1);
            continue;
          }
        }
      }

      // Guarantee every single rubric criterion has at least one test case
      if (rubricNames.length > 0) {
        const coveredCriteria = new Set(parsedJson.map((t) => t.criterion));
        for (const rName of rubricNames) {
          if (!coveredCriteria.has(rName)) {
            const lowerR = rName.toLowerCase();
            let fallbackType = 'data_check';
            let fallbackProps = { range: 'B4:I35', disallowBlanks: true };

            if (lowerR.includes('formula') || lowerR.includes('calc') || lowerR.includes('profit') || lowerR.includes('margin') || lowerR.includes('sum')) {
              fallbackType = 'formula_range_check';
              fallbackProps = { range: 'I4:I35', mustBeFormula: true, forbiddenConstants: true };
            } else if (lowerR.includes('format') || lowerR.includes('style') || lowerR.includes('bold')) {
              fallbackType = 'format_check';
              fallbackProps = { range: 'B2:I3', bold: true };
            } else if (lowerR.includes('text') || lowerR.includes('clean') || lowerR.includes('proper') || lowerR.includes('trim')) {
              fallbackType = 'function_check';
              fallbackProps = { range: 'E4:E35', acceptedFunctions: ['PROPER', 'TRIM'] };
            } else if (lowerR.includes('lookup') || lowerR.includes('xlookup') || lowerR.includes('vlookup')) {
              fallbackType = 'function_check';
              fallbackProps = { range: 'E4:E35', acceptedFunctions: ['VLOOKUP', 'XLOOKUP', 'INDEX'] };
            }

            parsedJson.push({
              criterion: rName,
              type: fallbackType,
              ...(targetSheet ? { sheet: targetSheet } : {}),
              ...fallbackProps
            });
          }
        }
      }
    }

    // Deterministic Post-processing Sanitizer Guard for SQL test cases
    if (evaluatorType?.toLowerCase() === 'sql') {
      let finalSqlManifest = parsedJson;
      // If AI output an array, wrap it in a proper manifest object
      if (Array.isArray(parsedJson)) {
        finalSqlManifest = {
          contractVersion: '1.0',
          mode: 'query_only',
          dialect: 'postgres',
          schema: '',
          setupSql: '',
          referenceQuery: '',
          testCases: parsedJson
        };
      }

      // Ensure contract defaults
      finalSqlManifest.contractVersion = finalSqlManifest.contractVersion || '1.0';
      finalSqlManifest.dialect = finalSqlManifest.dialect || 'postgres';
      finalSqlManifest.mode = finalSqlManifest.mode || 'query_only';

      // Dialect cleanups (convert MySQL backticks to standard Postgres quotes or remove them)
      const sanitizeSqlDialect = (sqlStr) => {
        if (!sqlStr || typeof sqlStr !== 'string') return sqlStr;
        return sqlStr
          .replace(/`([a-zA-Z0-9_]+)`/g, '"$1"') // replace backticks with standard quotes
          .replace(/\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, 'SERIAL PRIMARY KEY')
          .replace(/\bAUTO_INCREMENT\b/gi, '')
          .replace(/\bDATETIME\b/gi, 'TIMESTAMP');
      };

      finalSqlManifest.schema = sanitizeSqlDialect(finalSqlManifest.schema || '');
      finalSqlManifest.setupSql = sanitizeSqlDialect(finalSqlManifest.setupSql || '');
      finalSqlManifest.referenceQuery = sanitizeSqlDialect(finalSqlManifest.referenceQuery || '');
      finalSqlManifest.referenceScript = sanitizeSqlDialect(finalSqlManifest.referenceScript || '');

      // In script mode, if referenceScript is missing, extract all CREATE TABLE / INSERT INTO statements from instructions
      if (finalSqlManifest.mode === 'script' && !finalSqlManifest.referenceScript) {
        const ddlMatches = (instructions || '').match(/(?:CREATE\s+TABLE|INSERT\s+INTO)[\s\S]*?;/gi);
        if (ddlMatches && ddlMatches.length > 0) {
          finalSqlManifest.referenceScript = ddlMatches.join('\n\n');
        }
      }

      // Check if instructions specify a concrete query that the AI might have hallucinated as version()
      const instrQueryMatch = (instructions || '').match(/\b(SELECT\s+[\s\S]*?;)/i);
      const instructedQuery = instrQueryMatch ? instrQueryMatch[1].trim() : null;
      const instructionsMentionVersion = /select\s+version\s*\(\s*\)|version\(\)/i.test(instructions || '');

      if (instructedQuery && !instructionsMentionVersion && /version\s*\(\s*\)/i.test(finalSqlManifest.referenceQuery || '')) {
        finalSqlManifest.referenceQuery = instructedQuery;
      }

      // Zero-table query detection: if reference query is a server/system query or calculation without tables, enforce zero tables
      const refQueryClean = (finalSqlManifest.referenceQuery || '').trim().toLowerCase();
      const isSystemQuery = /^select\s+(version|now|current_database|current_user|current_date|current_timestamp|1|10|\d+)\s*(\(\s*\))?\s*;?$/i.test(refQueryClean) ||
                            (!finalSqlManifest.schema && !finalSqlManifest.setupSql && !/\bfrom\b/i.test(refQueryClean)) ||
                            instructionsMentionVersion;

      if (isSystemQuery) {
        finalSqlManifest.schema = '';
        finalSqlManifest.setupSql = '';
        if (!finalSqlManifest.referenceQuery || !finalSqlManifest.referenceQuery.trim()) {
          finalSqlManifest.referenceQuery = instructedQuery || (instructionsMentionVersion ? 'SELECT version();' : 'SELECT 1;');
        }
      }

      // Canonical reference query for query_only mode: student submits 1 query, so all test cases must evaluate the same target query
      let canonicalRefQuery = finalSqlManifest.referenceQuery;
      if (!canonicalRefQuery || (!instructionsMentionVersion && /version\s*\(\s*\)/i.test(canonicalRefQuery))) {
        if (instructedQuery) {
          canonicalRefQuery = instructedQuery;
        } else if (Array.isArray(finalSqlManifest.testCases)) {
          const nonVersion = finalSqlManifest.testCases.find((tc) => tc.referenceQuery && !/version\s*\(\s*\)/i.test(tc.referenceQuery));
          if (nonVersion) canonicalRefQuery = nonVersion.referenceQuery;
        }
      }
      finalSqlManifest.referenceQuery = canonicalRefQuery || (instructionsMentionVersion ? 'SELECT version();' : 'SELECT 1;');

      // Sanitize testCases array
      if (!Array.isArray(finalSqlManifest.testCases) || finalSqlManifest.testCases.length === 0) {
        finalSqlManifest.testCases = [
          {
            name: rubricNames[0] || 'Verification Query Execution',
            kind: 'visible',
            weight: 50,
            referenceQuery: finalSqlManifest.referenceQuery,
            enforceOrder: Boolean(finalSqlManifest.enforceOrder)
          },
          {
            name: rubricNames[1] || 'SQL Environment & Syntax Accuracy',
            kind: 'hidden',
            weight: 50,
            setupSql: '',
            referenceQuery: finalSqlManifest.referenceQuery,
            enforceOrder: Boolean(finalSqlManifest.enforceOrder)
          }
        ];
      } else {
        // Sanitize queries within each test case
        finalSqlManifest.testCases = finalSqlManifest.testCases.map((tc) => {
          let testRefQuery = sanitizeSqlDialect(tc.referenceQuery || finalSqlManifest.referenceQuery);
          // If this test case has version() but the instructions never asked for version(), replace it with canonical query
          if (!instructionsMentionVersion && /version\s*\(\s*\)/i.test(testRefQuery)) {
            testRefQuery = finalSqlManifest.referenceQuery;
          }
          return {
            ...tc,
            setupSql: isSystemQuery ? '' : sanitizeSqlDialect(tc.setupSql || ''),
            referenceQuery: testRefQuery
          };
        });
      }

      // Rubric alignment: Ensure every rubric criterion is mapped to a test case and weights match exactly
      if (rubricList.length > 0) {
        // 1. Map test case names to exact rubric criteria names
        finalSqlManifest.testCases.forEach((tc) => {
          if (tc.name) {
            tc.name = snapToExactRubricName(tc.name);
          }
        });

        // 2. Ensure every rubric criterion has at least one test case
        const coveredCriteria = new Set(finalSqlManifest.testCases.map((tc) => tc.name));
        rubricList.forEach((rObj, rIdx) => {
          const rName = typeof rObj === 'string' ? rObj : (rObj.name || '');
          const rWeight = typeof rObj === 'object' && Number(rObj.weight) > 0 ? Number(rObj.weight) : 50;
          if (rName && !coveredCriteria.has(rName)) {
            finalSqlManifest.testCases.push({
              name: rName,
              kind: rIdx === 0 ? 'visible' : 'hidden',
              weight: rWeight,
              setupSql: isSystemQuery ? '' : (finalSqlManifest.setupSql || ''),
              referenceQuery: finalSqlManifest.referenceQuery || 'SELECT version();',
              enforceOrder: Boolean(finalSqlManifest.enforceOrder)
            });
            coveredCriteria.add(rName);
          }
        });

        // 3. If test case count matches rubric criteria count, enforce exact criteria names and weights 1-to-1
        if (finalSqlManifest.testCases.length === rubricList.length) {
          finalSqlManifest.testCases.forEach((tc, idx) => {
            const rName = typeof rubricList[idx] === 'string' ? rubricList[idx] : (rubricList[idx].name || '');
            const rWeight = typeof rubricList[idx] === 'object' && Number(rubricList[idx].weight) > 0 ? Number(rubricList[idx].weight) : 50;
            if (rName) {
              tc.name = rName;
              tc.weight = rWeight;
            }
          });
        }
      }

      // Balance weights so they sum to 100
      const totalWeight = finalSqlManifest.testCases.reduce((sum, tc) => sum + (Number(tc.weight) || 0), 0);
      if (totalWeight !== 100 && finalSqlManifest.testCases.length > 0) {
        const defaultPerTest = Math.floor(100 / finalSqlManifest.testCases.length);
        let remaining = 100;
        finalSqlManifest.testCases.forEach((tc, idx) => {
          if (idx === finalSqlManifest.testCases.length - 1) {
            tc.weight = remaining;
          } else {
            tc.weight = defaultPerTest;
            remaining -= defaultPerTest;
          }
        });
      }

      // Auto-extract required AST clauses if not provided (leave empty for zero-table queries)
      if (!finalSqlManifest.astRequirements || !Array.isArray(finalSqlManifest.astRequirements.requiredClauses)) {
        if (isSystemQuery) {
          finalSqlManifest.astRequirements = {
            requiredClauses: [],
            forbiddenClauses: []
          };
        } else {
          const refUpper = (finalSqlManifest.referenceQuery || '').toUpperCase();
          const detectedClauses = [];
          if (refUpper.includes('JOIN')) detectedClauses.push('JOIN');
          if (refUpper.includes('GROUP BY')) detectedClauses.push('GROUP BY');
          if (refUpper.includes('HAVING')) detectedClauses.push('HAVING');
          if (refUpper.includes('ORDER BY')) detectedClauses.push('ORDER BY');
          if (refUpper.includes('LIMIT')) detectedClauses.push('LIMIT');
          if (refUpper.includes('UNION')) detectedClauses.push('UNION');
          if (refUpper.includes('OVER') || refUpper.includes('PARTITION BY')) detectedClauses.push('WINDOW');
          
          finalSqlManifest.astRequirements = {
            requiredClauses: detectedClauses,
            forbiddenClauses: []
          };
        }
      }

      return res.json({
        success: true,
        testCases: JSON.stringify(finalSqlManifest, null, 2)
      });
    }

    return res.json({
      success: true,
      testCases: JSON.stringify(parsedJson, null, 2)
    });
  } catch (error) {
    console.error("AI Generation Error:", error);
    return serverError(res, error);
  }
};

exports.generateRubric = async (req, res) => {
  try {
    const { title, instructions, evaluatorType } = req.body;

    if (!instructions) {
      return res.status(400).json({ success: false, message: "Instructions are required to generate a rubric." });
    }

    let systemPrompt = `You are the world's foremost expert technical curriculum designer and spreadsheet engineer. Your task is to generate a strict JSON evaluation rubric for an automated code and spreadsheet grading system.
    
Based on the Assignment Title and Instructions provided by the user, you must output ONLY a raw JSON array of objects. DO NOT output any markdown code blocks or explanations, just output the raw JSON string starting with [ and ending with ].

CRITICAL RULES:
1. The output MUST be a JSON array of objects.
2. Each object must have exactly three keys: "name" (string), "description" (string), and "weight" (number).
3. The sum of all "weight" values MUST equal exactly 100.
4. If the user instructions include an existing rubric with a different total (e.g. 20 marks or 50 marks), you MUST proportionally scale each criterion's weight so the total equals exactly 100.
5. Each "name" must be UNIQUE. Do not use the same name twice.
6. Do not include any explanation.
7. ASSIGNMENT COMPLEXITY ADAPTATION:
Identify the complexity of the assignment based on the title and instructions:
- Simple / Introductory Class Exercise: Generate 2-3 focused criteria.
- Standard Project / Mid-level Assignment: Generate 3-5 distinct, balanced criteria.
- Advanced / Capstone Assignment: Generate 5-7 comprehensive criteria.`;

    if (evaluatorType === 'react') {
      systemPrompt += `\n8. For React assignments, the "name" field MUST be chosen strictly from the following exact predefined list:
- "Components Render Correctly" (Use for UI rendering / layout)
- "State Updates" (Use for React state management, hooks)
- "Props Handling" (Use for props passing, data flow)
- "Routing Works" (Use for React Router or navigation)
- "API Integration" (Use for fetch/axios/data fetching)
- "Code Structure" (Use for clean code, standard practices)
You may choose 2-5 from this list based on the instructions and the complexity rules above, but YOU MUST NOT INVENT CUSTOM NAMES outside of this exact list.`;
    } else if (evaluatorType === 'backend' || evaluatorType === 'AI') {
      systemPrompt += `\n8. For Backend assignments, the "name" field MUST be chosen strictly from the following exact predefined list:
- "API Endpoints" (Use for routing, endpoints, HTTP methods)
- "Database Operations" (Use for Models, Schemas, Queries, CRUD)
- "Middleware & Auth" (Use for error handling, JWT, authentication)
- "Controller Logic" (Use for business logic, data formatting)
- "Code Structure" (Use for clean code, separation of concerns, MVC)
You may choose 2-5 from this list based on the instructions and the complexity rules above, but YOU MUST NOT INVENT CUSTOM NAMES outside of this exact list.`;
    } else if (evaluatorType?.toLowerCase() === 'fullstack') {
      systemPrompt += `\n8. For Fullstack assignments, the "name" field MUST be chosen strictly from the following exact predefined list:
- "Frontend UI & Components" (Use for React rendering, responsive design, structure)
- "Frontend State & Data Fetching" (Use for React state, hooks, fetch/axios)
- "Backend API & Routing" (Use for Express routes, HTTP methods, CORS)
- "Backend Logic & Database" (Use for business logic, validation, database models)
- "Fullstack Integration" (Use for end-to-end data flow between client and server)
- "Code Quality & Structure" (Use for clean code, file structure, package.json across both environments)
You must select 3-6 criteria from this list that cover both Frontend and Backend, based on the instructions and complexity rules above. YOU MUST NOT INVENT CUSTOM NAMES outside of this exact list.`;
    } else if (evaluatorType?.toLowerCase() === 'excel') {
      systemPrompt += `\n8. For Excel Spreadsheet assignments, generate clean, professional, and distinct rubric criteria reflecting the core skills and milestones in the instructions:
- Generate 3 to 5 clear, descriptive criteria names tailored dynamically to the assignment.
- Standard skill categories to draw from or adapt based on instructions:
  - "Table Formatting & Professional Structure" (Bold headers, proper borders, currency $, percentages %, alignment)
  - "Contact Name Cleaning with Text Functions" or "Data Cleaning & Text Manipulation" (PROPER, TRIM, CONCAT, TEXTSPLIT, casing)
  - "Client & Ticker Separation" or "Data Splitting & Extraction" (Separating columns, delimiters, LEFT/MID/RIGHT)
  - "Dynamic Profit Margin Calculation" or "Formulas & Dynamic Calculations" (SUM, AVERAGE, ratios, arithmetic, cell referencing)
  - "Department Categorization & Completeness" or "Data Entry & Completeness" (No missing records, complete rows, categories)
  - "Lookup & Reference Functions" (VLOOKUP, XLOOKUP, INDEX/MATCH, absolute $)
  - "Logical & Conditional Calculations" (IF, IFS, AND, OR, IFERROR)
  - "Pivot Tables & Data Summaries" (Native Pivot tables, data fields, aggregations)
  - "Data Visualizations & Charts" (Column/Bar charts, line graphs, KPIs)
- CRITICAL RULES FOR EXCEL RUBRICS:
  - Use concise, elegant, professional criteria names (2-5 words).
  - DO NOT include generic programming terms like "Code Quality" or "MVC Architecture" for spreadsheet assignments.
  - Weights MUST sum to exactly 100 with clean, rounded numbers (e.g., 25, 25, 20, 15, 15 or 30, 30, 20, 20).
  - Every criterion name must be clear so that automated test cases can bind to it with 100% precision.`;
    } else if (evaluatorType?.toLowerCase() === 'sql') {
      systemPrompt += `\n8. For SQL Database assignments, you are designing a rubric for an AUTOMATED grading engine that executes student-submitted SQL files, scripts, or queries in a sandboxed PostgreSQL database:
- AUTOMATED CODE EVALUATION PRINCIPLE (CRITICAL):
  - The evaluator CANNOT grade physical machine installation steps, OS wizard dialogs, pgAdmin GUI clicks, or setting localhost passwords.
  - NEVER generate rubric criteria for downloading installers, installing pgAdmin, setting master passwords, or launching desktop applications.
  - ALL criteria MUST be strictly verifiable by analyzing or executing the student's submitted SQL code/file.

- ASSIGNMENT SCENARIOS:
  Scenario A: Environment Setup / Connection / Basic Verification Labs:
    - CAREFULLY inspect the instructions for the EXACT statement or calculation the student is asked to run.
    - Generate exactly 2 clear, code-verifiable criteria:
      1. Tailored Query Criterion (Weight: 50): Name it based on what is ACTUALLY instructed:
         - If a calculation statement is requested: "Database Connection & Server Calculation Query" (Weight: 50): Student correctly writes and executes the requested calculation statement (e.g. SELECT 100 * 5 AS calculation_result;) returning the expected computed value.
         - If a version check is requested: "Database Connection & Version Verification Query" (Weight: 50): Student correctly writes and executes the system verification query (e.g. SELECT version();) returning the expected version string.
         - Otherwise: Name it after the exact query requested in the instructions.
      2. "PostgreSQL Environment & Syntax Accuracy" (Weight: 50): Query adheres to valid PostgreSQL syntax without syntax errors, Cartesian explosions, or unauthorized statements.

  Scenario B: DDL / Schema Design Script Assignments (e.g., CREATE TABLE, PRIMARY KEY, FOREIGN KEY, INSERT INTO):
    - Generate 3-4 focused criteria:
      1. "Schema DDL & Table Creation" (Weight: 30): Tables defined with correct names, appropriate column data types, and nullability.
      2. "Primary & Foreign Key Constraints" (Weight: 25): Correct PRIMARY KEY and FOREIGN KEY/REFERENCES constraints preserving relational integrity.
      3. "Data Insertion & DML Records" (Weight: 25): Multi-row INSERT INTO statements populating all required seed records accurately.
      4. "Script Execution & Data Consistency" (Weight: 20): Script executes sequentially from top to bottom without dependency ordering errors or constraint violations.

  Scenario C: Data Query / SELECT Assignments (e.g., Single-table queries, Joins, Aggregations, Filtering, Subqueries):
    - Generate 3-4 criteria tailored ONLY to the concepts explicitly requested in the instructions:
      - "SQL Syntax & Column Projections" (Weight: 25-30): Valid PostgreSQL SELECT query with correct column aliases and projections.
      - "Filtering & WHERE Conditions" (Weight: 25-30): Accurate WHERE predicates, handling comparison operators, date ranges, or NULLs.
      - "Table Joins & Relationships" (Weight: 20-30, ONLY IF JOINS ARE REQUIRED): Correct INNER/LEFT JOIN syntax connecting tables on matching foreign keys.
      - "Data Aggregation & Grouping" (Weight: 20-30, ONLY IF AGGREGATIONS ARE REQUIRED): Correct GROUP BY, HAVING, and aggregate functions (COUNT, SUM, AVG).
      - "Sorting & Result Pagination" (Weight: 15-20, ONLY IF ORDER BY / LIMIT IS REQUIRED): Proper ORDER BY sort order and LIMIT clause.
    - DO NOT generate "Table Joins" or "Data Aggregation" if the assignment only queries a single table without aggregations!

- CRITICAL: The weights of all criteria MUST sum to exactly 100 with clean, rounded numbers (e.g., 50, 50 or 30, 25, 25, 20 or 25, 25, 25, 25).`;
    }

    systemPrompt += `

Example output format (adapt criteria count dynamically: 2 criteria for simple/setup labs, 3-4 for standard queries/DDL, 4-6 for complex/analytics assignments):
[
  { "name": "${evaluatorType === 'react' ? 'State Updates' : (evaluatorType === 'backend' ? 'API Endpoints' : (evaluatorType?.toLowerCase() === 'fullstack' ? 'Fullstack Integration' : (evaluatorType?.toLowerCase() === 'excel' ? 'Table Formatting & Professional Structure' : (evaluatorType?.toLowerCase() === 'sql' ? 'SQL Syntax & Column Projections' : 'Feature A'))))}", "description": "Accurate syntax and column selections.", "weight": 30 },
  { "name": "${evaluatorType === 'react' ? 'Components Render Correctly' : (evaluatorType === 'backend' ? 'Database Operations' : (evaluatorType?.toLowerCase() === 'fullstack' ? 'Backend API & Routing' : (evaluatorType?.toLowerCase() === 'excel' ? 'Dynamic Calculations & Formulas' : (evaluatorType?.toLowerCase() === 'sql' ? 'Table Joins & Relationships' : 'Feature B'))))}", "description": "Correct relational join cardinality.", "weight": 35 },
  { "name": "${evaluatorType?.toLowerCase() === 'excel' ? 'Data Entry & Completeness' : (evaluatorType?.toLowerCase() === 'sql' ? 'Data Aggregation & Grouping' : 'Code Quality & Structure')}", "description": "Aggregations using GROUP BY and aggregate functions.", "weight": 35 }
]`;

    const userPrompt = `Assignment Title: ${title || 'Untitled'}

Instructions:
${instructions}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
    });

    let rawJson = completion.choices[0].message.content.trim();
    if (rawJson.startsWith('```json')) rawJson = rawJson.substring(7);
    if (rawJson.startsWith('```')) rawJson = rawJson.substring(3);
    if (rawJson.endsWith('```')) rawJson = rawJson.substring(0, rawJson.length - 3);
    rawJson = rawJson.trim();

    const parsedJson = JSON.parse(rawJson);

    // Deterministic Normalization Guard: Guarantee sum of weights is ALWAYS exactly 100
    if (Array.isArray(parsedJson) && parsedJson.length > 0) {
      const currentTotal = parsedJson.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
      if (currentTotal > 0 && currentTotal !== 100) {
        let runningSum = 0;
        parsedJson.forEach((item, index) => {
          if (index === parsedJson.length - 1) {
            item.weight = Math.max(1, 100 - runningSum);
          } else {
            const scaled = Math.round((Number(item.weight) / currentTotal) * 100);
            item.weight = Math.max(1, scaled);
            runningSum += item.weight;
          }
        });
      }
    }

    return res.json({
      success: true,
      rubric: JSON.stringify(parsedJson, null, 2)
    });
  } catch (error) {
    console.error("AI Generation Error:", error);
    return serverError(res, error);
  }
};

exports.reEvaluateSubmission = async (req, res) => {
  let { evaluationId, assignmentId, submissionIds, submissionId, evaluatorType } = req.body;

  // Normalize single submissionId to submissionIds array
  if (!submissionIds && submissionId) {
    submissionIds = [submissionId];
  } else if (typeof submissionIds === 'string') {
    submissionIds = [submissionIds];
  }

  if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
    return res.status(400).json({ success: false, message: 'an array of submissionIds is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let isCollegeAssignment = false;
    let isProject = false;

    // Auto-create evaluation if evaluationId is missing
    if (!evaluationId) {
      if (!assignmentId) throw new Error("Either evaluationId or assignmentId must be provided");

      const isCollegeAssignmentRes = await client.query(`SELECT id FROM college_assignments WHERE id::text = $1::text`, [assignmentId]);
      isCollegeAssignment = isCollegeAssignmentRes.rows.length > 0;

      const isProjectRes = await client.query(`SELECT id FROM projects WHERE id::text = $1::text`, [assignmentId]);
      isProject = isProjectRes.rows.length > 0;
      
      const newEval = await client.query(
        `INSERT INTO evaluations (assignment_id, college_assignment_id, project_id, evaluator_type, status, total_submissions)
         VALUES ($1, $2, $3, $4, 'running', $5) RETURNING id`,
        [
          (!isCollegeAssignment && !isProject) ? assignmentId : null,
          isCollegeAssignment ? assignmentId : null,
          isProject ? assignmentId : null,
          evaluatorType,
          submissionIds.length
        ]
      );
      evaluationId = newEval.rows[0].id;
      
      // Pre-create the evaluation_results rows for pending state
      const initialSubmissionsRes = await client.query(
        isCollegeAssignment
        ? `SELECT s.id as submission_id, s.student_id as user_id, u.full_name as student_name
           FROM college_assignment_submissions s
           JOIN users u ON s.student_id = u.id
           WHERE s.assignment_id::text = $2::text AND s.id::text = ANY($1::text[])`
        : isProject
        ? `SELECT s.id as submission_id, s.user_id, u.full_name as student_name
           FROM project_submissions s
           JOIN users u ON s.user_id = u.id
           WHERE s.project_id::text = $2::text AND s.id::text = ANY($1::text[])`
        : `SELECT s.id as submission_id, s.user_id, u.full_name as student_name
           FROM assignment_submissions s
           JOIN users u ON s.user_id = u.id
           WHERE s.assignment_id::text = $2::text AND s.id::text = ANY($1::text[])`,
        [submissionIds, assignmentId]
      );
      
      for (const s of initialSubmissionsRes.rows) {
        await client.query(
          `INSERT INTO evaluation_results 
           (evaluation_id, submission_id, student_id, student_name, status, marks, feedback) 
           VALUES ($1, $2, $3, $4, 'pending', 0, '{}'::jsonb)
           ON CONFLICT (evaluation_id, submission_id) DO NOTHING`,
          [evaluationId, s.submission_id, s.user_id, s.student_name]
        );
      }

      // Carry forward sibling submissions from prior evaluations of this assignment
      const targetCol = isProject
        ? 'e.project_id'
        : isCollegeAssignment
        ? 'e.college_assignment_id'
        : 'e.assignment_id';
      const currentSubIds = submissionIds;
      const currentStudentIds = initialSubmissionsRes.rows.map((s) => s.user_id).filter(Boolean);
      const siblingCarryRes = await client.query(
        `INSERT INTO evaluation_results (
          evaluation_id, submission_id, student_id, student_name, job_id, status, marks, feedback, status_url, created_at
        )
        SELECT 
          $1, 
          prev.submission_id, 
          prev.student_id, 
          prev.student_name, 
          prev.job_id, 
          prev.status, 
          prev.marks, 
          prev.feedback, 
          prev.status_url, 
          prev.created_at
        FROM (
          SELECT DISTINCT ON (COALESCE(r.student_id::text, r.submission_id::text)) r.*
          FROM evaluation_results r
          JOIN evaluations e ON r.evaluation_id = e.id
          WHERE ${targetCol}::text = $2::text
            AND r.status IN ('completed', 'failed')
            AND (r.submission_id IS NULL OR r.submission_id::text != ALL($3::text[]))
            AND (r.student_id IS NULL OR r.student_id::text != ALL($4::text[]))
            AND r.submission_id::text IN (
              SELECT id::text FROM ${isCollegeAssignment ? 'college_assignment_submissions' : isProject ? 'project_submissions' : 'assignment_submissions'}
              WHERE ${isCollegeAssignment ? 'assignment_id' : isProject ? 'project_id' : 'assignment_id'}::text = $2::text
            )
          ORDER BY COALESCE(r.student_id::text, r.submission_id::text), e.created_at DESC, r.created_at DESC
        ) prev
        ON CONFLICT (evaluation_id, submission_id) DO NOTHING
        RETURNING id`,
        [evaluationId, assignmentId, currentSubIds, currentStudentIds]
      );
      const siblingCount = siblingCarryRes.rowCount || 0;
      if (siblingCount > 0) {
        await client.query(
          `UPDATE evaluations SET total_submissions = total_submissions + $1 WHERE id = $2`,
          [siblingCount, evaluationId]
        );
      }
    } else {
      // Fetch the evaluation to get assignmentId or collegeAssignmentId or project_id
      const evalRes = await client.query(
        `SELECT assignment_id, college_assignment_id, project_id FROM evaluations WHERE id::text = $1::text`,
        [evaluationId]
      );

      if (evalRes.rows.length === 0) {
        throw new Error("Evaluation not found");
      }

      const evaluation = evalRes.rows[0];
      isCollegeAssignment = !!evaluation.college_assignment_id;
      isProject = !!evaluation.project_id;
      assignmentId = isCollegeAssignment
        ? evaluation.college_assignment_id
        : isProject
        ? evaluation.project_id
        : evaluation.assignment_id;
    }

    // Fetch assignment or project for rubric/test_cases
    let assignmentRes;
    if (isCollegeAssignment) {
      assignmentRes = await client.query(`SELECT id, title, evaluator_type, test_cases, rubric, 'college' as type FROM college_assignments WHERE id::text = $1::text`, [assignmentId]);
    } else if (isProject) {
      assignmentRes = await client.query(`SELECT id, title, evaluator_type, test_cases, rubric, 'project' as type FROM projects WHERE id::text = $1::text`, [assignmentId]);
    } else {
      assignmentRes = await client.query(`SELECT id, title, evaluator_type, test_cases, rubric, 'unit' as type FROM assignments WHERE id::text = $1::text`, [assignmentId]);
    }
    const assignment = assignmentRes.rows[0];
    if (!assignment) throw new Error("Assignment or Project not found");

    // Fetch the specific submissions (support either submission_id or evaluation_results.id)
    const queryStr = isCollegeAssignment
      ? `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.submission_type, s.student_id as user_id, u.full_name as student_name
         FROM college_assignment_submissions s
         JOIN users u ON s.student_id = u.id
         WHERE s.assignment_id::text = $3::text
           AND (
             s.id::text = ANY($1::text[])
             OR s.id::text IN (SELECT submission_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)
             OR s.student_id::text IN (SELECT student_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)
           )`
      : isProject
      ? `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.user_id, u.full_name as student_name
         FROM project_submissions s
         JOIN users u ON s.user_id = u.id
         WHERE s.project_id::text = $3::text
           AND (
             s.id::text = ANY($1::text[])
             OR s.id::text IN (SELECT submission_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)
             OR s.user_id::text IN (SELECT student_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)
           )`
      : `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.submission_type, s.user_id, u.full_name as student_name
         FROM assignment_submissions s
         JOIN users u ON s.user_id = u.id
         WHERE s.assignment_id::text = $3::text
           AND (
             s.id::text = ANY($1::text[])
             OR s.id::text IN (SELECT submission_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)
             OR s.user_id::text IN (SELECT student_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)
           )`;
         
    const submissionsRes = await client.query(queryStr, [submissionIds, evaluationId, assignmentId]);
    const submissions = submissionsRes.rows;

    if (!submissions.length) {
      // Fallback: fetch any active submissions for this evaluation if IDs were slightly mismatched
      const fallbackQuery = isCollegeAssignment
        ? `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.submission_type, s.student_id as user_id, u.full_name as student_name
           FROM college_assignment_submissions s
           JOIN users u ON s.student_id = u.id
           JOIN evaluation_results er ON (er.submission_id::text = s.id::text OR er.student_id::text = s.student_id::text)
           WHERE er.evaluation_id::text = $1::text AND s.assignment_id::text = $2::text`
        : isProject
        ? `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.user_id, u.full_name as student_name
           FROM project_submissions s
           JOIN users u ON s.user_id = u.id
           JOIN evaluation_results er ON (er.submission_id::text = s.id::text OR er.student_id::text = s.user_id::text)
           WHERE er.evaluation_id::text = $1::text AND s.project_id::text = $2::text`
        : `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.submission_type, s.user_id, u.full_name as student_name
           FROM assignment_submissions s
           JOIN users u ON s.user_id = u.id
           JOIN evaluation_results er ON (er.submission_id::text = s.id::text OR er.student_id::text = s.user_id::text)
           WHERE er.evaluation_id::text = $1::text AND s.assignment_id::text = $2::text`;
      const fallbackRes = await client.query(fallbackQuery, [evaluationId, assignmentId]);
      if (fallbackRes.rows.length > 0) {
        submissions.push(...fallbackRes.rows);
      } else {
        throw new Error('Submissions not found for re-evaluation');
      }
    }

    // Resolve effective evaluator type using assignment's configured type and content signatures
    const effectiveType = resolveEvaluatorType(
      { evaluator_type: evaluatorType },
      assignment
    ) || assignment.evaluator_type || evaluatorType || 'AI';

    const isExcelEvaluation = (effectiveType === 'EXCEL' || effectiveType === 'excel');
    const isSqlEvaluation = (effectiveType === 'SQL' || effectiveType === 'sql');

    // Ensure evaluation_results rows exist for all submissions being re-evaluated
    for (const s of submissions) {
      await client.query(
        `INSERT INTO evaluation_results 
           (evaluation_id, submission_id, student_id, student_name, status, marks, feedback)
         VALUES ($1, $2, $3, $4, 'pending', 0, '{}'::jsonb)
         ON CONFLICT (evaluation_id, submission_id) DO UPDATE
         SET status = 'pending', marks = 0, feedback = '{}'::jsonb`,
        [evaluationId, s.submission_id, s.user_id || s.student_id, s.student_name]
      );
    }

    const validSubmissions = submissions.filter((s) =>
      isExcelEvaluation
        ? !!(s.submission_file_url || (s.submission_link && isAllowedSpreadsheetUrl(s.submission_link)))
        : isSqlEvaluation
        ? !!(s.sql_text || s.sqlText || s.submission_file_url || (s.submission_link && isAllowedSqlUrl(s.submission_link)) || (s.ideFiles && s.ideFiles.length > 0))
        : (isAllowedGitUrl(s.submission_link) || !!s.submission_file_url || (s.submission_type === 'file' && !!s.submission_file_url))
    );
    const invalidSubmissions = submissions.filter((s) =>
      isExcelEvaluation
        ? !(s.submission_file_url || (s.submission_link && isAllowedSpreadsheetUrl(s.submission_link)))
        : isSqlEvaluation
        ? !(s.sql_text || s.sqlText || s.submission_file_url || (s.submission_link && isAllowedSqlUrl(s.submission_link)) || (s.ideFiles && s.ideFiles.length > 0))
        : !(isAllowedGitUrl(s.submission_link) || !!s.submission_file_url || (s.submission_type === 'file' && !!s.submission_file_url))
    );

    if (invalidSubmissions.length > 0) {
      for (const invalid of invalidSubmissions) {
        let reason = isExcelEvaluation
          ? 'No spreadsheet URL or file provided by student.'
          : isSqlEvaluation
          ? 'No SQL query, file, or repository provided by student.'
          : 'No repository URL provided by student.';
        if (invalid.submission_link) {
          try {
            const h = new URL(invalid.submission_link).hostname;
            reason = isExcelEvaluation
              ? `Invalid spreadsheet host (${h}). Submissions must be a Google Sheets link, OneDrive/SharePoint, or direct .xlsx file.`
              : isSqlEvaluation
              ? `Invalid SQL submission source (${h}). Submissions must be a .sql file or git repository.`
              : `Invalid repository host (${h}). Submissions must be a public repository on GitHub, GitLab, or Bitbucket.`;
          } catch {
            reason = isExcelEvaluation
              ? 'Invalid spreadsheet URL format.'
              : isSqlEvaluation
              ? 'Invalid SQL URL format.'
              : 'Invalid repository URL format. Must be a valid HTTP/HTTPS git repository URL.';
          }
        }
        const failFeedback = JSON.stringify({
          summary: reason,
          strengths: [],
          issues: [reason],
          breakdown: [],
        });
        await client.query(
          `UPDATE evaluation_results 
           SET status = 'failed', marks = 0, feedback = $1::jsonb 
           WHERE evaluation_id = $2 AND submission_id = $3`,
          [failFeedback, evaluationId, invalid.submission_id || invalid.id]
        );
      }
    }

    if (validSubmissions.length === 0) {
      await client.query('COMMIT');
      return res.json({ success: true, message: "Only invalid submissions found, marked as failed." });
    }

    // Now send to central evaluator
    const evaluatorUrl = `${process.env.CENTRAL_EVALUATOR_URL || 'http://localhost:4000'}/evaluate`;
    const evaluatorApiKey = process.env.CENTRAL_EVALUATOR_API_KEY;

    let jobIdsAndLinks = [];

    if (effectiveType === 'JS' || effectiveType === 'VISUAL' || effectiveType === 'javascript' || effectiveType === 'visual' || effectiveType === 'PYTHON' || effectiveType === 'python') {
        const payloadType = (effectiveType === 'JS') ? 'javascript' : (effectiveType === 'VISUAL' ? 'visual' : (effectiveType === 'PYTHON' ? 'python' : effectiveType));
        
        let rawTestCases = assignment.test_cases;
        while (typeof rawTestCases === 'string') {
          try {
            rawTestCases = JSON.parse(rawTestCases);
          } catch (e) {
            break;
          }
        }

        let jsConfig = { testCases: rawTestCases };
        if ((payloadType === 'javascript' || payloadType === 'python') && rawTestCases && typeof rawTestCases === 'object' && !Array.isArray(rawTestCases)) {
           jsConfig = {
             testCases: rawTestCases.testCases || [],
             evaluationMode: rawTestCases.evaluationMode || 'function',
             entryFunction: rawTestCases.entryFunction,
             functions: rawTestCases.functions,
             expectedLogs: rawTestCases.expectedLogs
           };
        }

        const payload = {
          type: payloadType,
          submissions: validSubmissions.map((s) => ({
            submissionId: s.submission_id || s.id,
            repoUrl: s.submission_link,
            studentName: s.student_name,
            studentId: s.user_id || s.student_id,
          })),
          ...jsConfig,
          rubricText: assignment.rubric ? JSON.stringify(assignment.rubric) : 'Standard evaluation',
          expectedUrl: assignment.expected_url || 'https://example.com',
          assignmentId: assignmentId,
          skipCache: true,
          reEvaluate: true,
        };

        const response = await postToEvaluatorWithRetry(evaluatorUrl, payload, {
          headers: { 'x-api-key': evaluatorApiKey },
          timeout: 45000,
        });

        const jobs = response.data.jobs || [response.data];
        jobs.forEach((job, index) => {
          jobIdsAndLinks.push({
            jobId: job.jobId || job.id,
            statusUrl: job.statusUrl,
            submissionId: validSubmissions[index].submission_id || validSubmissions[index].id,
          });
        });
    } else if (effectiveType === 'EXCEL' || effectiveType === 'excel') {
        let rawTestCases = assignment.test_cases;
        while (typeof rawTestCases === 'string') {
          try {
            rawTestCases = JSON.parse(rawTestCases);
          } catch (e) {
            break;
          }
        }

        let rubricObj = assignment.rubric;
        if (typeof assignment.rubric === 'string') {
          try {
            rubricObj = JSON.parse(assignment.rubric);
          } catch (e) {
            console.error('Failed to parse rubric:', e);
          }
        }

        let formattedRubric;
        if (rubricObj && Array.isArray(rubricObj)) {
          formattedRubric = { criteria: rubricObj };
        } else if (rubricObj && rubricObj.criteria && Array.isArray(rubricObj.criteria)) {
          formattedRubric = rubricObj;
        } else {
          formattedRubric = { criteria: [{ name: 'Standard Grading', weight: 100 }] };
        }

        formattedRubric.criteria = (formattedRubric.criteria || []).map((c) => ({
          name: typeof c === 'string' ? c : (c.name || c.title || c.criterion || 'Standard Grading'),
          weight: typeof c === 'object' && Number(c.weight || c.marks || c.points || c.score) > 0 ? Number(c.weight || c.marks || c.points || c.score) : 10,
          description: typeof c === 'object' ? (c.description || '') : ''
        }));

        let batchSucceeded = false;
        try {
          const batchPayload = {
            type: 'excel',
            submissions: await Promise.all(
              validSubmissions.map(async (s) => ({
                submissionId: s.submission_id || s.id,
                fileUrl: await getSpreadsheetDownloadUrl(s),
                studentName: s.student_name,
                studentId: s.user_id || s.student_id,
              }))
            ),
            rubric: formattedRubric,
            testCases: Array.isArray(rawTestCases) ? rawTestCases : (rawTestCases?.testCases || []),
            assignmentId: assignmentId,
            skipCache: true,
            reEvaluate: true,
          };

          const response = await postToEvaluatorWithRetry(evaluatorUrl, batchPayload, {
            headers: { 'x-api-key': evaluatorApiKey },
            timeout: 45000,
          });

          const jobs = response.data.jobs || [response.data];
          jobs.forEach((job, index) => {
            jobIdsAndLinks.push({
              jobId: job.jobId || job.id,
              statusUrl: job.statusUrl,
              submissionId: validSubmissions[index].submission_id || validSubmissions[index].id,
            });
          });
          batchSucceeded = true;
        } catch (batchErr) {
          console.warn('Batch Excel re-evaluation dispatch failed, falling back to isolated per-submission dispatch:', batchErr.message);
        }

        if (!batchSucceeded) {
          for (const s of validSubmissions) {
            try {
              const fileUrl = await getSpreadsheetDownloadUrl(s);

              const payload = {
                type: 'excel',
                submissionId: s.submission_id || s.id,
                fileUrl: fileUrl,
                rubric: formattedRubric,
                testCases: Array.isArray(rawTestCases) ? rawTestCases : (rawTestCases?.testCases || []),
              };

              const response = await postToEvaluatorWithRetry(evaluatorUrl, payload, {
                headers: { 'x-api-key': evaluatorApiKey },
                timeout: 45000,
              });

              jobIdsAndLinks.push({
                jobId: response.data.jobId || response.data.id,
                statusUrl: response.data.statusUrl,
                submissionId: s.submission_id || s.id,
              });
            } catch (singleErr) {
              const errMsg = singleErr.response?.data?.error || singleErr.response?.data?.message || singleErr.message;
              console.error(`Failed to enqueue Excel submission ${s.submission_id || s.id}:`, errMsg);
              const failFeedback = JSON.stringify({
                summary: `Submission failed: ${errMsg}`,
                strengths: [],
                issues: [errMsg],
                breakdown: [],
              });
              await client.query(
                `UPDATE evaluation_results 
                 SET status = 'failed', marks = 0, feedback = $1::jsonb 
                 WHERE evaluation_id = $2 AND submission_id = $3`,
                [failFeedback, evaluationId, s.submission_id || s.id]
              );
            }
          }
        }
    } else if (effectiveType === 'SQL' || effectiveType === 'sql') {
        let rawManifest = assignment.test_cases || assignment.manifest;
        while (typeof rawManifest === 'string') {
          try {
            rawManifest = JSON.parse(rawManifest);
          } catch (e) {
            break;
          }
        }

        let rubricObj = assignment.rubric;
        if (typeof assignment.rubric === 'string') {
          try {
            rubricObj = JSON.parse(assignment.rubric);
          } catch (e) {
            console.error('Failed to parse rubric:', e);
          }
        }

        let formattedRubric;
        if (rubricObj && Array.isArray(rubricObj)) {
          formattedRubric = { criteria: rubricObj };
        } else if (rubricObj && rubricObj.criteria && Array.isArray(rubricObj.criteria)) {
          formattedRubric = rubricObj;
        } else {
          formattedRubric = { criteria: [{ name: 'SQL Query & Schema Verification', weight: 100 }] };
        }

        formattedRubric.criteria = (formattedRubric.criteria || []).map((c) => ({
          name: typeof c === 'string' ? c : (c.name || c.title || c.criterion || 'SQL Verification'),
          weight: typeof c === 'object' && Number(c.weight || c.marks || c.points || c.score) > 0 ? Number(c.weight || c.marks || c.points || c.score) : 10,
          description: typeof c === 'object' ? (c.description || '') : ''
        }));

        const manifestObj = typeof rawManifest === 'object' && rawManifest !== null ? { ...rawManifest } : {};
        if (!manifestObj.mode) {
          const combinedMeta = `${assignment?.title || ''} ${JSON.stringify(rubricObj || '')} ${JSON.stringify(rawManifest || '')}`.toLowerCase();
          if (combinedMeta.includes('data model') || combinedMeta.includes('create table') || combinedMeta.includes('schema') || combinedMeta.includes('ddl') || combinedMeta.includes('foreign key')) {
            manifestObj.mode = 'script';
          }
        }

        const payload = {
          type: 'sql',
          submissions: await Promise.all(
            validSubmissions.map(async (s) => ({
              submissionId: s.submission_id || s.id,
              sqlText: s.sql_text || s.sqlText || (s.ideFiles && s.ideFiles.find((f) => (f.name || '').endsWith('.sql'))?.content),
              ideFiles: s.ideFiles,
              fileUrl: await getSqlDownloadUrl(s),
              studentName: s.student_name,
              studentId: s.user_id || s.student_id,
            }))
          ),
          rubric: formattedRubric,
          manifest: manifestObj,
          testCases: Array.isArray(rawManifest) ? rawManifest : (rawManifest?.testCases || []),
          assignmentId: assignmentId,
          assignmentTitle: assignment?.title,
          skipCache: true,
          reEvaluate: true,
        };

        const response = await postToEvaluatorWithRetry(evaluatorUrl, payload, {
          headers: { 'x-api-key': evaluatorApiKey },
          timeout: 45000,
        });

        const jobs = response.data.jobs || [response.data];
        jobs.forEach((job, index) => {
          jobIdsAndLinks.push({
            jobId: job.jobId || job.id,
            statusUrl: job.statusUrl,
            submissionId: validSubmissions[index].submission_id || validSubmissions[index].id,
            studentName: validSubmissions[index].student_name,
            studentId: validSubmissions[index].user_id || validSubmissions[index].student_id,
          });
        });
    } else {
        const typeMap = { REACT: 'react', PYTHON: 'python', FULLSTACK: 'fullstack', AI: 'backend', BACKEND: 'backend' };
        const payloadType = typeMap[effectiveType] || typeMap[effectiveType.toUpperCase()] || 'backend';

        let rubricObj = assignment.rubric;
        if (typeof assignment.rubric === 'string') {
          try {
            rubricObj = JSON.parse(assignment.rubric);
          } catch (e) {
            console.error('Failed to parse rubric:', e);
          }
        }

        let formattedRubric;
        if (rubricObj && Array.isArray(rubricObj)) {
          formattedRubric = { criteria: rubricObj };
        } else if (rubricObj && rubricObj.criteria && Array.isArray(rubricObj.criteria)) {
          formattedRubric = rubricObj;
        } else {
          formattedRubric = { criteria: [{ name: 'Standard Grading', weight: 100 }] };
        }

        // Normalize criteria fields (central-evaluator requires string 'name' and positive numeric 'weight')
        formattedRubric.criteria = (formattedRubric.criteria || []).map((c) => ({
          name: typeof c === 'string' ? c : (c.name || c.title || c.criterion || 'Standard Grading'),
          weight: typeof c === 'object' && Number(c.weight || c.marks || c.points || c.score) > 0 ? Number(c.weight || c.marks || c.points || c.score) : 10,
          description: typeof c === 'object' ? (c.description || '') : ''
        }));
        if (!formattedRubric.criteria.length) {
          formattedRubric.criteria = [{ name: 'Standard Grading', weight: 100 }];
        }

        let testCasesObj = assignment.test_cases;
        if (typeof testCasesObj === 'string') {
          try {
            testCasesObj = JSON.parse(testCasesObj);
          } catch (e) {
            console.error('Failed to parse test_cases:', e);
          }
        }
        if (testCasesObj && testCasesObj.specFile) {
          formattedRubric.specFile = testCasesObj.specFile;
        }

        for (const s of validSubmissions) {
          try {
            const targetRepoUrl = s.submission_file_url
              ? await presignS3Url(s.submission_file_url)
              : (s.submission_link ? await presignS3Url(s.submission_link) : null);
            const payload = {
              type: payloadType,
              submissionId: s.submission_id || s.id,
              repoUrl: targetRepoUrl,
              rubric: formattedRubric,
              skipCache: true,
              reEvaluate: true,
            };
            
            const response = await postToEvaluatorWithRetry(evaluatorUrl, payload, {
              headers: { 'x-api-key': evaluatorApiKey },
              timeout: 45000,
            });

            jobIdsAndLinks.push({
              jobId: response.data.jobId || response.data.id,
              statusUrl: response.data.statusUrl,
              submissionId: s.submission_id || s.id,
            });
          } catch (singleErr) {
            const errMsg = singleErr.response?.data?.error || singleErr.response?.data?.message || singleErr.message;
            console.error(`Failed to enqueue submission ${s.submission_id || s.id}:`, errMsg);
            const failFeedback = JSON.stringify({
              summary: `Submission failed: ${errMsg}`,
              strengths: [],
              issues: [errMsg],
              breakdown: [],
            });
            await client.query(
              `UPDATE evaluation_results 
               SET status = 'failed', marks = 0, feedback = $1::jsonb 
               WHERE evaluation_id = $2 AND submission_id = $3`,
              [failFeedback, evaluationId, s.submission_id || s.id]
            );
          }
        }
    }

    // Update the rows with job info (now guaranteed to exist)
    for (const j of jobIdsAndLinks) {
      await client.query(
        `UPDATE evaluation_results
         SET job_id = $1, status = 'pending', status_url = $2
         WHERE evaluation_id = $3 AND submission_id = $4`,
        [j.jobId, j.statusUrl, evaluationId, j.submissionId],
      );
    }

    // Recalculate total_submissions to account for newly added students,
    // then reset status to 'running' so the sync doesn't prematurely finish
    await client.query(
      `UPDATE evaluations
       SET status = 'running',
           total_submissions = (SELECT COUNT(*) FROM evaluation_results WHERE evaluation_id = $1)
       WHERE id = $1`,
      [evaluationId]
    );

    await client.query('COMMIT');

    return res.json({ success: true, message: "Re-evaluation started" });
  } catch (error) {
    await client.query('ROLLBACK');
    const evaluatorData = error.response?.data;
    const evaluatorMsg = (evaluatorData && typeof evaluatorData === 'object')
      ? (evaluatorData.error || evaluatorData.message)
      : (typeof evaluatorData === 'string' && evaluatorData.trim() ? evaluatorData : null);
    const errString = error?.toString && error.toString() !== '[object Object]' ? error.toString() : null;
    const finalMsg = evaluatorMsg || error.message || error.code || error.detail || errString || 'Evaluator request failed';
    console.error('Re-evaluate Full Error Dump:', {
      finalMsg,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      responseData: error.response?.data,
      stack: error.stack
    });
    return res.status(500).json({ 
      success: false, 
      message: finalMsg,
      errorDetail: error.message || error.code || error.response?.status || 'Unknown'
    });
  } finally {
    client.release();
  }
};

// 🛑 Stop / Cancel in-progress evaluation
exports.stopEvaluation = async (req, res) => {
  const { evaluationId, assignmentId } = req.body;
  const id = req.params.id || evaluationId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let targetEvalId = id;

    if (!targetEvalId && assignmentId) {
      const evalRes = await client.query(
        `SELECT id FROM evaluations 
         WHERE assignment_id = $1 OR college_assignment_id = $1 OR project_id = $1 
         ORDER BY created_at DESC LIMIT 1`,
        [assignmentId]
      );
      if (evalRes.rows.length > 0) {
        targetEvalId = evalRes.rows[0].id;
      }
    }

    if (!targetEvalId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Evaluation ID or Assignment ID is required.' });
    }

    const cancelFeedback = JSON.stringify({
      summary: 'Evaluation was stopped by facilitator.',
      strengths: [],
      issues: ['Evaluation stopped by facilitator before completion.'],
      breakdown: []
    });

    // Mark pending submissions as stopped/cancelled
    const updateResultsRes = await client.query(
      `UPDATE evaluation_results 
       SET status = 'cancelled', marks = 0, feedback = $1::jsonb 
       WHERE evaluation_id = $2 AND status = 'pending'
       RETURNING id`,
      [cancelFeedback, targetEvalId]
    );

    // Update evaluation status
    await client.query(
      `UPDATE evaluations 
       SET status = 'cancelled' 
       WHERE id = $1`,
      [targetEvalId]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Evaluation stopped successfully. ${updateResultsRes.rowCount} pending submission(s) cancelled.`,
      cancelledCount: updateResultsRes.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Stop evaluation error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};

