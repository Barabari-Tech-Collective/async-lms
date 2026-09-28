const router = require('express').Router();
const verifyToken = require('../middlewares/verfiyToken');
const isStudent = require('../middlewares/isStudent');

const {
  getMyProgress,
  startSubtopic,
  completeLesson,
  submitQuizAttempt,
  submitExercise,
  getOverallLeaderboard,
  getWeeklyLeaderboard,
  getCollegeLeaderboard,
  getStudentProjects,
  createStudentProject,
  deleteStudentProject,
  initExerciseWorkspace,
  saveExerciseWorkspace,
  runExercise,

  runExerciseTests,
  getStudentAssignments,
  getStudentAssignmentsOverview,
  getAssignmentById,
  submitAssignment,
  getCapstone,
  submitCapstone,
  getStudentScorecard,
  enrollInSubject,
  getStudentAnalytics,
  getStudentModuleAnalytics,
} = require('../controllers/student.controller');

// ===== PROGRESS TRACKING =====
router.get('/progress', verifyToken, isStudent, getMyProgress);
router.post(
  '/progress/subtopic/:subtopicId/start',
  verifyToken,
  isStudent,
  startSubtopic,
);
router.post(
  '/progress/lesson/:lessonId/complete',
  verifyToken,
  isStudent,
  completeLesson,
);

// ===== QUIZ & EXERCISE SUBMISSION =====
router.post('/quiz/:quizId/submit', verifyToken, isStudent, submitQuizAttempt);
router.post(
  '/exercise/:exerciseId/submit',
  verifyToken,
  isStudent,
  submitExercise,
);

// ===== EXERCISE WORKSPACE =====
router.post(
  '/exercise/:exerciseId/workspace/init',
  verifyToken,
  isStudent,
  initExerciseWorkspace,
);

router.post(
  '/exercise/:exerciseId/workspace/save',
  verifyToken,
  isStudent,
  saveExerciseWorkspace,
);

router.post(
  '/exercise/:exerciseId/run',
  verifyToken,
  isStudent,
  runExercise,
);

router.post(
  '/exercise/:exerciseId/run-tests',
  verifyToken,
  isStudent,
  runExerciseTests,
);

// ===== ASSIGNMENTS =====
router.get(
  '/assignments/overview',
  verifyToken,
  isStudent,
  getStudentAssignmentsOverview,
);
router.get('/assignments', verifyToken, isStudent, getStudentAssignments);
router.get('/assignments/:id', verifyToken, isStudent, getAssignmentById);
router.post(
  '/assignments/:id/submit',
  verifyToken,
  isStudent,
  submitAssignment,
);

// ===== PERSONAL PROJECTS =====
router.get('/projects', verifyToken, isStudent, getStudentProjects);
router.post('/projects', verifyToken, isStudent, createStudentProject);
router.delete('/projects/:id', verifyToken, isStudent, deleteStudentProject);

// ===== CAPSTONE PROJECTS =====
router.get('/capstone/:projectId', verifyToken, isStudent, getCapstone);
router.post(
  '/capstone/:projectId/submit',
  verifyToken,
  isStudent,
  submitCapstone,
);

// ===== ENROLLMENT =====
router.post(
  '/subjects/:subjectId/enroll',
  verifyToken,
  isStudent,
  enrollInSubject,
);

// ===== SCORECARD =====
router.get('/scorecard', verifyToken, isStudent, getStudentScorecard);

// ===== ANALYTICS =====
router.get('/analytics', verifyToken, isStudent, getStudentAnalytics);
router.get(
  '/analytics/modules',
  verifyToken,
  isStudent,
  getStudentModuleAnalytics,
);

// ===== LEADERBOARDS =====
router.get(
  '/leaderboard/overall',
  verifyToken,
  isStudent,
  getOverallLeaderboard,
);
router.get('/leaderboard/weekly', verifyToken, isStudent, getWeeklyLeaderboard);
router.get(
  '/leaderboard/college',
  verifyToken,
  isStudent,
  getCollegeLeaderboard,
);

module.exports = router;
