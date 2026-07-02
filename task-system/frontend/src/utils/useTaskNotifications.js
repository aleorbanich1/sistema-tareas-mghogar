import { useEffect, useRef } from 'react';
import {
  notify,
  taskReminderTargetMs,
  isReminderFired,
  markReminderFired,
} from './notifications';

// setTimeout desborda con delays > ~24.8 días. Recordatorios más lejanos se
// agendan recién cuando la fecha se acerca (en la próxima carga de tareas).
const MAX_DELAY = 2 ** 31 - 1;

// Agenda un recordatorio local por cada tarea pendiente asignada al usuario que
// tenga recordatorio configurado. Reprograma cuando cambia la lista de tareas.
export function useTaskReminders(tasks, userId) {
  const timersRef = useRef(new Map()); // key -> timeoutId

  useEffect(() => {
    const timers = timersRef.current;
    const now = Date.now();
    const wanted = new Map();

    for (const t of tasks || []) {
      if (!t || t.status !== 'pending') continue;
      if (Number(t.assigned_to) !== Number(userId)) continue;
      const remindAt = taskReminderTargetMs(t);
      if (remindAt == null) continue;
      const key = `${t.id}:${remindAt}`;
      if (isReminderFired(key)) continue;
      if (remindAt <= now) continue;              // ya pasó: no spamear
      if (remindAt - now > MAX_DELAY) continue;   // muy lejano: agendar más adelante
      wanted.set(key, { task: t, remindAt });
    }

    // Cancelar timers que ya no corresponden.
    for (const [key, id] of timers) {
      if (!wanted.has(key)) { clearTimeout(id); timers.delete(key); }
    }

    // Agendar los nuevos.
    for (const [key, { task, remindAt }] of wanted) {
      if (timers.has(key)) continue;
      const delay = Math.max(0, remindAt - Date.now());
      const id = setTimeout(() => {
        markReminderFired(key);
        timers.delete(key);
        const time = task.recurrence_time ? ` — ${task.recurrence_time}` : '';
        notify('⏰ Recordatorio de tarea', `${task.title}${time}`, { tag: `reminder-${task.id}` });
      }, delay);
      timers.set(key, id);
    }
  }, [tasks, userId]);

  // Limpiar todo al desmontar.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers.values()) clearTimeout(id);
      timers.clear();
    };
  }, []);
}
