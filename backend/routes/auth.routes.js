const { login, signup, getMe, googleRedirect, googleCallback, completeGoogleSignup, exchangeGoogleAuthCode, verifyEmail, forgotPassword, verifyResetOtp, resetPassword, changePassword } = require('../controllers/auth.controller');

const { validateLogin, validateSignup } = require('../middlewares/validators');
const verifyToken = require('../middlewares/verfiyToken');

const router = require('express').Router();

// Public routes
router.post('/login', validateLogin, login);
router.post('/signup', validateSignup, signup);
router.post('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOtp);
router.post('/reset-password', resetPassword);

// Google OAuth redirect flow (server-side)
router.get('/google', googleRedirect);
router.get('/google/callback', googleCallback);
router.post('/google/complete', completeGoogleSignup);
router.post('/google/exchange', exchangeGoogleAuthCode);

// Protected routes
router.get('/me', verifyToken, getMe);
router.post('/change-password', verifyToken, changePassword);

module.exports = router;
