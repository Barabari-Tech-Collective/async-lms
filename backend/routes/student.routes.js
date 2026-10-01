const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const verifyToken = require('../middlewares/verfiyToken');
const isStudent = require('../middlewares/isStudent');

const ALLOWED_SUBMISSION_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.zip', '.rar', '.7z',
  '.txt', '.md',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_SUBMISSION_EXTENSIONS.has(ext)) {
      const err = new Error(`File type "${ext}" is not allowed`);
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

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
  getStudentProjectsOverview,
  getAssignmentById,
  submitAssignment,
  getCapstone,
  submitCapstone,
  getStudentScorecard,
  enrollInSubject,
  getStudentAnalytics,
  getStudentModuleAnalytics,
  getActiveMilestoneDeadlines,
  getStudentStreakDetails,
  getStudentActivityCalendar,
} = require('../controllers/student.controller');

// ===== HABIT STREAK & ACTIVITY CALENDAR =====
router.get('/streak-details', verifyToken, isStudent, getStudentStreakDetails);
router.get('/activity-calendar', verifyToken, isStudent, getStudentActivityCalendar);

// ===== PROGRESS-DRIVEN MILESTONE DEADLINES =====
router.get(
  '/deadlines/active-milestones',
  verifyToken,
  isStudent,
  getActiveMilestoneDeadlines,
);

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
  upload.single('submission_file'),
  submitAssignment,
);

// ===== PERSONAL & CAPSTONE PROJECTS =====
router.get(
  '/projects/overview',
  verifyToken,
  isStudent,
  getStudentProjectsOverview,
);
router.get('/projects', verifyToken, isStudent, getStudentProjects);
router.post('/projects', verifyToken, isStudent, createStudentProject);
router.delete('/projects/:id', verifyToken, isStudent, deleteStudentProject);

// ===== CAPSTONE PROJECTS =====
router.get('/capstone/:projectId', verifyToken, isStudent, getCapstone);
router.post(
  '/capstone/:projectId/submit',
  verifyToken,
  isStudent,
  upload.single('submission_file'),
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
