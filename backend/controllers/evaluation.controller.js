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
exports.runEvaluation = async (req, res) => {
  const { assignmentId, evaluatorType: reqEvaluatorType, scope = 'pending' } = req.body;

  if (!assignmentId) {
    return res.status(400).json({ success: false, message: 'Assignment ID is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Try fetching from curriculum assignments first
    let assignmentRes = await client.query(
      `SELECT a.id, a.title, a.evaluator_type, a.test_cases, a.rubric, 'unit' as type, t.subject_id
       FROM assignments a
       JOIN units u ON a.unit_id = u.id
       JOIN topics t ON u.topic_id = t.id
       WHERE a.id = $1`,
      [assignmentId],
    );

    let assignment = assignmentRes.rows[0];
    let isCollegeAssignment = false;

    // 2. If not found, try facilitator-created college assignments
    if (!assignment) {
      assignmentRes = await client.query(
        `SELECT id, title, evaluator_type, test_cases, rubric, 'college' as type, college_id, created_by, course
         FROM college_assignments
         WHERE id = $1`,
        [assignmentId],
      );
      assignment = assignmentRes.rows[0];
      isCollegeAssignment = true;
    }

    if (!assignment) {
      throw new Error('Assignment not found');
    }

    // Guard facilitator access
    if (req.user.role === 'facilitator') {
      const subjectIds = req.user.subject_ids || [];
      const collegeIds = req.user.college_ids || [];
      if (!isCollegeAssignment) {
        if (!subjectIds.includes(assignment.subject_id)) {
          throw new Error('Access denied: Assignment does not belong to your assigned subjects');
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
              WHERE (e.assignment_id = $1 OR e.college_assignment_id = $1) AND r.status = 'completed'
            )`
        : '';

    const subParams = [assignmentId];
    let facSubFilter = '';
    if (req.user.role === 'facilitator') {
      subParams.push(req.user.college_ids || []);
      facSubFilter = ` AND sp.college_id = ANY($${subParams.length}::uuid[])`;
    }

    const queryStr = isCollegeAssignment
      ? `SELECT
          s.id as submission_id,
          s.submission_link,
          s.student_id as user_id,
          u.full_name as student_name
         FROM college_assignment_submissions s
         JOIN users u ON s.student_id = u.id
         JOIN student_profiles sp ON sp.user_id = u.id
         WHERE s.assignment_id = $1${scopeFilter}${facSubFilter}`
      : `SELECT
          s.id as submission_id,
          s.submission_link,
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
    // college assignments use a separate FK column to avoid violating assignments FK
    const evalRes = await client.query(
      isCollegeAssignment
        ? `INSERT INTO evaluations
           (college_assignment_id, evaluator_type, status, total_submissions)
           VALUES ($1, $2, 'running', $3)
           RETURNING *`
        : `INSERT INTO evaluations
           (assignment_id, evaluator_type, status, total_submissions)
           VALUES ($1, $2, 'running', $3)
           RETURNING *`,
      [assignmentId, evaluatorType, submissions.length],
    );

    const evaluation = evalRes.rows[0];

    //validation
    if (evaluatorType === 'JS' && !assignment.test_cases) {
      throw new Error('Test cases missing for JS evaluator');
    }
    if (evaluatorType === 'REACT' && !assignment.rubric) {
      throw new Error('Rubric missing for REACT evaluator');
    }

    const evaluatorUrl = `${process.env.CENTRAL_EVALUATOR_URL}/evaluate`;
    const evaluatorApiKey = process.env.CENTRAL_EVALUATOR_API_KEY;

    console.log('Evaluator service api & key: ', evaluatorUrl, evaluatorApiKey);

    let isMock = false;
    let jobIdsAndLinks = []; // { jobId, statusUrl, submissionId, studentName, studentId }

    try {
      // Filter out submissions with no link or non-git link to prevent failing the entire batch
      const validSubmissions = submissions.filter((s) => isAllowedGitUrl(s.submission_link));
      const invalidSubmissions = submissions.filter((s) => !isAllowedGitUrl(s.submission_link));

      if (invalidSubmissions.length > 0) {
        console.warn(
          `Skipped ${invalidSubmissions.length} submissions due to missing or non-git repoUrl.`,
        );
        // Instantly mark them as failed in the DB
        for (const invalid of invalidSubmissions) {
          let reason = 'No repository URL provided by student.';
          if (invalid.submission_link) {
            try {
              const h = new URL(invalid.submission_link).hostname;
              reason = `Invalid repository host (${h}). Submissions must be a public repository on GitHub, GitLab, or Bitbucket.`;
            } catch {
              reason = 'Invalid repository URL format. Must be a valid HTTP/HTTPS git repository URL.';
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

      if (validSubmissions.length === 0) {
        throw new Error(
          'No valid submissions with repository links found to evaluate.',
        );
      }

      // Create payloads based on evaluator type capabilities
      // visual and javascript accept arrays. backend and react accept singles.
      if (evaluatorType === 'JS' || evaluatorType === 'VISUAL' || evaluatorType === 'javascript' || evaluatorType === 'visual' || evaluatorType === 'PYTHON' || evaluatorType === 'python') {
        const payloadType = (evaluatorType === 'JS') ? 'javascript' : (evaluatorType === 'VISUAL' ? 'visual' : (evaluatorType === 'PYTHON' ? 'python' : evaluatorType));
        
        let jsConfig = { testCases: assignment.test_cases };
        
        // If test_cases is a JSON object containing advanced JS configs, extract them
        if ((payloadType === 'javascript' || payloadType === 'python') && assignment.test_cases && typeof assignment.test_cases === 'object' && !Array.isArray(assignment.test_cases)) {
           jsConfig = {
             testCases: assignment.test_cases.testCases || [],
             evaluationMode: assignment.test_cases.evaluationMode || 'function',
             entryFunction: assignment.test_cases.entryFunction,
             functions: assignment.test_cases.functions,
             expectedLogs: assignment.test_cases.expectedLogs
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

        const url = `${process.env.CENTRAL_EVALUATOR_URL}${job.status_url}`;
        const response = await axios.get(url, {
          headers: { 'x-api-key': process.env.CENTRAL_EVALUATOR_API_KEY },
        });

        const jobData = response.data.job || response.data;
        const jobState = jobData.status || jobData.state;

        if (jobState === 'completed' || jobState === 'failed') {
          console.log(`Job ${job.id} state: ${jobState}`);
          let marks = 0;
          let feedback = '';

          if (jobState === 'completed' && jobData.result) {
            const resData =
              jobData.result.results ||
              jobData.result.evaluation ||
              jobData.result.result ||
              jobData.result;
            const finalData = Array.isArray(resData) ? resData[0] : resData;

            marks = finalData?.score ?? finalData?.marks ?? 0;
            if (marks !== null && typeof marks === 'object' && marks.score !== undefined) {
              marks = marks.score;
            }
            feedback =
              finalData?.rubricFeedback ||
              finalData?.feedback ||
              finalData?.error ||
              'Evaluation completed successfully.';
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
          } else if (jobState === 'failed') {
            feedback = { summary: `Evaluation Failed: ${jobData.failedReason || 'Unknown error'}`, strengths: [], issues: [], breakdown: [] };
          }

          await pool.query(
            `UPDATE evaluation_results SET status = 'completed', marks = $1, feedback = $2::jsonb WHERE id = $3`,
            [marks, JSON.stringify(feedback), job.id],
          );
          newlyCompleted++;

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
       WHERE assignment_id = $1 OR college_assignment_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [assignmentId],
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({
          success: false,
          message: 'No evaluation found for this assignment',
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
        }
      }
    }

    // Check if evaluation exists
    const evalRes = await pool.query(
      `SELECT e.*, COALESCE(a.title, c.title) as assignment_name
       FROM evaluations e
       LEFT JOIN assignments a ON e.assignment_id = a.id
       LEFT JOIN college_assignments c ON e.college_assignment_id = c.id
       WHERE e.assignment_id = $1 OR e.college_assignment_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [assignmentId],
    );

    if (evalRes.rows.length > 0) {
      // Evaluation exists, fetch results just like getEvaluationResults
      const evaluation = evalRes.rows[0];
      const values = [evaluation.id];
      let collegeFilter = '';
      if (isFacilitator) {
        values.push(facilitatorCollegeIds);
        collegeFilter = ' AND col.id = ANY($2)';
      }

      const resultsRes = await pool.query(
        `SELECT r.*,
                COALESCE(s.submission_link, cs.submission_link) as submission_link,
                cs.submission_file_url as submission_file_url,
                sp.expected_graduation_year,
                col.name as college_name,
                col.id as college_id
         FROM evaluation_results r
         JOIN evaluations e ON r.evaluation_id = e.id
         LEFT JOIN assignment_submissions s ON r.submission_id = s.id AND e.assignment_id IS NOT NULL
         LEFT JOIN college_assignment_submissions cs ON r.submission_id = cs.id AND e.college_assignment_id IS NOT NULL
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

      // Also fetch any NEW submissions that arrived after the evaluation was triggered
      // (they will have no evaluation_results row yet — show them as pending)
      const isCollege = !!evaluation.college_assignment_id;
      const evaluatedSubmissionIds = resultsRes.rows.map((r) => r.submission_id).filter(Boolean);

      let newSubValues = [assignmentId];
      let newSubCollegeFilter = '';
      if (isFacilitator) {
        newSubValues.push(facilitatorCollegeIds);
        newSubCollegeFilter = ' AND col.id = ANY($2)';
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
    const isCollegeAssignment = await pool.query(`SELECT id FROM college_assignments WHERE id = $1`, [assignmentId]);
    const isCollege = isCollegeAssignment.rows.length > 0;

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
        WHERE s.assignment_id = $1
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
      submissionQuery += ` AND col.id = ANY($2)`;
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

    const assignmentInfo = await pool.query(
      `SELECT title, evaluator_type FROM ${isCollege ? 'college_assignments' : 'assignments'} WHERE id = $1`,
      [assignmentId]
    );

    return res.json({
      success: true,
      evaluation: {
        id: null,
        assignment_id: assignmentId,
        assignment_name: assignmentInfo.rows[0]?.title,
        evaluator_type: assignmentInfo.rows[0]?.evaluator_type || 'REACT',
        status: 'pending',
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
      `SELECT e.*, COALESCE(a.title, c.title) as assignment_name,
              t.subject_id as curriculum_subject_id,
              c.college_id as college_assignment_college_id,
              c.course as college_assignment_course,
              c.created_by as college_assignment_created_by
       FROM evaluations e
       LEFT JOIN assignments a ON e.assignment_id = a.id
       LEFT JOIN units u ON a.unit_id = u.id
       LEFT JOIN topics t ON u.topic_id = t.id
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
      if (evaluation.assignment_id && evaluation.curriculum_subject_id) {
        if (!facilitatorSubjectIds.includes(evaluation.curriculum_subject_id)) {
          return res.status(403).json({ success: false, message: 'Access denied: Assignment does not belong to your assigned subjects' });
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
              COALESCE(s.submission_link, cs.submission_link) as submission_link,
              cs.submission_file_url as submission_file_url,
              sp.expected_graduation_year,
              col.name as college_name,
              col.id as college_id
       FROM evaluation_results r
       JOIN evaluations e ON r.evaluation_id = e.id
       LEFT JOIN assignment_submissions s ON r.submission_id = s.id AND e.assignment_id IS NOT NULL
       LEFT JOIN college_assignment_submissions cs ON r.submission_id = cs.id AND e.college_assignment_id IS NOT NULL
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

    const systemPrompt = `You are an expert technical curriculum designer. Your task is to generate strict JSON test case configurations for an automated code grading system.
    
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

    const userPrompt = `Assignment Title: ${title || 'Untitled'}

Instructions:
${instructions}

Evaluation Rubric:
${rubric ? JSON.stringify(rubric, null, 2) : 'No rubric provided'}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "deepseek-v4-flash",
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
4. Each "name" must be UNIQUE. Do not use the same name twice.
5. Do not include any explanation.
6. ASSIGNMENT COMPLEXITY ADAPTATION:
Identify the complexity of the assignment based on the title and instructions:
- **Simple / Introductory Class Exercise** (e.g., introductory topics, basic tags, simple scripts, small practice tasks):
  - Generate 2-3 simple, highly focused criteria.
  - ONLY assess features explicitly mentioned in the instructions.
  - DO NOT include advanced/generic engineering constraints like ARIA/accessibility, responsive design, complex optimization, database index scaling, security/encryption, or robust error handling unless explicitly requested in the instructions. Keep criteria simple and direct.
- **Standard Project / Mid-level Assignment** (e.g., building a complete component, a landing page, a standard CRUD feature):
  - Generate 3-4 criteria.
  - May include standard development practices (e.g., basic code structure, clean formatting, simple responsive layout if HTML/CSS).
- **Advanced / Complex Assignment** (e.g., production-grade features, complex workflows, full applications):
  - Generate 4-6 strict criteria.
  - Include rigorous requirements like edge-case handling, security/auth, ARIA/accessibility, performance, and advanced architecture patterns.`;

    if (evaluatorType === 'react') {
      systemPrompt += `\n7. For React assignments, the "name" field MUST be chosen strictly from the following exact predefined list:
- "Components Render Correctly" (Use for UI rendering / layout)
- "State Updates" (Use for React state management, hooks)
- "Props Handling" (Use for props passing, data flow)
- "Routing Works" (Use for React Router or navigation)
- "API Integration" (Use for fetch/axios/data fetching)
- "Code Structure" (Use for clean code, standard practices)
You may choose 2-5 from this list based on the instructions and the complexity rules above, but YOU MUST NOT INVENT CUSTOM NAMES outside of this exact list.`;
    } else if (evaluatorType === 'backend' || evaluatorType === 'AI') {
      systemPrompt += `\n7. For Backend assignments, the "name" field MUST be chosen strictly from the following exact predefined list:
- "API Endpoints" (Use for routing, endpoints, HTTP methods)
- "Database Operations" (Use for Models, Schemas, Queries, CRUD)
- "Middleware & Auth" (Use for error handling, JWT, authentication)
- "Controller Logic" (Use for business logic, data formatting)
- "Code Structure" (Use for clean code, separation of concerns, MVC)
You may choose 2-5 from this list based on the instructions and the complexity rules above, but YOU MUST NOT INVENT CUSTOM NAMES outside of this exact list.`;
    } else if (evaluatorType?.toLowerCase() === 'fullstack') {
      systemPrompt += `\n7. For Fullstack assignments, the "name" field MUST be chosen strictly from the following exact predefined list:
- "Frontend UI & Components" (Use for React rendering, responsive design, structure)
- "Frontend State & Data Fetching" (Use for React state, hooks, fetch/axios)
- "Backend API & Routing" (Use for Express routes, HTTP methods, CORS)
- "Backend Logic & Database" (Use for business logic, validation, database models)
- "Fullstack Integration" (Use for end-to-end data flow between client and server)
- "Code Quality & Structure" (Use for clean code, file structure, package.json across both environments)
You must select 3-6 criteria from this list that cover both Frontend and Backend, based on the instructions and complexity rules above. YOU MUST NOT INVENT CUSTOM NAMES outside of this exact list.`;
    }

    systemPrompt += `

Example output:
[
  { "name": "${evaluatorType === 'react' ? 'State Updates' : (evaluatorType === 'backend' ? 'API Endpoints' : (evaluatorType?.toLowerCase() === 'fullstack' ? 'Fullstack Integration' : 'Feature A'))}", "description": "Implements endpoints correctly.", "weight": 40 },
  { "name": "${evaluatorType === 'react' ? 'Components Render Correctly' : (evaluatorType === 'backend' ? 'Database Operations' : (evaluatorType?.toLowerCase() === 'fullstack' ? 'Backend API & Routing' : 'Feature B'))}", "description": "Implements logic correctly.", "weight": 40 },
  { "name": "Code Quality & Structure", "description": "Clean and readable code.", "weight": 20 }
]`;

    const userPrompt = `Assignment Title: ${title || 'Untitled'}

Instructions:
${instructions}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "deepseek-v4-flash",
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

    // Auto-create evaluation if evaluationId is missing
    if (!evaluationId) {
      if (!assignmentId) throw new Error("Either evaluationId or assignmentId must be provided");

      const isCollegeAssignmentRes = await client.query(`SELECT id FROM college_assignments WHERE id = $1`, [assignmentId]);
      isCollegeAssignment = isCollegeAssignmentRes.rows.length > 0;
      
      const newEval = await client.query(
        `INSERT INTO evaluations (assignment_id, college_assignment_id, evaluator_type, status, total_submissions)
         VALUES ($1, $2, $3, 'running', $4) RETURNING id`,
        [isCollegeAssignment ? null : assignmentId, isCollegeAssignment ? assignmentId : null, evaluatorType, submissionIds.length]
      );
      evaluationId = newEval.rows[0].id;
      
      // Pre-create the evaluation_results rows for pending state
      const initialSubmissionsRes = await client.query(
        isCollegeAssignment
        ? `SELECT s.id as submission_id, s.student_id as user_id, u.full_name as student_name
           FROM college_assignment_submissions s
           JOIN users u ON s.student_id = u.id
           WHERE s.id = ANY($1)`
        : `SELECT s.id as submission_id, s.user_id, u.full_name as student_name
           FROM assignment_submissions s
           JOIN users u ON s.user_id = u.id
           WHERE s.id = ANY($1)`,
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
    } else {
      // Fetch the evaluation to get assignmentId or collegeAssignmentId
      const evalRes = await client.query(
        `SELECT assignment_id, college_assignment_id FROM evaluations WHERE id = $1`,
        [evaluationId]
      );

      if (evalRes.rows.length === 0) {
        throw new Error("Evaluation not found");
      }

      const evaluation = evalRes.rows[0];
      isCollegeAssignment = !!evaluation.college_assignment_id;
      assignmentId = isCollegeAssignment ? evaluation.college_assignment_id : evaluation.assignment_id;
    }

    // Fetch assignment for rubric/test_cases
    let assignmentRes;
    if (isCollegeAssignment) {
      assignmentRes = await client.query(`SELECT id, title, evaluator_type, test_cases, rubric, 'college' as type FROM college_assignments WHERE id = $1`, [assignmentId]);
    } else {
      assignmentRes = await client.query(`SELECT id, title, evaluator_type, test_cases, rubric, 'unit' as type FROM assignments WHERE id = $1`, [assignmentId]);
    }
    const assignment = assignmentRes.rows[0];
    if (!assignment) throw new Error("Assignment not found");

    // Fetch the specific submissions (support either submission_id or evaluation_results.id)
    const queryStr = isCollegeAssignment
      ? `SELECT s.id as submission_id, s.submission_link, s.student_id as user_id, u.full_name as student_name
         FROM college_assignment_submissions s
         JOIN users u ON s.student_id = u.id
         WHERE s.id = ANY($1)
            OR s.id IN (SELECT submission_id FROM evaluation_results WHERE id = ANY($1) AND evaluation_id = $2)
            OR s.student_id IN (SELECT student_id FROM evaluation_results WHERE id = ANY($1) AND evaluation_id = $2)`
      : `SELECT s.id as submission_id, s.submission_link, s.user_id, u.full_name as student_name
         FROM assignment_submissions s
         JOIN users u ON s.user_id = u.id
         WHERE s.id = ANY($1)
            OR s.id IN (SELECT submission_id FROM evaluation_results WHERE id = ANY($1) AND evaluation_id = $2)
            OR s.user_id IN (SELECT student_id FROM evaluation_results WHERE id = ANY($1) AND evaluation_id = $2)`;
         
    const submissionsRes = await client.query(queryStr, [submissionIds, evaluationId]);
    const submissions = submissionsRes.rows;

    if (!submissions.length) {
      // Fallback: fetch any active submissions for this evaluation if IDs were slightly mismatched
      const fallbackQuery = isCollegeAssignment
        ? `SELECT s.id as submission_id, s.submission_link, s.student_id as user_id, u.full_name as student_name
           FROM college_assignment_submissions s
           JOIN users u ON s.student_id = u.id
           JOIN evaluation_results er ON er.submission_id = s.id OR er.student_id = s.student_id
           WHERE er.evaluation_id = $1`
        : `SELECT s.id as submission_id, s.submission_link, s.user_id, u.full_name as student_name
           FROM assignment_submissions s
           JOIN users u ON s.user_id = u.id
           JOIN evaluation_results er ON er.submission_id = s.id OR er.student_id = s.user_id
           WHERE er.evaluation_id = $1`;
      const fallbackRes = await client.query(fallbackQuery, [evaluationId]);
      if (fallbackRes.rows.length > 0) {
        submissions.push(...fallbackRes.rows);
      } else {
        throw new Error('Submissions not found for re-evaluation');
      }
    }

    const validSubmissions = submissions.filter((s) => isAllowedGitUrl(s.submission_link));
    const invalidSubmissions = submissions.filter((s) => !isAllowedGitUrl(s.submission_link));

    if (invalidSubmissions.length > 0) {
      for (const invalid of invalidSubmissions) {
        let reason = 'No repository URL provided by student.';
        if (invalid.submission_link) {
          try {
            const h = new URL(invalid.submission_link).hostname;
            reason = `Invalid repository host (${h}). Submissions must be a public repository on GitHub, GitLab, or Bitbucket.`;
          } catch {
            reason = 'Invalid repository URL format. Must be a valid HTTP/HTTPS git repository URL.';
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
    const evaluatorUrl = `${process.env.CENTRAL_EVALUATOR_URL}/evaluate`;
    const evaluatorApiKey = process.env.CENTRAL_EVALUATOR_API_KEY;

    let jobIdsAndLinks = [];

    if (evaluatorType === 'JS' || evaluatorType === 'VISUAL' || evaluatorType === 'javascript' || evaluatorType === 'visual' || evaluatorType === 'PYTHON' || evaluatorType === 'python') {
        const payloadType = (evaluatorType === 'JS') ? 'javascript' : (evaluatorType === 'VISUAL' ? 'visual' : (evaluatorType === 'PYTHON' ? 'python' : evaluatorType));
        
        let jsConfig = { testCases: assignment.test_cases };
        if ((payloadType === 'javascript' || payloadType === 'python') && assignment.test_cases && typeof assignment.test_cases === 'object' && !Array.isArray(assignment.test_cases)) {
           jsConfig = {
             testCases: assignment.test_cases.testCases || [],
             evaluationMode: assignment.test_cases.evaluationMode || 'function',
             entryFunction: assignment.test_cases.entryFunction,
             functions: assignment.test_cases.functions,
             expectedLogs: assignment.test_cases.expectedLogs
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
    } else {
        const typeMap = { REACT: 'react', PYTHON: 'python', FULLSTACK: 'fullstack', AI: 'backend' };
        const payloadType = typeMap[evaluatorType] || typeMap[evaluatorType.toUpperCase()] || 'backend';

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
         SET job_id = $1, status = 'pending', status_url = $2, marks = 0, feedback = ''
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
    console.log('Re-evaluate Error:', error.message);
    if (error.response) {
      console.log('Evaluator API Response Data:', error.response.data);
      return res.status(500).json({ success: false, message: error.response.data.error || error.response.data.message || error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
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
         WHERE assignment_id = $1 OR college_assignment_id = $1 
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

