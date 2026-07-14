import React, { memo, useState } from 'react';
import { cn } from '../utils/cn';
import { CheckCircle2, XCircle, Lightbulb, RotateCcw, Repeat, AlertTriangle, ChevronDown } from 'lucide-react';
import { recurrenceLabel } from '../utils/recurrence';
import { isOverdue } from '../utils/taskSort';

const PRIORITY_LABELS = { P1: 'P1', P2: 'P2', P3: 'P3', P4: 'P4' };
const PRIORITY_DOT = {
  p1: 'bg-red-500',
  p2: 'bg-orange-500',
  p3: 'bg-blue-500',
  p4: 'bg-slate-400',
};
const PRIORITY_BAR = {
  p1: 'border-l-red-500',
  p2: 'border-l-orange-500',
  p3: 'border-l-blue-400',
  p4: 'border-l-slate-300 dark:border-l-slate-600',
};

// Día + horario de realización, ej: "lun 07/07 · 14:30". Devuelve '' si no hay nada.
// Ojo: due_date puede venir 'YYYY-MM-DD' o timestamp; parseamos al mediodía local
// para evitar el desfase de zona horaria que corría la fecha un día para atrás.
function formatDue(due, time) {
  const parts = [];
  if (due) {
    const d = new Date(`${String(due).slice(0, 10)}T12:00:00`);
    if (!isNaN(d.getTime())) {
      parts.push(d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' }));
    }
  }
  if (time) parts.push(time);
  return parts.join(' · ');
}

export const TaskCard = memo(function TaskCard({ task, onComplete, onAction, onReopen }) {
  const [expanded, setExpanded] = useState(false);

  const isDone = task.status === 'done';
  const isFailed = task.status === 'failed';
  const isClosed = isDone || isFailed;
  const overdue = isOverdue(task);
  // Defensivo: si un payload en tiempo real llega sin priority, no tumbar la app.
  const pClass = (task.priority || '').toLowerCase();

  const due = formatDue(task.due_date, task.recurrence_time);
  const recurrence = recurrenceLabel(task.recurrence_days);
  const hasDetails = !!(task.description || task.motivation || task.fail_reason);

  return (
    <div className={cn(
      "mx-auto w-[85%] relative rounded-xl border border-l-[3px] px-3 py-2.5 transition-colors",
      PRIORITY_BAR[pClass] || 'border-l-slate-300 dark:border-l-slate-600',
      isClosed
        ? "bg-slate-50 border-slate-100 dark:bg-slate-900/50 dark:border-slate-800/50 opacity-70"
        : overdue
          ? "bg-white border-red-200 dark:bg-slate-900 dark:border-red-900/40"
          : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800"
    )}>
      <div className="flex items-start gap-2.5">
        {/* Check */}
        <button
          onClick={() => !isDone && onComplete && onComplete(task.id)}
          disabled={isDone || isFailed || !onComplete}
          aria-label="Completar tarea"
          className={cn(
            "mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
            isDone
              ? "bg-emerald-500 border-emerald-500 text-white"
              : !onComplete
                ? "border-slate-200 dark:border-slate-700 text-transparent opacity-50 cursor-default"
                : "border-slate-300 dark:border-slate-600 text-transparent hover:border-emerald-500 dark:hover:border-emerald-500"
          )}
        >
          {isDone && <CheckCircle2 size={13} strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Título + prioridad */}
          <div className="flex items-center gap-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[pClass] || 'bg-slate-400')} title={PRIORITY_LABELS[task.priority]} />
            <h3 className={cn(
              "text-sm font-medium leading-snug truncate",
              isFailed
                ? "text-red-600 dark:text-red-400 line-through decoration-red-500/70"
                : isDone
                  ? "text-slate-500 dark:text-slate-400 line-through decoration-slate-300 dark:decoration-slate-600"
                  : "text-slate-900 dark:text-slate-50"
            )}>
              {task.title}
            </h3>
            {hasDetails && (
              <button
                onClick={() => setExpanded(v => !v)}
                aria-label={expanded ? 'Ocultar detalles' : 'Ver detalles'}
                aria-expanded={expanded}
                className="ml-auto shrink-0 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <ChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} />
              </button>
            )}
          </div>

          {/* Meta en una línea */}
          {(due || recurrence || task.assignee || overdue || isFailed) && (
            <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {overdue && (
                <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle size={11} /> Vencida
                </span>
              )}
              {due && (
                <span className={cn(
                  "inline-flex items-center gap-1",
                  overdue ? "text-red-600 dark:text-red-400 font-medium" : "text-emerald-700 dark:text-emerald-400"
                )}>
                  {due}
                </span>
              )}
              {recurrence && (
                <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                  <Repeat size={11} /> {recurrence}
                </span>
              )}
              {isFailed && (
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                  <XCircle size={11} /> No completada
                </span>
              )}
              {task.assignee && (
                <span className="inline-flex items-center gap-1 truncate">
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[7px] font-bold shrink-0">
                    {task.assignee.full_name.charAt(0)}
                  </span>
                  <span className="truncate">{task.assignee.full_name}</span>
                </span>
              )}
            </div>
          )}

          {/* Detalles (colapsados por defecto) */}
          {expanded && (
            <div className="mt-2 flex flex-col gap-1.5">
              {task.description && (
                <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-2 rounded-lg">
                  {task.description}
                </p>
              )}
              {task.motivation && (
                <div className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2 rounded-lg">
                  <Lightbulb size={13} className="shrink-0 mt-0.5" />
                  <span><strong>Motivación:</strong> {task.motivation}</span>
                </div>
              )}
              {task.fail_reason && (
                <div className="flex gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2.5 py-2 rounded-lg">
                  <XCircle size={13} className="shrink-0 mt-0.5" />
                  <span><strong>Falló:</strong> {task.fail_reason}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Acciones */}
      {(onAction || (isClosed && onReopen)) && (
        <div className="mt-2 flex justify-end gap-1.5">
          {isClosed && onReopen && (
            <button
              onClick={() => onReopen(task.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            >
              <RotateCcw size={13} /> Reactivar
            </button>
          )}
          {onAction && onAction(task)}
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return prev.task.id === next.task.id &&
         prev.task.status === next.task.status &&
         prev.task.title === next.task.title &&
         prev.task.priority === next.task.priority &&
         prev.task.due_date === next.task.due_date &&
         prev.task.recurrence_time === next.task.recurrence_time &&
         prev.task.recurrence_days === next.task.recurrence_days &&
         prev.task.description === next.task.description &&
         prev.task.fail_reason === next.task.fail_reason &&
         prev.task.motivation === next.task.motivation;
});
