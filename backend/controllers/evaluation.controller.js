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
    const allowed = ['docs.google.com', 'sheets.google.com', 'onedrive.live.com', '1drv.ms', 'sharepoint.com'];
    if (allowed.some(h => host === h || host.endsWith('.' + h))) return true;
    const pathLower = parsed.pathname.toLowerCase();
    return pathLower.endsWith('.xlsx') || pathLower.endsWith('.xlsm') || parsed.search.toLowerCase().includes('format=xlsx');
  } catch {
    return false;
  }
}

function getSpreadsheetDownloadUrl(sub) {
  if (sub?.submission_file_url) return sub.submission_file_url;
  const link = (sub?.submission_link || '').trim();
  if (!link) return null;
  if (link.includes('docs.google.com/spreadsheets')) {
    const match = link.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
    }
  }
  return link;
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

    // Default to 'AI' if no specific evaluator is set — used for both the
    // stored record and the actual dispatch so they can never disagree.
    // Frontend can now override this using req.body.evaluatorType
    const evaluatorType = reqEvaluatorType || assignment.evaluator_type || 'AI';

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
      } else {
        validSubmissions = submissions.filter(
          (s) =>
            (s.submission_type === 'github' || (!s.submission_type && s.submission_link)) &&
            !!s.submission_link &&
            isAllowedGitUrl(s.submission_link),
        );
        nonGitSubmissions = submissions.filter(
          (s) =>
            (s.submission_type && s.submission_type !== 'github') ||
            (!s.submission_link && !!s.submission_file_url),
        );
        invalidSubmissions = submissions.filter(
          (s) =>
            (s.submission_type === 'github' || (!s.submission_type && !s.submission_file_url)) &&
            (!s.submission_link || !isAllowedGitUrl(s.submission_link)),
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
            : 'No repository URL provided by student.';
          if (invalid.submission_link) {
            try {
              const h = new URL(invalid.submission_link).hostname;
              reason = isExcelEvaluation
                ? `Invalid spreadsheet host (${h}). Submissions must be a Google Sheets link, OneDrive/SharePoint, or direct .xlsx file.`
                : `Invalid repository host (${h}). Submissions must be a public repository on GitHub, GitLab, or Bitbucket.`;
            } catch {
              reason = isExcelEvaluation
                ? 'Invalid spreadsheet URL format.'
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
          submissions: validSubmissions.map((s) => ({
            submissionId: s.submission_id || s.id,
            fileUrl: getSpreadsheetDownloadUrl(s),
            studentName: s.student_name,
            studentId: s.user_id || s.student_id,
          })),
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
          submissions: validSubmissions.map((s) => ({
            submissionId: s.submission_id || s.id,
            repoUrl: s.submission_link,
            studentName: s.student_name,
            studentId: s.user_id || s.student_id,
          })),
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
          const payload = {
            type: payloadType,
            submissionId: s.submission_id || s.id,
            repoUrl: s.submission_link,
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
      `SELECT id, status, total_submissions FROM evaluations WHERE id = $1`,
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

    for (const job of pendingJobsRes.rows) {
      try {
        if (!job.status_url) {
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

        const baseUrl = process.env.CENTRAL_EVALUATOR_URL || 'http://localhost:4000';
        const url = `${baseUrl}${job.status_url}`;
        const response = await axios.get(url, {
          headers: { 'x-api-key': process.env.CENTRAL_EVALUATOR_API_KEY },
        });

        const jobData = response.data.job || response.data;
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
      `SELECT e.*, COALESCE(a.title, c.title, p.title) as assignment_name
       FROM evaluations e
       LEFT JOIN assignments a ON e.assignment_id = a.id
       LEFT JOIN college_assignments c ON e.college_assignment_id = c.id
       LEFT JOIN projects p ON e.project_id = p.id
       WHERE e.id::text = $1 OR e.assignment_id::text = $1 OR e.college_assignment_id::text = $1 OR e.project_id::text = $1
       ORDER BY e.created_at DESC LIMIT 1`,
      [assignmentId],
    );

    if (evalRes.rows.length > 0) {
      // Evaluation exists, fetch results just like getEvaluationResults
      const evaluation = evalRes.rows[0];
      const resolvedAssignmentId =
        evaluation.college_assignment_id ||
        evaluation.project_id ||
        evaluation.assignment_id ||
        assignmentId;
      const values = [resolvedAssignmentId];
      let collegeFilter = '';
      if (isFacilitator) {
        values.push(facilitatorCollegeIds);
        collegeFilter = ' AND col.id = ANY($2::uuid[])';
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
         LEFT JOIN assignment_submissions s ON r.submission_id = s.id AND e.assignment_id IS NOT NULL
         LEFT JOIN college_assignment_submissions cs ON r.submission_id = cs.id AND e.college_assignment_id IS NOT NULL
         LEFT JOIN project_submissions ps ON r.submission_id = ps.id AND e.project_id IS NOT NULL
         LEFT JOIN student_profiles sp ON r.student_id = sp.user_id
         LEFT JOIN colleges col ON sp.college_id = col.id
         WHERE (e.assignment_id::text = $1 OR e.college_assignment_id::text = $1 OR e.project_id::text = $1 OR e.id::text = $1)
           ${collegeFilter}
         ORDER BY COALESCE(r.student_id, r.submission_id),
                  e.created_at DESC,
                  r.created_at DESC`,
        values,
      );

      const results = await Promise.all(
        resultsRes.rows.map(async (row) => ({
          ...row,
          submission_link: await presignS3Url(row.submission_link),
          submission_file_url: await presignS3Url(row.submission_file_url),
        })),
      );

      // Also fetch any NEW submissions that arrived after the evaluation was triggered
      // (they will have no evaluation_results row yet — show them as pending)
      const isCollege = !!evaluation.college_assignment_id;
      const isProj = !!evaluation.project_id;
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
          WHERE s.assignment_id = $1${newSubCollegeFilter}
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
          WHERE s.project_id = $1${newSubCollegeFilter}
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
          WHERE s.assignment_id = $1${newSubCollegeFilter}
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
            status: 'pending',
            marks: 0,
            feedback: null,
          }))
      );

      return res.json({
        success: true,
        evaluation: evaluation,
        results: [...results, ...pendingNewResults],
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
        status: 'pending',
        marks: 0,
        feedback: '-',
      }))
    );

    let assignmentInfo;
    if (isCollege) {
      assignmentInfo = await pool.query(
        `SELECT title, evaluator_type FROM college_assignments WHERE id = $1`,
        [assignmentId]
      );
    } else if (isProject) {
      assignmentInfo = await pool.query(
        `SELECT title, evaluator_type FROM projects WHERE id = $1`,
        [assignmentId]
      );
    } else {
      assignmentInfo = await pool.query(
        `SELECT title, evaluator_type FROM assignments WHERE id = $1`,
        [assignmentId]
      );
    }

    return res.json({
      success: true,
      evaluation: {
        id: null,
        assignment_id: assignmentId,
        assignment_name: assignmentInfo.rows[0]?.title || 'Capstone Project',
        evaluator_type: assignmentInfo.rows[0]?.evaluator_type || 'REACT',
        status: 'pending',
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
      `SELECT e.*, COALESCE(a.title, c.title, p.title) as assignment_name,
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
       LEFT JOIN assignment_submissions s ON r.submission_id = s.id AND e.assignment_id IS NOT NULL
       LEFT JOIN college_assignment_submissions cs ON r.submission_id = cs.id AND e.college_assignment_id IS NOT NULL
       LEFT JOIN project_submissions ps ON r.submission_id = ps.id AND e.project_id IS NOT NULL
       LEFT JOIN student_profiles sp ON r.student_id = sp.user_id
       LEFT JOIN colleges col ON sp.college_id = col.id
       WHERE r.evaluation_id = $1${collegeFilter}`,
      values,
    );

    const results = await Promise.all(
      resultsRes.rows.map(async (row) => ({
        ...row,
        submission_link: await presignS3Url(row.submission_link),
        submission_file_url: await presignS3Url(row.submission_file_url),
      })),
    );

    res.json({
      success: true,
      evaluation: evalRes.rows[0],
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
      systemPrompt = `You are an expert technical curriculum designer. Your task is to generate strict JSON test case configurations for an automated Excel spreadsheet grading system across ANY assignment domain (finance, sales, HR, operations, science, basic marksheet, lookups, pivots, dashboards, or capstones).
    
Based on the Assignment Title, Instructions, and Evaluation Rubric provided by the user, you must output ONLY a raw JSON array of test case objects. DO NOT output any markdown blocks like \`\`\`json, just output the raw JSON string starting with [ and ending with ].

CRITICAL DYNAMIC MAPPING RULES:
1. STRICT 1-TO-1 CRITERIA BINDING:
   - When an Evaluation Rubric is provided, EVERY generated test case MUST contain a "criterion" property whose value EXACTLY and VERBATIM matches the "name" of one of the criteria in the provided Evaluation Rubric.
   - Every criterion in the provided rubric MUST have at least one corresponding test case.
   - If no rubric is provided, dynamically analyze the instructions to identify the core deliverables (e.g. Data Entry, Formulas, Formatting, Lookups, Charts), create clear descriptive criterion names, and assign test cases to them.

2. DYNAMIC TEST CASE TYPES & SCHEMAS:
Use the appropriate test case type depending on what each criterion evaluates:

A. "formula_range_check":
Verifies that a column/range contains dynamic formulas without static hardcoded numbers or anti-cheat violations.
{
  "criterion": "<Exact Rubric Criterion Name>",
  "type": "formula_range_check",
  "range": "F2:F20",
  "mustBeFormula": true,
  "forbiddenConstants": true,
  "acceptedFunctions": ["SUM", "AVERAGE"] // Optional: list required functions
}

B. "function_check":
Verifies specific spreadsheet functions are used (Text, Logic, Lookups, Cleaners).
- Text manipulation (CONCAT, LEFT, MID, RIGHT, PROPER, TRIM):
  {
    "criterion": "<Exact Rubric Criterion Name>",
    "type": "function_check",
    "range": "B2:B20",
    "acceptedFunctions": ["PROPER", "TRIM"]
  }
- Logical conditions (IF, AND, OR, IFERROR):
  {
    "criterion": "<Exact Rubric Criterion Name>",
    "type": "function_check",
    "range": "G2:G20",
    "acceptedFunctions": ["IF", "AND", "OR", "IFERROR"]
  }
- Lookup functions (VLOOKUP, XLOOKUP, INDEX, MATCH):
  {
    "criterion": "<Exact Rubric Criterion Name>",
    "type": "function_check",
    "range": "E2:E20",
    "acceptedFunctions": ["VLOOKUP", "XLOOKUP"],
    "requireAbsoluteReferences": true // Set true if table array must use absolute references ($)
  }

C. "value_check":
CRITICAL ANTI-HALLUCINATION RULE:
- ONLY generate a "value_check" with "expectedValue" IF the assignment instructions EXPLICITLY specify the exact input numbers (e.g. quantity, price, student marks) so you can calculate the exact mathematical answer.
- If specific data numbers are NOT given in the instructions (or students enter their own data), DO NOT GUESS OR INVENT NUMBERS, AND NEVER USE "expectedValue": 0! Instead, verify the calculation using "function_check" (acceptedFunctions: ["SUM", "AVERAGE", etc.]) or "formula_range_check"!
{
  "criterion": "<Exact Rubric Criterion Name>",
  "type": "value_check",
  "cell": "F21",
  "expectedValue": 25000,
  "tolerance": 0.05
}

D. "format_check":
CRITICAL INSTRUCTION FIDELITY RULE:
- ONLY test formatting properties that are EXPLICITLY requested in the instructions or rubric!
- DO NOT set "hasFill": true unless the instructions specifically say "fill background color", "highlight", or "shading".
- DO NOT set "hasBorder": true unless the instructions explicitly say "border".
- DO NOT set "bold": true unless the instructions explicitly say "bold".
{
  "criterion": "<Exact Rubric Criterion Name>",
  "type": "format_check",
  "range": "A1:F1",
  "bold": true
}
(For decimal or currency formatting):
{
  "criterion": "<Exact Rubric Criterion Name>",
  "type": "format_check",
  "range": "F2:F21",
  "numberFormat": "decimal", // Options: "decimal" (for 0.00), "currency", "percent"
  "hasBorder": true
}

E. "data_check":
Verifies that all table cells in a range contain non-empty entered data (catches missing rows or unremoved duplicates).
{
  "criterion": "<Exact Rubric Criterion Name>",
  "type": "data_check",
  "range": "A2:E10",
  "disallowBlanks": true
}

F. "chart_check":
Verifies that a chart or graph exists with specified type and title.
{
  "criterion": "<Exact Rubric Criterion Name>",
  "type": "chart_check",
  "chartType": "column", // Options: "column", "bar", "line", "pie", "area"
  "title": "Sales Performance"
}

G. "pivot_check":
Verifies that native Pivot Table exists with required data fields.
{
  "criterion": "<Exact Rubric Criterion Name>",
  "type": "pivot_check",
  "minPivotTables": 1,
  "requiredField": "Sales"
}

H. "macro_check":
Verifies that VBA macros and subroutines exist in workbook.
{
  "criterion": "<Exact Rubric Criterion Name>",
  "type": "macro_check",
  "requireVba": true,
  "requiredSub": "CalculateTotal"
}

I. "formula_behavior_check":
Tests formula responsiveness by mutating input cells on temporary copies and verifying updated outputs.
{
  "criterion": "<Exact Rubric Criterion Name>",
  "type": "formula_behavior_check",
  "inputs": [{ "cell": "B2", "value": 15000 }],
  "expectedOutputs": [{ "cell": "C2", "expectedValue": 1500 }]
}

3. SHEET TARGETING:
If the instructions mention a specific worksheet name (e.g. "on a sheet named 'Sales'" or "Sheet: Marksheet"), you MUST include "sheet": "Sales" in EVERY generated test case!

4. CRITICAL RULE FOR INTRODUCTORY / DATA ENTRY ASSIGNMENTS:
If the instructions only ask students to enter data and format it (bold headers, borders, currency formatting) with NO calculations or formulas requested, DO NOT generate "formula_range_check". Instead, generate "data_check" for data completeness and "format_check" for styling!

Do not include any explanation. Output ONLY the raw JSON array starting with [ and ending with ].`;
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

    const userPrompt = `Assignment Title: ${title || 'Untitled'}

Instructions:
${instructions}

Evaluation Rubric:
${normalizedRubric ? JSON.stringify(normalizedRubric, null, 2) : 'No rubric provided'}`;

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
      const sheetMatch = instructions.match(/(?:sheet|worksheet)\s+(?:named|called)\s+["']?([^"'\s.,;]+)["']?/i);
      const targetSheet = sheetMatch && sheetMatch[1] ? sheetMatch[1].trim() : null;

      for (let i = parsedJson.length - 1; i >= 0; i--) {
        const tc = parsedJson[i];
        if (!tc) continue;

        // Auto-inject sheet name if specified in instructions and not set
        if (targetSheet && !tc.sheet) {
          tc.sheet = targetSheet;
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

        // Sanitize format_check: Strip hasFill if instructions never asked for background fill
        if (tc.type === 'format_check' && tc.hasFill && !mentionsFill) {
          delete tc.hasFill;
        }
      }
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

    let systemPrompt = `You are an expert technical curriculum designer. Your task is to generate a strict JSON evaluation rubric for an automated code grading system.
    
Based on the Assignment Title and Instructions provided by the user, you must output ONLY a raw JSON array of objects. DO NOT output any markdown blocks like \`\`\`json, just output the raw JSON string starting with [ and ending with ].

CRITICAL RULES:
1. The output MUST be a JSON array of objects.
2. Each object must have exactly three keys: "name" (string), "description" (string), and "weight" (number).
3. The sum of all "weight" values MUST equal exactly 100.
4. If the user instructions include an existing rubric with a different total (e.g. 20 marks or 50 marks), you MUST proportionally scale each criterion's weight so the total equals exactly 100.
5. Each "name" must be UNIQUE. Do not use the same name twice.
6. Do not include any explanation.
7. ASSIGNMENT COMPLEXITY ADAPTATION:
Identify the complexity of the assignment based on the title and instructions:
- **Simple / Introductory Class Exercise** (e.g., introductory topics, basic tags, simple scripts, small practice tasks):
  - Generate 2-3 simple, highly focused criteria.
  - ONLY assess features explicitly mentioned in the instructions.
- **Standard Project / Mid-level Assignment** (e.g., building a complete component, a landing page, a standard CRUD feature):
  - Generate 3-4 criteria.
- **Advanced / Complex Assignment** (e.g., production-grade features, complex workflows, full applications, capstones):
  - Generate 4-7 strict criteria.`;

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
      systemPrompt += `\n8. For Excel Spreadsheet assignments, generate criteria tailored dynamically to the tasks described in the instructions.
- If the instructions provide specific milestones or rubric criteria (e.g., SUM formula, AVERAGE formula, Text to Columns, VLOOKUP, Absolute references, Pivot Table, Conditional Formatting, Charts), generate criteria names that directly reflect those milestones.
- Otherwise, use clear descriptive names representing the core competencies:
  - "Formulas & Dynamic Calculations" (SUM, AVERAGE, arithmetic, dynamic cell references)
  - "Text & String Functions" (CONCAT, LEFT, MID, RIGHT, PROPER, TRIM)
  - "Lookup & Reference Functions" (VLOOKUP, XLOOKUP, INDEX/MATCH, absolute reference $)
  - "Logical & Error Handling" (IF, nested IF, AND, OR, IFERROR)
  - "Summary & Numerical Accuracy" (Grand Totals, Net Profit, calculated accuracy)
  - "Pivot Tables & Aggregations" (Pivot Tables, rows, values, summaries)
  - "Charts & Visualizations" (Charts, graphs, dashboards, KPIs)
  - "Data Cleaning & Deduplication" (Removing duplicates, filling blanks, splitting text)
  - "Data Entry & Table Completeness" (Populated rows, no missing data)
  - "Data Formatting & Structure" (Borders, bold headers, decimal 0.00, currency formatting)
  - "VBA & Macros Automation" (VBA procedures, automation)
- CRITICAL RULE FOR EXCEL: If the instructions only ask students to enter data and format it (e.g., introductory table entries) with NO calculations or formulas requested, DO NOT include "Formulas & Dynamic Calculations". Use "Data Entry & Table Completeness" and "Data Formatting & Structure".
- REMINDER: Weights MUST sum to exactly 100. Scale proportionally if original marks are given.`;
    }

    systemPrompt += `

Example output:
[
  { "name": "${evaluatorType === 'react' ? 'State Updates' : (evaluatorType === 'backend' ? 'API Endpoints' : (evaluatorType?.toLowerCase() === 'fullstack' ? 'Fullstack Integration' : (evaluatorType?.toLowerCase() === 'excel' ? 'Formulas & Dynamic Calculations' : 'Feature A')))}", "description": "Implements calculations correctly.", "weight": 40 },
  { "name": "${evaluatorType === 'react' ? 'Components Render Correctly' : (evaluatorType === 'backend' ? 'Database Operations' : (evaluatorType?.toLowerCase() === 'fullstack' ? 'Backend API & Routing' : (evaluatorType?.toLowerCase() === 'excel' ? 'Summary & Numerical Accuracy' : 'Feature B')))}", "description": "Totals match expected values.", "weight": 40 },
  { "name": "${evaluatorType?.toLowerCase() === 'excel' ? 'Data Formatting & Structure' : 'Code Quality & Structure'}", "description": "Clean and readable layout.", "weight": 20 }
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
    return res.status(500).json({ success: false, message: "Internal server error during generation" });
  }
};

exports.reEvaluateSubmission = async (req, res) => {
  let { evaluationId, assignmentId, submissionIds, evaluatorType } = req.body;
  if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0 || !evaluatorType) {
    return res.status(400).json({ success: false, message: 'an array of submissionIds, and evaluatorType are required' });
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
           WHERE s.id::text = ANY($1::text[])`
        : isProject
        ? `SELECT s.id as submission_id, s.user_id, u.full_name as student_name
           FROM project_submissions s
           JOIN users u ON s.user_id = u.id
           WHERE s.id::text = ANY($1::text[])`
        : `SELECT s.id as submission_id, s.user_id, u.full_name as student_name
           FROM assignment_submissions s
           JOIN users u ON s.user_id = u.id
           WHERE s.id::text = ANY($1::text[])`,
        [submissionIds]
      );
      
      for (const s of initialSubmissionsRes.rows) {
        await client.query(
          `INSERT INTO evaluation_results 
           (evaluation_id, submission_id, student_id, student_name, status, marks, feedback) 
           VALUES ($1, $2, $3, $4, 'pending', 0, '-')
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
              WHERE ${isCollegeAssignment ? 'college_assignment_id' : isProject ? 'project_id' : 'assignment_id'}::text = $2::text
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
         WHERE s.id::text = ANY($1::text[])
            OR s.id::text IN (SELECT submission_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)
            OR s.student_id::text IN (SELECT student_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)`
      : isProject
      ? `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.user_id, u.full_name as student_name
         FROM project_submissions s
         JOIN users u ON s.user_id = u.id
         WHERE s.id::text = ANY($1::text[])
            OR s.id::text IN (SELECT submission_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)
            OR s.user_id::text IN (SELECT student_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)`
      : `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.submission_type, s.user_id, u.full_name as student_name
         FROM assignment_submissions s
         JOIN users u ON s.user_id = u.id
         WHERE s.id::text = ANY($1::text[])
            OR s.id::text IN (SELECT submission_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)
            OR s.user_id::text IN (SELECT student_id::text FROM evaluation_results WHERE id::text = ANY($1::text[]) AND evaluation_id::text = $2::text)`;
         
    const submissionsRes = await client.query(queryStr, [submissionIds, evaluationId]);
    const submissions = submissionsRes.rows;

    if (!submissions.length) {
      // Fallback: fetch any active submissions for this evaluation if IDs were slightly mismatched
      const fallbackQuery = isCollegeAssignment
        ? `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.submission_type, s.student_id as user_id, u.full_name as student_name
           FROM college_assignment_submissions s
           JOIN users u ON s.student_id = u.id
           JOIN evaluation_results er ON er.submission_id::text = s.id::text OR er.student_id::text = s.student_id::text
           WHERE er.evaluation_id::text = $1::text`
        : isProject
        ? `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.user_id, u.full_name as student_name
           FROM project_submissions s
           JOIN users u ON s.user_id = u.id
           JOIN evaluation_results er ON er.submission_id::text = s.id::text OR er.student_id::text = s.user_id::text
           WHERE er.evaluation_id::text = $1::text`
        : `SELECT s.id as submission_id, s.submission_link, s.submission_file_url, s.submission_type, s.user_id, u.full_name as student_name
           FROM assignment_submissions s
           JOIN users u ON s.user_id = u.id
           JOIN evaluation_results er ON er.submission_id::text = s.id::text OR er.student_id::text = s.user_id::text
           WHERE er.evaluation_id::text = $1::text`;
      const fallbackRes = await client.query(fallbackQuery, [evaluationId]);
      if (fallbackRes.rows.length > 0) {
        submissions.push(...fallbackRes.rows);
      } else {
        throw new Error('Submissions not found for re-evaluation');
      }
    }

    // Resolve effective evaluator type (falling back to assignment's configured type if defaulted to REACT)
    const effectiveType = (!evaluatorType || evaluatorType === 'REACT')
      ? (assignment.evaluator_type || evaluatorType || 'AI')
      : evaluatorType;

    const isExcelEvaluation = (effectiveType === 'EXCEL' || effectiveType === 'excel');

    const validSubmissions = submissions.filter((s) =>
      isExcelEvaluation
        ? !!(s.submission_file_url || (s.submission_link && isAllowedSpreadsheetUrl(s.submission_link)))
        : isAllowedGitUrl(s.submission_link)
    );
    const invalidSubmissions = submissions.filter((s) =>
      isExcelEvaluation
        ? !(s.submission_file_url || (s.submission_link && isAllowedSpreadsheetUrl(s.submission_link)))
        : !isAllowedGitUrl(s.submission_link)
    );

    if (invalidSubmissions.length > 0) {
      for (const invalid of invalidSubmissions) {
        let reason = isExcelEvaluation
          ? 'No spreadsheet URL or file provided by student.'
          : 'No repository URL provided by student.';
        if (invalid.submission_link) {
          try {
            const h = new URL(invalid.submission_link).hostname;
            reason = isExcelEvaluation
              ? `Invalid spreadsheet host (${h}). Submissions must be a Google Sheets link, OneDrive/SharePoint, or direct .xlsx file.`
              : `Invalid repository host (${h}). Submissions must be a public repository on GitHub, GitLab, or Bitbucket.`;
          } catch {
            reason = isExcelEvaluation
              ? 'Invalid spreadsheet URL format.'
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

        for (const s of validSubmissions) {
          const fileUrl = getSpreadsheetDownloadUrl(s);

          const payload = {
            type: 'excel',
            submissionId: s.submission_id || s.id,
            fileUrl: fileUrl,
            rubric: formattedRubric,
            testCases: Array.isArray(rawTestCases) ? rawTestCases : (rawTestCases?.testCases || [])
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
        }
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
          const payload = {
            type: payloadType,
            submissionId: s.submission_id || s.id,
            repoUrl: s.submission_link,
            rubric: formattedRubric,
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
        }
    }

    // First ensure evaluation_results rows exist for all submissions being evaluated
    // (covers new students who submitted after the original evaluation was created)
    const submissionsForUpsert = submissionsRes.rows;
    for (const s of submissionsForUpsert) {
      await client.query(
        `INSERT INTO evaluation_results 
           (evaluation_id, submission_id, student_id, student_name, status, marks, feedback)
         VALUES ($1, $2, $3, $4, 'pending', 0, '')
         ON CONFLICT (evaluation_id, submission_id) DO NOTHING`,
        [evaluationId, s.submission_id, s.user_id || s.student_id, s.student_name]
      );
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

