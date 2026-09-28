const router = require('express').Router();
const {
  getAllSubjects,
  getSubjectsDropdown,
  getCourseStructure,
  getSubtopicContent,
  createSubject,
  getAllPublishedSubjects,
  updateSubject,
  deleteSubject,
  getExerciseContent,
  getQuizContent,
  getMarkdownContent,
} = require('../controllers/subject.controller');
const isAdmin = require('../middlewares/isAdmin');
const verifyToken = require('../middlewares/verfiyToken');

// GET specific content when clicking a subtopic
router.get('/content/:subtopicSlug', verifyToken, getSubtopicContent);

// GET specific quiz content
router.get('/quiz/:quizId', verifyToken, getQuizContent);

// GET specific exercise content (standalone exercise view)
router.get('/exercise/:exerciseId', verifyToken, getExerciseContent);

// Fetch all published subjects
router.get('/published', verifyToken, getAllPublishedSubjects);

// Fetch all subjects
router.get('/', verifyToken, isAdmin, getAllSubjects);

// GET subjects (for dropdown) — drafts hidden from students
router.get('/dropdown', verifyToken, getSubjectsDropdown);
// Create a new subject
router.post('/', verifyToken, isAdmin, createSubject);

// GET a course and its hierarchy (topics/subtopics)
router.get('/:slug', verifyToken, getCourseStructure);

// UPDATE: subject
router.put('/:id', verifyToken, isAdmin, updateSubject);

// DELETE: Subject
router.delete('/:id', verifyToken, isAdmin, deleteSubject);

// GET markdown content for a lesson
router.post('/markdown-content', verifyToken, isAdmin, getMarkdownContent);

module.exports = router;
