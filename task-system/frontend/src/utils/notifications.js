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

// Sonido tipo "pop"/globo al completar una tarea. Ráfaga corta de ruido filtrado
// + un blip de tono que cae, para dar la sensación de burbuja que revienta.
export function playPop() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const ctx = audioCtx;
    const now = ctx.currentTime;

    // Ráfaga de ruido con caída rápida (el "reviente").
    const dur = 0.13;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const decay = Math.pow(1 - i / data.length, 3);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.45;
    noise.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
    noise.start(now);

    // Blip de tono que cae rápido (el "pop").
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.09);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.5, now + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    osc.connect(og); og.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.14);
  } catch (e) {
    console.warn('[notifications] no se pudo reproducir el pop', e);
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

// Prueba manual: desbloquea el audio (viene de un click), pide permiso y dispara
// un recordatorio de ejemplo al instante. Sirve para verificar sonido + aviso.
export async function testNotification() {
  unlockAudio();
  await ensureNotificationPermission();
  notify('🔔 Prueba de recordatorio', 'Si ves y escuchás esto, las notificaciones funcionan.', { tag: 'test' });
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

// Intervalo (ms) de repetición del recordatorio. reminder_hours se guarda en
// SEGUNDOS (ver reminderUnit.js). El recordatorio suena CADA este intervalo
// mientras la tarea siga pendiente — NO depende de la fecha/hora de la tarea
// (esa hora es solo para ordenar). Devuelve null si no hay recordatorio.
export function taskReminderIntervalMs(task) {
  if (!task || !task.reminder_hours) return null;
  const secs = Number(task.reminder_hours);
  if (!secs || secs <= 0) return null;
  return secs * 1000;
}

// Muestra una notificación (por el Service Worker si está disponible, si no por
// la API Notification directa) y reproduce el sonido siempre.
export async function notify(title, body, { tag } = {}) {
  playChime();

  // Aviso visible DENTRO de la app (banner), aunque el permiso del SO esté
  // denegado o el Service Worker no esté activo (ej. en `yarn dev`). El
  // dashboard escucha este evento y muestra el banner.
  try {
    window.dispatchEvent(new CustomEvent('MG_REMINDER', { detail: { title, body, tag } }));
  } catch { /* noop */ }

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
