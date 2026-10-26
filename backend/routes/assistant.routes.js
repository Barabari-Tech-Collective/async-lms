const router = require('express').Router();
const verifyToken = require('../middlewares/verfiyToken');
const {
  chat,
  getResume,
  saveResume,
  deleteResume,
  getAllResumes,
  getResumeById,
  createResume,
  updateResumeById,
  renameResume,
  duplicateResume,
  setPrimaryResume,
  deleteResumeById,
  getRecycleBinResumes,
  restoreResumeById,
  destroyResumeById,
  emptyRecycleBin,
  getAchievements,
  generateResume,
  rewriteContent,
  optimizeWithJD,
} = require('../controllers/assistant.controller');

router.post('/chat', verifyToken, chat);

// ── Multi-Resume Management Endpoints ─────────────────────────────────────────
router.get('/resumes', verifyToken, getAllResumes);
router.get('/resumes/bin', verifyToken, getRecycleBinResumes);
router.delete('/resumes/bin/empty', verifyToken, emptyRecycleBin);
router.post('/resume/new', verifyToken, createResume);
router.get('/resume/achievements', verifyToken, getAchievements);
router.post('/resume/generate', verifyToken, generateResume);
router.post('/resume/rewrite', verifyToken, rewriteContent);
router.post('/resume/optimize', verifyToken, optimizeWithJD);

// Specific resume operations (by UUID)
router.get('/resume/:id', verifyToken, getResumeById);
router.put('/resume/:id', verifyToken, updateResumeById);
router.patch('/resume/:id/rename', verifyToken, renameResume);
router.post('/resume/:id/duplicate', verifyToken, duplicateResume);
router.patch('/resume/:id/primary', verifyToken, setPrimaryResume);
router.patch('/resume/:id/restore', verifyToken, restoreResumeById);
router.delete('/resume/:id/destroy', verifyToken, destroyResumeById);
router.delete('/resume/:id', verifyToken, deleteResumeById);

// Legacy Single-Resume Endpoints (Backward-Compatibility)
router.get('/resume', verifyToken, getResume);
router.put('/resume', verifyToken, saveResume);
router.delete('/resume', verifyToken, deleteResume);
router.post('/resume', verifyToken, generateResume); // backward-compatible alias

module.exports = router;
