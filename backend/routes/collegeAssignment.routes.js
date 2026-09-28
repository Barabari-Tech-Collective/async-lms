const router = require('express').Router();
const multer = require('multer');
const path = require('path');

const ALLOWED_SUBMISSION_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.zip', '.rar', '.7z',
  '.txt', '.md',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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
const verifyToken = require('../middlewares/verfiyToken');
const isStudent = require('../middlewares/isStudent');
const isFacilitator = require('../middlewares/isFacilitator');

const {
  uploadInstructionDoc,
  getMyCollegeAssignments,
  getCollegeAssignmentById,
  manageAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  submitCollegeAssignment,
  getFilteredAssignments,
  getAssignmentSubmissions,
} = require('../controllers/collegeAssignment.controller');
const isAdminOrFacilitator = require('../middlewares/isAdminOrFacilitator');

// Admin / Facilitator: get courses for creating assignments
router.get('/courses', verifyToken, isAdminOrFacilitator, require('../controllers/collegeAssignment.controller').getCoursesForAssignment);
router.get('/courses/:courseId/topics', verifyToken, isAdminOrFacilitator, require('../controllers/collegeAssignment.controller').getTopicsForCourse);

// Admin / Facilitator: manage assignments (MUST COME BEFORE /:id)
router.get('/manage', verifyToken, isFacilitator, manageAssignments);
router.get(
  '/evaluation-filters',
  verifyToken,
  isFacilitator,
  getFilteredAssignments,
);
router.get(
  '/submissions/:assignmentId',
  verifyToken,
  isFacilitator,
  getAssignmentSubmissions,
);

// Admin / Facilitator: upload instruction document to S3
router.post(
  '/upload-instruction',
  verifyToken,
  isFacilitator,
  upload.single('file'),
  uploadInstructionDoc,
);

// Student: fetch and submit assignments
router.get('/', verifyToken, isStudent, getMyCollegeAssignments);
router.get(
  '/facilitator',
  verifyToken,
  isAdminOrFacilitator,
  manageAssignments,
);
router.get('/:id', verifyToken, isStudent, getCollegeAssignmentById);
router.post(
  '/:id/submit',
  verifyToken,
  isStudent,
  upload.single('submission_file'),
  submitCollegeAssignment,
);

// Admin / Facilitator: create, update, delete
router.post('/', verifyToken, isFacilitator, createAssignment);
router.put('/:id', verifyToken, isFacilitator, updateAssignment);
router.delete('/:id', verifyToken, isFacilitator, deleteAssignment);

module.exports = router;
