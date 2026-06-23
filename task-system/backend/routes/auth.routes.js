const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { login, me, getEmployees, getUsers, register } = require('../controllers/auth.controller');

router.post('/login', login);
router.post('/register', register);
router.get('/me', auth, me);
router.get('/employees', auth, getEmployees);
router.get('/users', auth, getUsers);

module.exports = router;
