// reminderUnit.js — Manejo de la unidad del recordatorio (segundos/minutos/horas).
//
// NOTA IMPORTANTE: la columna `reminder_hours` de la tabla `tasks` ahora guarda
// SEGUNDOS (histórico: antes guardaba minutos). No se renombró para no romper el
// esquema; siempre se interpreta como segundos en el código.

export const REMINDER_UNITS = [
  { value: 'minutes', label: 'minutos', factor: 60 },
  { value: 'hours', label: 'horas', factor: 3600 },
];

// Número + unidad del formulario → SEGUNDOS (lo que se guarda). null si vacío.
export function toReminderSeconds(value, unit) {
  const n = Number(value);
  if (!n || n <= 0) return null;
  const f = REMINDER_UNITS.find(u => u.value === unit)?.factor || 60;
  return Math.round(n * f);
}

// Segundos guardados → { value, unit } para mostrar al editar. Solo minutos u
// horas: si hay una tarea vieja guardada en segundos sueltos, la mostramos en
// minutos (al menos 1).
export function fromReminderSeconds(secs) {
  const s = Number(secs);
  if (!s || s <= 0) return { value: '', unit: 'minutes' };
  if (s % 3600 === 0) return { value: String(s / 3600), unit: 'hours' };
  return { value: String(Math.max(1, Math.round(s / 60))), unit: 'minutes' };
}
