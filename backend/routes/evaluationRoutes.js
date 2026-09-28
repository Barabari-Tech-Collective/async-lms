const express = require("express");
const router = express.Router();
const pool = require("../config/pg");

const {
  runEvaluation,
  getEvaluationResults,
  getLatestEvaluationByAssignment,
  getAvailableEvaluators,
  syncEvaluationStatus,
  generateTestCases,
  generateRubric,
  reEvaluateSubmission,
  getResultsByAssignment,
  stopEvaluation
} = require("../controllers/evaluation.controller");
const verifyToken = require("../middlewares/verfiyToken");
const isAdminOrFacilitator = require("../middlewares/isAdminOrFacilitator");

router.use(verifyToken, isAdminOrFacilitator);

router.get('/dump-db', async (req, res) => {
  try {
    const result = await pool.query("SELECT total_score, execution_logs, rubric, rubric_breakdown, repo_url FROM college_assignment_submissions ORDER BY submitted_at DESC LIMIT 1;");
    res.json(result.rows[0] || { empty: true });
  } catch (err) {
    res.json({ error: err.message, stack: err.stack });
  }
});

// 🚀 Run evaluation
router.post("/run", runEvaluation);

// 🛑 Stop / Cancel evaluation
router.post("/stop", stopEvaluation);
router.post("/:id/stop", stopEvaluation);

// 🚀 Re-evaluate single submission
router.post("/re-evaluate", reEvaluateSubmission);

// 🤖 Generate test cases
router.post("/generate-test-cases", generateTestCases);

// 🤖 Generate rubric
router.post("/generate-rubric", generateRubric);

// 📋 Get available evaluators
router.get("/evaluators", getAvailableEvaluators);

// 📊 Get latest evaluation by assignment
router.get("/by-assignment/:assignmentId", getLatestEvaluationByAssignment);

// 📊 Get results (with pending generated) by assignment ID
router.get("/assignment/:assignmentId/results", getResultsByAssignment);

// 🔄 Sync evaluation status
router.get("/sync/:id", syncEvaluationStatus);

// 📊 Get results by evaluationId
router.get("/:id", getEvaluationResults);

module.exports = router;
