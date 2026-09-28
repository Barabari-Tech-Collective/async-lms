const router = require('express').Router();
const verifyToken = require('../middlewares/verfiyToken');
const isFacilitator = require('../middlewares/isFacilitator');
const {
  selectCollege,
  updateBatchDetails,
  selectSubjects,
  selectFacilitatorColleges,
} = require('../controllers/onboarding.controller');

// All onboarding steps require a verified token
router.post('/college', verifyToken, selectCollege);
router.post('/batch', verifyToken, updateBatchDetails);
router.post('/subjects', verifyToken, selectSubjects);
router.post(
  '/facilitator-colleges',
  verifyToken,
  isFacilitator,
  selectFacilitatorColleges,
);

module.exports = router;

