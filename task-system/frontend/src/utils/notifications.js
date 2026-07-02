// notifications.js — Notificaciones locales para el empleado (app en primer plano).
// No hay push server: se disparan desde Supabase Realtime (tarea nueva) y desde
// timers en el cliente (recordatorio X minutos antes del horario de la tarea).
// Todas las notificaciones suenan (chime WebAudio, independiente del sonido del SO).

let audioCtx = null;
let audioUnlocked = false;

// El audio en móvil/Chrome requiere un gesto del usuario para desbloquearse.
// Llamamos a esto en el primer toque/tecla tras cargar la app.
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    audioUnlocked = true;
  } catch (e) {
    console.warn('[notifications] no se pudo desbloquear el audio', e);
  }
}

// Registra el desbloqueo de audio en el primer gesto del usuario (una sola vez).
export function armAudioUnlock() {
  if (typeof window === 'undefined') return;
  const handler = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
  };
  window.addEventListener('pointerdown', handler, { once: true });
  window.addEventListener('keydown', handler, { once: true });
}

// Chime corto de dos tonos. Suena siempre que se pueda (si el audio no está
// desbloqueado todavía, se intenta igual y falla silenciosamente).
export function playChime() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    const notes = [880, 1320]; // La5 -> Mi6
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.5);
    });
  } catch (e) {
    console.warn('[notifications] no se pudo reproducir el sonido', e);
  }
}

// Pide permiso de notificaciones. Devuelve true si quedó concedido.
export async function ensureNotificationPermission() {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

// ── Dedupe de recordatorios (sobrevive recargas) ────────────────────────────
const FIRED_KEY = 'mg_fired_reminders';

function readFired() {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '[]'); }
  catch { return []; }
}

export function isReminderFired(key) {
  return readFired().includes(key);
}

export function markReminderFired(key) {
  const fired = readFired();
  if (fired.includes(key)) return;
  fired.push(key);
  // Conservar solo los últimos 200 para no crecer sin límite.
  const trimmed = fired.slice(-200);
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(trimmed)); } catch { /* noop */ }
}

// Momento (ms epoch) en que debe sonar el recordatorio: reminder_hours (minutos)
// antes de la fecha/horario de la tarea. Devuelve null si no aplica.
export function taskReminderTargetMs(task) {
  if (!task || !task.due_date || !task.reminder_hours) return null;
  const time = task.recurrence_time || '09:00';
  const target = new Date(`${task.due_date}T${time}:00`);
  if (isNaN(target.getTime())) return null;
  return target.getTime() - Number(task.reminder_hours) * 60 * 1000;
}

// Muestra una notificación (por el Service Worker si está disponible, si no por
// la API Notification directa) y reproduce el sonido siempre.
export async function notify(title, body, { tag } = {}) {
  playChime();

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }

  const options = {
    body,
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
    tag,
    renotify: !!tag,
    silent: false,
    vibrate: [200, 100, 200],
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    // eslint-disable-next-line no-new
    new Notification(title, options);
  } catch (e) {
    try { new Notification(title, options); } catch { /* noop */ }
  }
}
