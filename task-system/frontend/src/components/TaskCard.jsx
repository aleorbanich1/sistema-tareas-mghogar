import React, { memo } from 'react';
import { cn } from '../utils/cn';
import { CheckCircle2, Clock, Info, XCircle, Lightbulb, RotateCcw, Repeat } from 'lucide-react';
import { recurrenceLabel } from '../utils/recurrence';

const PRIORITY_LABELS = { P1: 'P1 Urgente', P2: 'P2 Alta', P3: 'P3 Normal', P4: 'P4 Baja' };
const STATUS_LABELS = { pending: 'Pendiente', done: 'Hecha', failed: 'No completada', info_needed: 'Falta info' };

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

export const TaskCard = memo(function TaskCard({ task, onComplete, onAction, onReopen, isSocio }) {
  const isDone = task.status === 'done';
  const isFailed = task.status === 'failed';
  const isClosed = isDone || isFailed;
  // Tareas falladas en la vista del empleado: tachadas en rojo y más chicas.
  const shrinkFailed = isFailed && !isSocio;
  // Defensivo: si un payload en tiempo real llega sin priority, no tumbar la app.
  const pClass = (task.priority || '').toLowerCase();

  return (
    <div className={cn(
      "mx-auto relative rounded-2xl border transition-all duration-300",
      shrinkFailed
        ? "w-[62%] p-3 bg-red-50/60 border-red-100 dark:bg-red-900/10 dark:border-red-900/30 opacity-80"
        : isDone
          ? "w-[85%] p-5 bg-slate-50 border-slate-100 dark:bg-slate-900/50 dark:border-slate-800/50 opacity-75"
          : "w-[85%] p-5 bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-sm"
    )}>
      <div className="flex items-start gap-4">
        {/* Check Circle */}
        <button 
          onClick={() => !isDone && onComplete && onComplete(task.id)}
          disabled={isDone || task.status === 'failed' || !onComplete}
          className={cn(
            "mt-1 flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors",
            isDone 
              ? "bg-emerald-500 border-emerald-500 text-white" 
              : !onComplete
                ? "border-slate-200 dark:border-slate-700 text-transparent opacity-50 cursor-default"
                : "border-slate-300 dark:border-slate-600 text-transparent hover:border-emerald-500 dark:hover:border-emerald-500"
          )}
        >
          {isDone && <CheckCircle2 size={18} strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={cn(
              "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full",
              {
                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': pClass === 'p1',
                'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400': pClass === 'p2',
                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': pClass === 'p3',
                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400': pClass === 'p4',
              }
            )}>
              {PRIORITY_LABELS[task.priority]}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {STATUS_LABELS[task.status]}
            </span>
            {formatDue(task.due_date, task.recurrence_time) && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/25 px-2 py-0.5 rounded-full tabular-nums">
                <Clock size={12} />
                {formatDue(task.due_date, task.recurrence_time)}
              </span>
            )}
            {recurrenceLabel(task.recurrence_days) && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/25 px-2 py-0.5 rounded-full">
                <Repeat size={12} />
                {recurrenceLabel(task.recurrence_days)}
              </span>
            )}
          </div>
          
          <h3 className={cn(
            "font-semibold tracking-tight mb-2",
            shrinkFailed ? "text-sm" : "text-lg",
            isFailed
              ? "text-red-600 dark:text-red-400 line-through decoration-red-500/70"
              : isDone
                ? "text-slate-500 dark:text-slate-400 line-through decoration-slate-300 dark:decoration-slate-600"
                : "text-slate-900 dark:text-slate-50"
          )}>
            {task.title}
          </h3>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {task.assignee && (
              <div className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold">
                  {task.assignee.full_name.charAt(0)}
                </span>
                <span>{task.assignee.full_name}</span>
              </div>
            )}
          </div>

          {task.description && (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
              {task.description}
            </p>
          )}

          {task.motivation && (
            <div className="mt-3 flex gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30">
              <Lightbulb size={16} className="shrink-0 mt-0.5" />
              <span><strong>Motivación:</strong> {task.motivation}</span>
            </div>
          )}

          {task.fail_reason && (
            <div className="mt-3 flex gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              <span><strong>Falló:</strong> {task.fail_reason}</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {(onAction || (isClosed && onReopen)) && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          {isClosed && onReopen && (
            <button
              onClick={() => onReopen(task.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            >
              <RotateCcw size={15} /> Reactivar
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
         prev.task.motivation === next.task.motivation;
});
