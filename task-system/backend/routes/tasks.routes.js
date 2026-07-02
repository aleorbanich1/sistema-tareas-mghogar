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

// Only socio/jefe can create tasks for others
router.post('/',        role('socio', 'jefe'), createTask);

// Delete allowed for socio/jefe (any task) and empleado (own tasks only);
// deleteTask enforces the empleado ownership check internally.
router.delete('/:id',   deleteTask);

// Empleado can create tasks for themselves only
router.post('/self',    role('empleado'), createSelfTask);

// Both roles can update (controller enforces field restrictions per role)
router.patch('/:id',             updateTask);
router.patch('/:id/complete',    completeTask);
router.patch('/:id/fail',        failTask);
router.patch('/:id/info-needed', markInfoNeeded);

module.exports = router;
