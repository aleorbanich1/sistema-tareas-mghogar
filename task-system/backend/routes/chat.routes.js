const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getMessages, sendMessage, getUnread } = require('../controllers/chat.controller');

router.use(auth);

router.get('/messages',      getMessages);
router.post('/messages',     sendMessage);
router.get('/unread',        getUnread);

module.exports = router;
