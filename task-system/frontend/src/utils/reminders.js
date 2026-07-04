// reminders.js — Orquestador de recordatorios multiplataforma.
//
//   • APK (Capacitor):  notificaciones locales nativas → las agenda el SO y
//                        suenan aunque la app esté cerrada. Sin servidor.
//   • Web (PWA):         Web Push → una Edge Function programada de Supabase
//                        envía el push a la hora exacta. Suena con la app cerrada.
//
// El timer en primer plano (useTaskReminders) sigue existiendo solo para la web
// cuando la app está abierta (suena el chime propio); en nativo se desactiva
// para no duplicar con la notificación del sistema.
import { isNative, initNativeNotifications, syncNativeReminders, nativePermissionState } from './nativeNotifications';
import { ensureWebPushSubscription } from './webPush';
import { ensureNotificationPermission } from './notifications';

// Se llama una vez al montar el dashboard: pide permisos y prepara el canal.
export async function initReminders(userId) {
  if (isNative()) {
    await initNativeNotifications();
  } else {
    await ensureWebPushSubscription(userId);
  }
}

// Se llama cada vez que cambia la lista de tareas. En nativo reagenda las
// notificaciones locales; en web no hace nada por-tarea (lo resuelve el server).
export async function syncReminders(tasks, userId) {
  if (isNative()) {
    await syncNativeReminders(tasks, userId);
  }
}

// Estado del permiso de notificaciones, unificado web/APK.
// Devuelve: 'granted' | 'denied' | 'default' | 'prompt' | 'unsupported'.
export async function notificationStatus() {
  if (isNative()) return await nativePermissionState();
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

// Pide permiso (web o APK) y deja todo listo (canal nativo / suscripción push).
// Devuelve el estado resultante.
export async function requestNotifications(userId) {
  if (isNative()) {
    await initNativeNotifications();
  } else {
    await ensureNotificationPermission();
    await ensureWebPushSubscription(userId);
  }
  return await notificationStatus();
}

export { isNative };
