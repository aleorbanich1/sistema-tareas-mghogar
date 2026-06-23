const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');
const {
  listTasks,
  getTask,
  createTask,
  createSelfTask,
  updateTask,
  completeTask,
  failTask,
  markInfoNeeded,
  deleteTask,
} = require('../controllers/tasks.controller');

// All task routes require auth
router.use(auth);

router.get('/',     listTasks);
router.get('/:id',  getTask);

// Only socio/jefe can create tasks for others or delete tasks
router.post('/',        role('socio', 'jefe'), createTask);
router.delete('/:id',   role('socio', 'jefe'), deleteTask);

// Empleado can create tasks for themselves only
router.post('/self',    role('empleado'), createSelfTask);

// Both roles can update (controller enforces field restrictions per role)
router.patch('/:id',             updateTask);
router.patch('/:id/complete',    completeTask);
router.patch('/:id/fail',        failTask);
router.patch('/:id/info-needed', markInfoNeeded);

module.exports = router;
