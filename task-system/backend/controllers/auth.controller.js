const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../auth');

async function register(req, res) {
  const { username, password, full_name } = req.body;
  const role = 'empleado'; // Forzado por seguridad

  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

  // Check if user exists
  const { data: existingUser } = await db.from('users').select('id').eq('username', username).single();
  if (existingUser) {
    return res.status(400).json({ error: 'El usuario ya existe' });
  }

  const password_hash = bcrypt.hashSync(password, 10);

  const { data: user, error } = await db.from('users').insert([{
    username,
    password_hash,
    full_name,
    role
  }]).select('id, username, full_name, role').single();

  if (error || !user) {
    return res.status(500).json({ error: 'Error al crear usuario' });
  }

  const token = signToken({
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
  });

  return res.status(201).json({
    token,
    user
  });
}

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const { data: user, error } = await db.from('users').select('*').eq('username', username).single();
  if (error || !user) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = signToken({
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    },
  });
}

async function me(req, res) {
  const { data: user, error } = await db.from('users').select('id, username, full_name, role, created_at').eq('id', req.user.id).single();
  if (error || !user) return res.status(404).json({ error: 'Usuario no encontrado' });
  return res.json(user);
}

async function getEmployees(req, res) {
  const { data: employees, error } = await db.from('users').select('id, username, full_name, role').eq('role', 'empleado');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(employees || []);
}

async function getUsers(req, res) {
  const { data: users, error } = await db.from('users').select('id, username, full_name, role');
  if (error) return res.status(500).json({ error: error.message });
  return res.json(users || []);
}

module.exports = { login, me, getEmployees, getUsers, register };
