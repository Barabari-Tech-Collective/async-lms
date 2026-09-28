const router = require('express').Router();
const userController = require('../controllers/user.controller');
const verifyToken = require('../middlewares/verfiyToken');
const isAdmin = require('../middlewares/isAdmin');

// Authenticated Routes (any role)
router.get('/subjects', verifyToken, userController.getUserSubjects);
router.get('/profile', verifyToken, userController.getUserProfile);
router.get('/badges', verifyToken, userController.getUserBadges);
router.get('/activity', verifyToken, userController.getUserActivity);
router.put('/password', verifyToken, userController.changePassword);

// Admin Routes (Protecting all subsequent routes with isAdmin)
router.use(verifyToken, isAdmin);

router.get('/', userController.getAllUsers);
router.post('/curriculum-developer', require('../controllers/admin.controller').createCurriculumDeveloper);
router.get('/bin', userController.getRecycleBin);
router.get('/:id', userController.getUserById);
router.put('/:id', userController.updateUser);
router.patch('/:id/verify', userController.verifyUser);
router.patch('/:id/role', userController.changeUserRole);
router.delete('/:id', userController.deleteUser);
router.post('/:id/restore', userController.restoreUser);
router.delete('/:id/permanent', userController.permanentDeleteUser);

module.exports = router;
