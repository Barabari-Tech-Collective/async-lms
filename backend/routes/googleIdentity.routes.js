const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const verifyToken = require('../middlewares/verfiyToken');
const {
  getIdentity,
  startLink,
  callback,
} = require('../controllers/googleIdentity.controller');

router.get('/callback', callback);
router.use(verifyToken);
router.get('/', getIdentity);
router.post('/link', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many identity-link requests, please try again later.' },
}), startLink);

module.exports = router;
