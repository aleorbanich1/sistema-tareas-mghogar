// nativeNotifications.js — Recordatorios NATIVOS para el APK (Capacitor Android).
// A diferencia del setTimeout del navegador, estas notificaciones las agenda el
// sistema operativo: suenan aunque la app esté cerrada o el celular bloqueado.
import { Capacitor } from '@capacitor/core';
import { taskReminderIntervalMs } from './notifications';

const CHANNEL_ID = 'reminders';

export function isNative() {
  try { return Capacitor?.isNativePlatform?.() === true; }
  catch { return false; }
}

// Carga perezosa del plugin (no existe en la web).
let _plugin = null;
async function getPlugin() {
  if (!isNative()) return null;
  if (!_plugin) {
    const mod = await import('@capacitor/local-notifications');
    _plugin = mod.LocalNotifications;
  }
  return _plugin;
}

// Pide permiso y crea el canal Android con sonido + importancia alta (para que suene).
export async function initNativeNotifications() {
  const LN = await getPlugin();
  if (!LN) return false;
  try {
    let perm = await LN.checkPermissions();
    if (perm.display !== 'granted') perm = await LN.requestPermissions();
    if (perm.display !== 'granted') return false;
  } catch (e) {
    console.warn('[native] permiso de notificación falló', e);
    return false;
  }
  try {
    await LN.createChannel({
      id: CHANNEL_ID,
      name: 'Recordatorios de tareas',
      description: 'Avisos con sonido cuando se acerca el horario de una tarea',
      importance: 5,      // HIGH → suena y aparece encima
      visibility: 1,      // público en pantalla bloqueada
      vibration: true,
      sound: undefined,   // usa el sonido de notificación por defecto del sistema
    });
  } catch (e) {
    console.warn('[native] no se pudo crear el canal', e);
  }
  return true;
}

// Estado del permiso nativo: 'granted' | 'denied' | 'prompt' | 'unsupported'.
export async function nativePermissionState() {
  const LN = await getPlugin();
  if (!LN) return 'unsupported';
  try {
    const p = await LN.checkPermissions();
    return p.display || 'prompt';
  } catch {
    return 'unsupported';
  }
}

// Los IDs de notificación nativa deben ser enteros de 32 bits. Combinamos el id
// de la tarea con el índice de repetición para que cada aviso sea único.
function notifId(taskId, index) {
  return (Math.abs(Number(taskId)) * 1000 + index) % 2147483647;
}

// Horizonte y tope de repeticiones que agendamos por tarea. Como Android no
// repite en intervalos arbitrarios, agendamos varias notificaciones espaciadas
// por el intervalo. Al cambiar las tareas (o reabrir la app) se reagenda.
const HORIZON_MS = 24 * 60 * 60 * 1000; // 24 horas hacia adelante
const MAX_PER_TASK = 60;                // tope para no saturar el SO

// Recordatorio REPETITIVO nativo: cada `reminder_hours` segundos mientras la
// tarea siga pendiente. Cancela lo anterior y reagenda desde la lista actual.
export async function syncNativeReminders(tasks, userId) {
  const LN = await getPlugin();
  if (!LN) return;

  const now = Date.now();
  const notifications = [];
  for (const t of tasks || []) {
    if (!t || t.status !== 'pending') continue;
    if (Number(t.assigned_to) !== Number(userId)) continue;
    const intervalMs = taskReminderIntervalMs(t);
    if (intervalMs == null) continue;

    const count = Math.min(MAX_PER_TASK, Math.max(1, Math.floor(HORIZON_MS / intervalMs)));
    for (let i = 1; i <= count; i++) {
      notifications.push({
        id: notifId(t.id, i),
        channelId: CHANNEL_ID,
        title: '⏰ Recordatorio de tarea',
        body: `Tenés que hacer: ${t.title}`,
        schedule: { at: new Date(now + i * intervalMs), allowWhileIdle: true }, // dispara aún en Doze
        extra: { taskId: t.id },
      });
    }
  }

  // Borrar lo agendado previamente para no duplicar ni dejar obsoletos.
  try {
    const pending = await LN.getPending();
    const ids = (pending?.notifications || []).map((n) => ({ id: n.id }));
    if (ids.length) await LN.cancel({ notifications: ids });
  } catch (e) {
    console.warn('[native] no se pudo cancelar pendientes', e);
  }

  if (!notifications.length) return;

  try {
    await LN.schedule({ notifications });
  } catch (e) {
    console.warn('[native] no se pudieron agendar recordatorios', e);
  }
}
