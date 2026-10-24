const router = require('express').Router();
const verifyToken = require('../middlewares/verfiyToken');
const {
  getIdentity,
  startLink,
  callback,
} = require('../controllers/googleIdentity.controller');

router.get('/callback', callback);
router.use(verifyToken);
router.get('/', getIdentity);
router.post('/link', startLink);

module.exports = router;
