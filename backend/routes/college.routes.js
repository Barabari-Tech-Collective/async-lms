const {
  getAllColleges,
  createCollege,
  updateCollege,
  deleteCollege,
  getRecycleBinColleges,
  restoreCollege,
  permanentDeleteCollege,
  assignFacilitator,
  getCollegesBySubject,
  toggleSubjectAccess,
  getVerifiedColleges,
} = require('../controllers/college.controller');

const isAdmin = require('../middlewares/isAdmin');
const verifyToken = require('../middlewares/verfiyToken');
const router = require('express').Router();

// General CRUD & Recycle Bin
router.get('/', verifyToken, getAllColleges);
router.get('/bin', verifyToken, isAdmin, getRecycleBinColleges);
router.post('/', verifyToken, createCollege);
router.post('/:id/restore', verifyToken, isAdmin, restoreCollege);
router.put('/:id', verifyToken, isAdmin, updateCollege);
router.delete('/:id/permanent', verifyToken, isAdmin, permanentDeleteCollege);
router.delete('/:id', verifyToken, isAdmin, deleteCollege);

// Assignment Logic
router.get(
  '/assignment/:subjectId',
  verifyToken,
  isAdmin,
  getCollegesBySubject,
);
router.post('/toggle-assignment', verifyToken, isAdmin, toggleSubjectAccess);
router.post('/assign-facilitator', verifyToken, isAdmin, assignFacilitator);

module.exports = router;
