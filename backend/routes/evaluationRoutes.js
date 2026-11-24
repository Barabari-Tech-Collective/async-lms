const express = require("express");
const router = express.Router();
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
