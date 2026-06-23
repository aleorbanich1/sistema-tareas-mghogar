import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, socket } from '../utils/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { TaskCard } from '../components/TaskCard';
import { LogOut, Plus, Search, Filter, Trash2, Edit2, Bell, Home, Loader2, CheckCircle2, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { CalendarPicker } from '../components/ui/CalendarPicker';
import { useAuthActions } from '../utils/auth';
import ChatPanel from '../components/ChatPanel';

// Componente para Formulario de Tarea (adaptado para el empleado)
const TaskFormModal = ({ isOpen, onClose, initialTask, employees, onSave, user }) => {
  const [formData, setFormData] = useState({
    title: '', priority: 'P3', assigned_to: '', description: '',
    due_date: '', recurrence_time: '', recurrence_interval: '', recurrence_days: [], reminder_hours: '', motivation: ''
  });
  const [recurrenceEdited, setRecurrenceEdited] = useState(false);
  const [isRecurrenceActive, setIsRecurrenceActive] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialTask) {
        const initialDays = initialTask.recurrence_days ? initialTask.recurrence_days.split(',') : [];
        setFormData({
          title: initialTask.title || '', priority: initialTask.priority || 'P3', 
          assigned_to: initialTask.assigned_to || '', description: initialTask.description || '',
          due_date: initialTask.due_date || '', recurrence_time: initialTask.recurrence_time || '', 
          recurrence_interval: initialTask.recurrence_interval || '',
          recurrence_days: initialDays,
          reminder_hours: initialTask.reminder_hours || '',
          motivation: initialTask.motivation || ''
        });
        setRecurrenceEdited(true);
        setIsRecurrenceActive(initialDays.length > 0);
      } else {
        setFormData({ 
          title: '', priority: 'P3', assigned_to: '', description: '',
          due_date: '', recurrence_time: '', recurrence_interval: '', recurrence_days: [], reminder_hours: '', motivation: ''
        });
        setRecurrenceEdited(false);
        setIsRecurrenceActive(false);
      }
    }
  }, [isOpen, initialTask]);

  const [submitting, setSubmitting] = useState(false);
  const saveTask = async () => {
    if (submitting) return;
    if (!formData.title.trim()) return alert('Título requerido');
    setSubmitting(true);
    try {
      await onSave(formData, initialTask?.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialTask ? 'Editar Tarea' : 'Nueva Tarea'}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Título</label>
          <Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="¿Qué hay que hacer?" />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Descripción / Detalles</label>
          <textarea 
            value={formData.description} 
            onChange={e => setFormData({...formData, description: e.target.value})} 
            placeholder="Detalles adicionales..."
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
            rows={3}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Motivación</label>
          <Input value={formData.motivation} onChange={e => setFormData({...formData, motivation: e.target.value})} placeholder="¿Por qué es importante esta tarea?" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Prioridad</label>
            <Select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})}>
              <option value="P1">P1 - Urgente</option>
              <option value="P2">P2 - Alta</option>
              <option value="P3">P3 - Normal</option>
              <option value="P4">P4 - Baja</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Asignar a</label>
            <Select value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})}>
              <option value="">Sin asignar</option>
              {user && user.id && <option value={user.id}>Para mí</option>}
              {employees && employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Fecha Límite</label>
            <CalendarPicker selectedDate={formData.due_date} onSelectDate={(dateStr) => {
              setFormData(prev => {
                const next = { ...prev, due_date: dateStr };
                if (isRecurrenceActive && !recurrenceEdited && dateStr) {
                  const d = new Date(dateStr + 'T12:00:00');
                  next.recurrence_days = [String(d.getDay())];
                }
                return next;
              });
            }} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Horario</label>
            <Input type="time" value={formData.recurrence_time} onChange={e => setFormData({...formData, recurrence_time: e.target.value})} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Repetición</label>
            <button
              type="button"
              onClick={() => {
                const nextState = !isRecurrenceActive;
                setIsRecurrenceActive(nextState);
                if (nextState) {
                  if (formData.due_date && formData.recurrence_days.length === 0) {
                    const d = new Date(formData.due_date + 'T12:00:00');
                    setFormData(prev => ({ ...prev, recurrence_days: [String(d.getDay())] }));
                    setRecurrenceEdited(false);
                  }
                } else {
                  setFormData(prev => ({ ...prev, recurrence_days: [] }));
                }
              }}
              className={cn(
                "text-xs font-semibold px-3 py-1.5 rounded-full transition-all border",
                isRecurrenceActive
                  ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              )}
            >
              {isRecurrenceActive ? "Desactivar" : "Activar repetición"}
            </button>
          </div>
          {isRecurrenceActive && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex justify-between gap-1 overflow-hidden">
              {[
                { val: '1', label: 'L' }, { val: '2', label: 'M' }, { val: '3', label: 'M' },
                { val: '4', label: 'J' }, { val: '5', label: 'V' }, { val: '6', label: 'S' }, { val: '0', label: 'D' }
              ].map(d => {
                const isSel = formData.recurrence_days.includes(d.val);
                return (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => {
                      setRecurrenceEdited(true);
                      setFormData(prev => {
                        const days = new Set(prev.recurrence_days);
                        if (days.has(d.val)) days.delete(d.val);
                        else days.add(d.val);
                        return { ...prev, recurrence_days: Array.from(days) };
                      });
                    }}
                    className={cn(
                      "w-10 h-10 rounded-full text-sm font-semibold transition-all flex items-center justify-center",
                      isSel 
                        ? "bg-emerald-500 text-white shadow-md dark:bg-emerald-600"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                    )}
                  >
                    {d.label}
                  </button>
                )
              })}
            </motion.div>
          )}
        </div>

        {/* Recordatorio */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Bell size={16} /> Recordatorio
            <span className="text-xs font-normal text-slate-400">¿Cuántos minutos antes avisar?</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const val = Math.max(0, (Number(formData.reminder_hours) || 0) - 1);
                setFormData(prev => ({ ...prev, reminder_hours: val === 0 ? '' : String(val) }));
              }}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-lg font-bold flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors select-none"
            >−</button>
            <input
              type="number"
              min="0"
              max="999"
              value={formData.reminder_hours}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setFormData(prev => ({ ...prev, reminder_hours: raw }));
              }}
              placeholder="0"
              className="w-24 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center text-lg font-bold text-slate-900 dark:text-slate-50 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => {
                const val = (Number(formData.reminder_hours) || 0) + 1;
                setFormData(prev => ({ ...prev, reminder_hours: String(val) }));
              }}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-lg font-bold flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors select-none"
            >+</button>
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {Number(formData.reminder_hours) === 1 ? 'minuto' : 'minutos'}
            </span>
          </div>
        </div>

        <Button onClick={saveTask} disabled={submitting} className="w-full mt-4">{submitting ? 'Guardando…' : 'Guardar Tarea'}</Button>
      </div>
    </Modal>
  );
};

export default function EmpleadoDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuthActions();
  const user = JSON.parse(localStorage.getItem('mg_user') || '{}');
  
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const [failModalOpen, setFailModalOpen] = useState(false);
  const [failTaskId, setFailTaskId] = useState(null);
  const [failReason, setFailReason] = useState('');
  const [failOfflineWarning, setFailOfflineWarning] = useState(false);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [currentTaskToEdit, setCurrentTaskToEdit] = useState(null);
  const [currentTaskIdToDelete, setCurrentTaskIdToDelete] = useState(null);

  useEffect(() => {
    loadTasks();
    loadEmployees();

    // WebSocket real-time updates
    const onCreated = (task) => {
      if (Number(task.assigned_to) !== Number(user.id)) return;
      setTasks(prev => {
        const idx = prev.findIndex(t => t.id === task.id || (t.uuid && t.uuid === task.uuid));
        if (idx >= 0) { const next = [...prev]; next[idx] = task; return next; }
        return [task, ...prev];
      });
    };
    const onUpdated = (task) => {
      setTasks(prev => {
        if (Number(task.assigned_to) !== Number(user.id)) {
          return prev.filter(t => t.id !== task.id);
        }
        return prev.map(t => (t.id === task.id || (t.uuid && t.uuid === task.uuid)) ? task : t);
      });
    };
    const onDeleted = ({ id }) => {
      setTasks(prev => prev.filter(t => t.id !== id));
    };

    socket.on('TASK_CREATED', onCreated);
    socket.on('TASK_UPDATED', onUpdated);
    socket.on('TASK_DELETED', onDeleted);

    return () => {
      socket.off('TASK_CREATED', onCreated);
      socket.off('TASK_UPDATED', onUpdated);
      socket.off('TASK_DELETED', onDeleted);
    };
  }, [statusFilter, priorityFilter]);

  const loadTasks = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.append('status', statusFilter);
      if (priorityFilter) qs.append('priority', priorityFilter);

      const data = await api(`/tasks?${qs.toString()}`);
      setTasks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await api('/auth/employees');
      setEmployees(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Merge a saved/updated task into the visible list immediately (no full-screen
  // loader), so it appears without waiting for the websocket echo or a reload.
  const upsertTaskInState = (task) => {
    if (!task || !task.id) return;
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === task.id || (t.uuid && t.uuid === task.uuid));
      if (idx >= 0) { const next = [...prev]; next[idx] = task; return next; }
      return [task, ...prev];
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const handleComplete = async (id) => {
    try {
      const saved = await api(`/tasks/${id}/complete`, { method: 'PATCH' });
      upsertTaskInState(saved);
      loadTasks({ silent: true });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFail = async () => {
    if (!failReason.trim()) return alert('Escribí el motivo');
    if (!navigator.onLine) {
      setFailOfflineWarning(true);
      return;
    }
    setFailOfflineWarning(false);
    try {
      const saved = await api(`/tasks/${failTaskId}/fail`, {
        method: 'PATCH',
        body: { reason: failReason }
      });
      
      // Auto-send chat message to creator
      const task = tasks.find(t => t.id === failTaskId);
      if (task && task.creator && task.creator.id) {
        try {
          await api('/chat/messages', {
            method: 'POST',
            body: { 
              content: `🚨 Reporte de Fallo: ${failReason}`,
              to_user: task.creator.id,
              task_ids: [task.id]
            }
          });
          window.dispatchEvent(new CustomEvent('OPEN_CHAT', { detail: { userId: task.creator.id } }));
        } catch(e) { console.error('Error auto-sending fail msg', e); }
      }

      setFailModalOpen(false);
      setFailReason('');
      upsertTaskInState(saved);
      loadTasks({ silent: true });
    } catch (err) {
      alert(err.message);
    }
  };

  const openFailModal = (id) => {
    setFailTaskId(id);
    setFailReason('');
    setFailOfflineWarning(false);
    setFailModalOpen(true);
  };

  const openNewTask = () => {
    setCurrentTaskToEdit(null);
    setTaskModalOpen(true);
  };

  const saveTask = async (formData, currentTaskId) => {
    try {
      const body = {
        title: formData.title,
        priority: formData.priority,
        assigned_to: formData.assigned_to ? Number(formData.assigned_to) : null,
        description: formData.description,
        due_date: formData.due_date || null,
        recurrence_time: formData.recurrence_time || null,
        recurrence_interval: formData.recurrence_interval ? Number(formData.recurrence_interval) : null,
        recurrence_days: formData.recurrence_days.length > 0 ? formData.recurrence_days.join(',') : null,
        reminder_hours: formData.reminder_hours ? Number(formData.reminder_hours) : null,
        motivation: formData.motivation || null,
      };

      const saved = currentTaskId
        ? await api(`/tasks/${currentTaskId}`, { method: 'PATCH', body })
        : await api('/tasks', { method: 'POST', body });
      setTaskModalOpen(false);
      upsertTaskInState(saved);
      loadTasks({ silent: true });
    } catch (err) {
      alert(err.message);
    }
  };

  const confirmDelete = async () => {
    try {
      await api(`/tasks/${currentTaskIdToDelete}`, { method: 'DELETE' });
      setDeleteModalOpen(false);
      setTasks(prev => prev.filter(t => t.id !== currentTaskIdToDelete));
      loadTasks({ silent: true });
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <img src="/logo.png" alt="MG Hogar" className="w-6 h-6 object-contain rounded-md" /> MG Hogar
          </span>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Hola, <span className="text-slate-900 dark:text-slate-200">{user.full_name}</span>
          </p>
        </div>
        <button 
          onClick={handleLogout}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <Select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex-1"
        >
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="done">Hecho</option>
          <option value="failed">No pudo completarse</option>
          <option value="info_needed">Falta info</option>
        </Select>
        <Select 
          value={priorityFilter} 
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="flex-1"
        >
          <option value="">Toda prioridad</option>
          <option value="P1">P1 - Urgente</option>
          <option value="P2">P2 - Alta</option>
          <option value="P3">P3 - Normal</option>
          <option value="P4">P4 - Baja</option>
        </Select>
        <Button onClick={openNewTask} className="px-4 shrink-0">
          <Plus size={20} />
        </Button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto -mx-5 px-5 pb-safe space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Cargando tareas...
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 dark:bg-red-900/20 dark:border-red-900/50">
            {error}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center p-8 text-slate-500 dark:text-slate-400">
            <CheckCircle2 size={40} className="mx-auto mb-4 text-emerald-500" />
            No hay tareas para mostrar.
          </div>
        ) : (
          <AnimatePresence>
            {tasks.map((task) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <TaskCard 
                  task={task} 
                  onComplete={handleComplete}
                  onAction={(t) => (
                    <>
                      <Button variant="secondary" size="sm" className="w-10 px-0" onClick={() => {
                        setCurrentTaskToEdit(t);
                        setTaskModalOpen(true);
                      }}>
                        <Edit2 size={16} />
                      </Button>
                      <Button variant="danger" size="sm" className="w-10 px-0" onClick={() => {
                        setCurrentTaskIdToDelete(t.id);
                        setDeleteModalOpen(true);
                      }}>
                        <Trash2 size={16} />
                      </Button>
                      {!['done', 'failed'].includes(t.status) && (
                        <>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={() => {
                              if (t.creator && t.creator.id) {
                                window.dispatchEvent(new CustomEvent('OPEN_CHAT', { detail: { userId: t.creator.id, prefilledTask: t } }));
                              } else {
                                window.dispatchEvent(new CustomEvent('OPEN_CHAT', { detail: { prefilledTask: t } }));
                              }
                            }}
                          >
                            Duda / Chat
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => openFailModal(t.id)}>
                            Reportar Fallo
                          </Button>
                        </>
                      )}
                    </>
                  )}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Fail Modal */}
      <Modal 
        isOpen={failModalOpen} 
        onClose={() => setFailModalOpen(false)}
        title="Reportar fallo"
      >
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Vas a avisar que la tarea no pudo completarse. Explicá el motivo.
        </p>
        {failOfflineWarning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-4 mb-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50"
          >
            <WifiOff size={20} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Sin conexión a internet
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                El reporte de fallo no se puede enviar sin internet. Podés seguir registrando y editando tareas mientras tanto.
              </p>
            </div>
          </motion.div>
        )}
        <div className="flex flex-col gap-2 mb-6">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">
            ¿Por qué no se pudo completar?
          </label>
          <Input 
            value={failReason}
            onChange={(e) => setFailReason(e.target.value)}
            placeholder="Describí el motivo..."
          />
        </div>
        <Button variant="danger" className="w-full" onClick={handleFail}>
          Comunicar a Ale
        </Button>
      </Modal>

      {/* Task Form Modal */}
      <TaskFormModal 
        isOpen={taskModalOpen} 
        onClose={() => setTaskModalOpen(false)} 
        initialTask={currentTaskToEdit} 
        employees={employees}
        user={user}
        onSave={saveTask} 
      />

      {/* Delete Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Eliminar tarea">
        <p className="text-slate-500 mb-6">¿Estás seguro de eliminar esta tarea? No se puede deshacer.</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteModalOpen(false)}>Cancelar</Button>
          <Button variant="danger" className="flex-1" onClick={confirmDelete}>Eliminar</Button>
        </div>
      </Modal>

      {/* Chat Flotante */}
      <ChatPanel />
    </div>
  );
}
