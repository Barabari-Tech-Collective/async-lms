const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const verifyToken = require('../middlewares/verfiyToken');
const controller = require('../controllers/class.controller');

const meetActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many Meet actions, please try again later.' },
});

router.post('/', verifyToken, controller.create);
router.get('/student', verifyToken, controller.listStudentClasses);
router.get('/students', verifyToken, controller.listClassStudents);
router.get('/', verifyToken, controller.listClasses);
router.get('/:id', verifyToken, controller.getOne);
router.patch('/:id', verifyToken, controller.update);
router.post('/:id/join', verifyToken, meetActionLimiter, controller.join);
router.get('/:id/facilitator-access', verifyToken, controller.facilitatorAccess);
router.get('/:id/access/:ticket', controller.access);
router.post('/:id/end', verifyToken, controller.end);
router.post('/:id/sync', verifyToken, meetActionLimiter, controller.sync);
router.get('/:id/attendance/students/:studentId', verifyToken, controller.studentAttendance);
router.get('/:id/attendance', verifyToken, controller.attendance);

module.exports = router;
