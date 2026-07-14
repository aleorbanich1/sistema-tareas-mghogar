// Orden y vencimiento de tareas.
//
// El servidor ordena por prioridad y después por fecha, así que una P1 para
// dentro de dos semanas quedaba arriba de una P3 de hoy. Acá reordenamos del
// lado del cliente: manda la fecha (lo vencido primero, después lo más próximo)
// y la prioridad solo desempata.

const PRIORITY_RANK = { P1: 1, P2: 2, P3: 3, P4: 4 };

// Momento exacto de vencimiento (Date) o null si la tarea no tiene fecha.
// due_date puede venir 'YYYY-MM-DD' o timestamp. Sin horario, vence al final del día.
export function dueAt(task) {
  if (!task || !task.due_date) return null;
  const day = String(task.due_date).slice(0, 10);
  const time = /^\d{2}:\d{2}/.test(task.recurrence_time || '')
    ? String(task.recurrence_time).slice(0, 5)
    : '23:59';
  const d = new Date(`${day}T${time}:00`);
  return isNaN(d.getTime()) ? null : d;
}

// Una tarea está vencida si sigue pendiente y su momento de vencimiento ya pasó.
export function isOverdue(task, now = new Date()) {
  if (!task || task.status !== 'pending') return false;
  const d = dueAt(task);
  return !!d && d.getTime() < now.getTime();
}

// Pendientes arriba (vencidas primero, después por fecha más próxima, las
// sin fecha al final); cerradas abajo, de la más reciente a la más vieja.
export function sortTasks(tasks, now = new Date()) {
  return [...(tasks || [])].sort((a, b) => {
    const closedA = a.status !== 'pending' ? 1 : 0;
    const closedB = b.status !== 'pending' ? 1 : 0;
    if (closedA !== closedB) return closedA - closedB;

    if (closedA === 1) {
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    }

    const da = dueAt(a);
    const db = dueAt(b);
    if (da && db && da.getTime() !== db.getTime()) return da.getTime() - db.getTime();
    if (da && !db) return -1;
    if (!da && db) return 1;

    return (PRIORITY_RANK[a.priority] || 9) - (PRIORITY_RANK[b.priority] || 9);
  });
}
