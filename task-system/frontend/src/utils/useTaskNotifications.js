import { useEffect, useRef } from 'react';
import { notify, taskReminderIntervalMs } from './notifications';
import { isNative } from './nativeNotifications';

// Cada cuánto revisa (en memoria) si alguna tarea tiene que volver a avisar.
const CHECK_INTERVAL_MS = 1000; // 1 segundo

// Recordatorio REPETITIVO: mientras una tarea siga pendiente y asignada al
// usuario, vuelve a avisar cada `reminder_hours` segundos (el intervalo elegido
// al crear la tarea). NO consulta la base de datos: solo recorre el array
// `tasks` ya cargado en memoria, así que es liviano sin importar cuántas tareas
// o usuarios haya. La hora de la tarea NO influye acá (solo sirve para ordenar).
export function useTaskReminders(tasks, userId) {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const lastFiredRef = useRef(new Map()); // taskId -> ms del último aviso

  useEffect(() => {
    // En el APK los recordatorios los agenda el SO (notificaciones nativas):
    // no usamos el timer en primer plano para no duplicar el aviso.
    if (isNative()) return;

    const tick = () => {
      const now = Date.now();
      const uid = userIdRef.current;
      const last = lastFiredRef.current;
      const seen = new Set();

      for (const t of tasksRef.current || []) {
        if (!t || t.status !== 'pending') continue;
        if (Number(t.assigned_to) !== Number(uid)) continue;
        const intervalMs = taskReminderIntervalMs(t);
        if (intervalMs == null) continue;
        seen.add(t.id);

        const prev = last.get(t.id);
        if (prev == null) {
          // Primera vez que la vemos: arranca el conteo (no avisa al instante).
          last.set(t.id, now);
          continue;
        }
        if (now - prev >= intervalMs) {
          last.set(t.id, now);
          notify('⏰ Recordatorio de tarea', `Tenés que hacer: ${t.title}`, { tag: `reminder-${t.id}` });
        }
      }

      // Olvidar tareas que ya no están pendientes/visibles.
      for (const id of last.keys()) if (!seen.has(id)) last.delete(id);
    };

    const iv = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);
}
