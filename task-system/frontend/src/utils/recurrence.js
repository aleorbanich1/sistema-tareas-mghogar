// recurrence.js — Repetición de tareas, en lenguaje simple (sin días técnicos).
//
// El patrón se guarda como palabra clave en la columna `recurrence_days`
// (reutilizada como texto, sin cambiar el esquema). La próxima fecha se calcula
// acá, en el cliente, cuando se completa una tarea (ver transport.js).

export const RECURRENCE_OPTIONS = [
  { value: '', label: 'No se repite' },
  { value: 'daily', label: 'Todos los días' },
  { value: 'weekly', label: 'Cada semana (el mismo día)' },
  { value: 'monthly', label: 'Cada mes (el mismo número)' },
  { value: 'last_business_day', label: 'Último día hábil del mes' },
];

const PATTERNS = new Set(['daily', 'weekly', 'monthly', 'last_business_day']);

export function isRecurring(pattern) {
  return PATTERNS.has(pattern);
}

// Texto corto para mostrar en la tarjeta (ej. "🔁 Cada mes").
export function recurrenceLabel(pattern) {
  const o = RECURRENCE_OPTIONS.find(x => x.value === pattern);
  return o && o.value ? o.label : null;
}

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Último día del mes que NO sea sábado ni domingo (día hábil).
function lastBusinessDayOfMonth(year, monthIndex) {
  const d = new Date(year, monthIndex + 1, 0, 12, 0, 0); // día 0 del mes siguiente = último del actual
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

// Próxima fecha ('YYYY-MM-DD') según el patrón, tomando `fromDate` como base
// (la fecha de la tarea que se acaba de completar; si no hay, hoy). null si no repite.
export function nextOccurrence(pattern, fromDate) {
  if (!isRecurring(pattern)) return null;
  const baseStr = fromDate ? String(fromDate).slice(0, 10) : fmt(new Date());
  const base = new Date(`${baseStr}T12:00:00`);
  if (isNaN(base.getTime())) return null;

  if (pattern === 'daily') {
    base.setDate(base.getDate() + 1);
    return fmt(base);
  }
  if (pattern === 'weekly') {
    base.setDate(base.getDate() + 7);
    return fmt(base);
  }
  if (pattern === 'monthly') {
    // Mismo número de día el mes siguiente (si no existe, ej. 31, usa el último).
    const dom = base.getDate();
    const target = new Date(base.getFullYear(), base.getMonth() + 1, 1, 12);
    const lastDom = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(dom, lastDom));
    return fmt(target);
  }
  if (pattern === 'last_business_day') {
    // Último día hábil del mes siguiente.
    return fmt(lastBusinessDayOfMonth(base.getFullYear(), base.getMonth() + 1));
  }
  return null;
}
