const router = require('express').Router();
const verifyToken = require('../middlewares/verfiyToken');
const {
  chat,
  getResume,
  saveResume,
  getAchievements,
  generateResume,
  rewriteContent,
  optimizeWithJD,
} = require('../controllers/assistant.controller');

router.post('/chat', verifyToken, chat);

// Modernized Placement Resume Builder Endpoints
router.get('/resume', verifyToken, getResume);
router.put('/resume', verifyToken, saveResume);
router.get('/resume/achievements', verifyToken, getAchievements);
router.post('/resume/generate', verifyToken, generateResume);
router.post('/resume', verifyToken, generateResume); // backward-compatible alias
router.post('/resume/rewrite', verifyToken, rewriteContent);
router.post('/resume/optimize', verifyToken, optimizeWithJD);

module.exports = router;
