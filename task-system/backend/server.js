require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const http = require('http');
const { Server } = require('socket.io');

const authRoutes  = require('./routes/auth.routes');
const taskRoutes  = require('./routes/tasks.routes');
const chatRoutes  = require('./routes/chat.routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', 'https://localhost', 'http://localhost', 'capacitor://localhost', 'null'],
    credentials: true,
  }
});

// Inject io into req
app.use((req, res, next) => {
  req.io = io;
  next();
});

const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', 'null'],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static frontend ───────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/api/auth',  authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/chat',  chatRoutes);

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 fallback (SPA) ────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Cleanup (Cada 60 días req / Ejecutado cada 24h por límite de setInterval) ─

const db = require('./db');
async function runCleanup() {
  try {
    const { error } = await db.rpc('cleanup_old_rows');
    if (error) throw error;
    console.log(`[CLEANUP] Tareas y mensajes antiguos limpiados en Supabase.`);
  } catch (e) {
    console.error('[CLEANUP ERROR]', e.message);
  }
}

// Ejecutar al inicio y luego cada 24 horas (máximo confiable de setInterval)
runCleanup();
setInterval(runCleanup, 24 * 60 * 60 * 1000);

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\nMG Hogar Task System`);
  console.log(`Server corriendo en http://localhost:${PORT}\n`);
});
