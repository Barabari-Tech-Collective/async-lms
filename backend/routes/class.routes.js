const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const verifyToken = require('../middlewares/verfiyToken');
const isAdminOrFacilitator = require('../middlewares/isAdminOrFacilitator');
const controller = require('../controllers/class.controller');

const meetActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many Meet actions, please try again later.' },
});

router.post('/', verifyToken, isAdminOrFacilitator, controller.create);
router.get('/student', verifyToken, controller.listStudentClasses);
router.get('/students', verifyToken, isAdminOrFacilitator, controller.listClassStudents);
router.get('/', verifyToken, isAdminOrFacilitator, controller.listClasses);
router.get('/:id', verifyToken, controller.getOne);
router.patch('/:id', verifyToken, isAdminOrFacilitator, controller.update);
router.post('/:id/join', verifyToken, meetActionLimiter, controller.join);
router.get('/:id/facilitator-access', verifyToken, isAdminOrFacilitator, controller.facilitatorAccess);
router.get('/:id/access/:ticket', controller.access);
router.post('/:id/access/:ticket', controller.consumeAccess);
router.post('/:id/end', verifyToken, isAdminOrFacilitator, controller.end);
router.post('/:id/sync', verifyToken, isAdminOrFacilitator, meetActionLimiter, controller.sync);
router.get('/:id/attendance/students/:studentId', verifyToken, controller.studentAttendance);
router.get('/:id/attendance', verifyToken, isAdminOrFacilitator, controller.attendance);

module.exports = router;
