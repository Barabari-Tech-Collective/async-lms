const router = require('express').Router();
const multer = require('multer');
const isAdmin = require('../middlewares/isAdmin');
const verifyToken = require('../middlewares/verfiyToken');
const {
  validateExerciseTests,
} = require('../controllers/exerciseValidation.controller');

const {
  getAdminStats,
  getAdminAnalytics,
  getStudentRegistrations,
  getActiveUsersTimeline,
  getAllStudents,
  getProjectSubmissions,
  getStudentProfile,
  getFacilitatorProfile,
  getCollegeDetail,
  uploadLessonMarkdown,
  uploadFile,
  createTopic,
  updateTopic,
  deleteTopic,
  createUnit,
  updateUnit,
  deleteUnit,
  createSubtopic,
  updateSubtopic,
  deleteSubtopic,
  createLessonContent,
  updateLessonContent,
  deleteLessonContent,
  publishLessonContent,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getExercise,
  createExercise,
  updateExercise,
  deleteExercise,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  createProject,
  updateProject,
  deleteProject,
  verifyUser,
  createCurriculumDeveloper,
} = require('../controllers/admin.controller');

const {
  createQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  getQuizQuestions,
  getQuizQuestionOptions,
  createQuizQuestionOption,
  updateQuizQuestionOption,
  deleteQuizQuestionOption,
  getStudentProgress,
  getAllStudentsProgressSummary,
  getOverallLeaderboard,
  getWeeklyLeaderboard,
  getTopicLeaderboard,
  getCollegeLeaderboard,
  updateLeaderboards,
  getAdminSubjectStructure,
  getLockControlBatches,
  getLockControlOverview,
  setLockControlTopic,
  setLockControlSubtopic,
} = require('../controllers/admin.controller');

const upload = multer({ storage: multer.memoryStorage() });

// ===== EXISTING ROUTES =====
router.get('/stats', verifyToken, isAdmin, getAdminStats);
router.get('/analytics', verifyToken, isAdmin, getAdminAnalytics);
router.get('/analytics/registrations', verifyToken, isAdmin, getStudentRegistrations);
router.get('/analytics/active-users', verifyToken, isAdmin, getActiveUsersTimeline);
router.get('/all-students', verifyToken, isAdmin, getAllStudents);
router.get('/project-submissions', verifyToken, isAdmin, getProjectSubmissions);
router.post('/curriculum-developer', verifyToken, isAdmin, createCurriculumDeveloper);
router.post(
  '/lesson-content/upload',
  verifyToken,
  isAdmin,
  upload.single('file'),
  uploadLessonMarkdown,
);
router.post(
  '/upload-file',
  verifyToken,
  isAdmin,
  upload.single('file'),
  uploadFile,
);
router.get(
  '/subjects/:slug/structure',
  verifyToken,
  isAdmin,
  getAdminSubjectStructure,
);

// ===== LOCK CONTROL =====
router.get(
  '/lock-control/batches',
  verifyToken,
  isAdmin,
  getLockControlBatches,
);
router.get(
  '/lock-control/overview',
  verifyToken,
  isAdmin,
  getLockControlOverview,
);
router.post(
  '/lock-control/topics/:topicId/:action',
  verifyToken,
  isAdmin,
  setLockControlTopic,
);
router.post(
  '/lock-control/subtopics/:subtopicId/:action',
  verifyToken,
  isAdmin,
  setLockControlSubtopic,
);

// ===== TOPIC MANAGEMENT =====
router.post('/topics', verifyToken, isAdmin, createTopic);
router.put('/topics/:id', verifyToken, isAdmin, updateTopic);
router.delete('/topics/:id', verifyToken, isAdmin, deleteTopic);

// ===== UNIT MANAGEMENT =====
router.post('/units', verifyToken, isAdmin, createUnit);
router.put('/units/:id', verifyToken, isAdmin, updateUnit);
router.delete('/units/:id', verifyToken, isAdmin, deleteUnit);

// ===== SUBTOPIC MANAGEMENT =====
router.post('/subtopics', verifyToken, isAdmin, createSubtopic);
router.put('/subtopics/:id', verifyToken, isAdmin, updateSubtopic);
router.delete('/subtopics/:id', verifyToken, isAdmin, deleteSubtopic);

// ===== LESSON CONTENT MANAGEMENT =====
router.post('/lesson-content', verifyToken, isAdmin, createLessonContent);
router.put('/lesson-content/:id', verifyToken, isAdmin, updateLessonContent);
router.delete('/lesson-content/:id', verifyToken, isAdmin, deleteLessonContent);
router.put(
  '/lesson-content/:id/publish',
  verifyToken,
  isAdmin,
  publishLessonContent,
);

// ===== QUIZ MANAGEMENT =====
router.post('/quizzes', verifyToken, isAdmin, createQuiz);
router.put('/quizzes/:id', verifyToken, isAdmin, updateQuiz);
router.delete('/quizzes/:id', verifyToken, isAdmin, deleteQuiz);

// ===== QUIZ QUESTIONS MANAGEMENT (NEW) =====
router.post('/quiz-questions', verifyToken, isAdmin, createQuizQuestion);
router.put('/quiz-questions/:id', verifyToken, isAdmin, updateQuizQuestion);
router.delete('/quiz-questions/:id', verifyToken, isAdmin, deleteQuizQuestion);
router.get(
  '/quizzes/:quizId/questions',
  verifyToken,
  isAdmin,
  getQuizQuestions,
);
router.get(
  '/quiz-questions/:questionId/options',
  verifyToken,
  isAdmin,
  getQuizQuestionOptions,
);

// ===== QUIZ QUESTION OPTIONS MANAGEMENT (NEW) =====
router.post(
  '/quiz-question-options',
  verifyToken,
  isAdmin,
  createQuizQuestionOption,
);
router.put(
  '/quiz-question-options/:id',
  verifyToken,
  isAdmin,
  updateQuizQuestionOption,
);
router.delete(
  '/quiz-question-options/:id',
  verifyToken,
  isAdmin,
  deleteQuizQuestionOption,
);

// ===== EXERCISE MANAGEMENT =====
// Verify authored test cases against the reference solution before saving.
// Declared before '/exercises/:id' so it is not captured by that param route.
router.post(
  '/exercises/validate-tests',
  verifyToken,
  isAdmin,
  validateExerciseTests,
);
router.get('/exercises/:id', verifyToken, isAdmin, getExercise);
router.post('/exercises', verifyToken, isAdmin, createExercise);
router.put('/exercises/:id', verifyToken, isAdmin, updateExercise);
router.delete('/exercises/:id', verifyToken, isAdmin, deleteExercise);

// ===== ASSIGNMENT MANAGEMENT =====
router.get('/assignments/:id', verifyToken, isAdmin, getAssignment);
router.post('/assignments', verifyToken, isAdmin, createAssignment);
router.put('/assignments/:id', verifyToken, isAdmin, updateAssignment);
router.delete('/assignments/:id', verifyToken, isAdmin, deleteAssignment);

// ===== PROJECT MANAGEMENT =====
router.post('/projects', verifyToken, isAdmin, createProject);
router.put('/projects/:id', verifyToken, isAdmin, updateProject);
router.delete('/projects/:id', verifyToken, isAdmin, deleteProject);

// ===== STUDENT PROGRESS TRACKING (NEW) =====
router.get(
  '/students/:userId/progress/:subjectId',
  verifyToken,
  isAdmin,
  getStudentProgress,
);
router.get(
  '/students/progress-summary',
  verifyToken,
  isAdmin,
  getAllStudentsProgressSummary,
);

// ===== LEADERBOARD MANAGEMENT (NEW) =====
router.get('/leaderboard/overall', verifyToken, isAdmin, getOverallLeaderboard);
router.get('/leaderboard/weekly', verifyToken, isAdmin, getWeeklyLeaderboard);
router.get(
  '/leaderboard/topic/:topicId',
  verifyToken,
  isAdmin,
  getTopicLeaderboard,
);
router.get(
  '/leaderboard/college/:collegeId',
  verifyToken,
  isAdmin,
  getCollegeLeaderboard,
);
router.post('/leaderboard/update', verifyToken, isAdmin, updateLeaderboards);

// ===== USER MANAGEMENT =====
router.get('/colleges/:id', verifyToken, isAdmin, getCollegeDetail);
router.get('/students/:id', verifyToken, isAdmin, getStudentProfile);
router.get('/facilitators/:id', verifyToken, isAdmin, getFacilitatorProfile);
router.patch('/users/:id/verify', verifyToken, isAdmin, verifyUser);

module.exports = router;
