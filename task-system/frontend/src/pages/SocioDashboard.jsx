import React, { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, socket } from '../utils/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { CalendarPicker } from '../components/ui/CalendarPicker';
import { TaskCard } from '../components/TaskCard';
import { MessageCircle, Plus, Edit2, Trash2, Loader2, Check, Bell, Home, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { useAuthActions } from '../utils/auth';
import ChatPanel from '../components/ChatPanel';

// Optimizacion: Componente separado para evitar re-render del dashboard
const TaskFormModal = memo(({ isOpen, onClose, initialTask, employees, onSave, user }) => {
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
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-500"
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
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
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
          <div className="flex flex-col gap-2 col-span-2">
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
});

export default function SocioDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuthActions();
  const user = JSON.parse(localStorage.getItem('mg_user') || '{}');
  
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [activeTab, setActiveTab] = useState('activas'); // 'activas' | 'historial'
  const [assignedFilter, setAssignedFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [currentTaskToEdit, setCurrentTaskToEdit] = useState(null);
  const [currentTaskIdToDelete, setCurrentTaskIdToDelete] = useState(null);

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadTasks();
    
    // WebSocket real-time updates
    const onCreated = (task) => {
      setTasks(prev => {
        const idx = prev.findIndex(t => t.id === task.id || (t.uuid && t.uuid === task.uuid));
        if (idx >= 0) { const next = [...prev]; next[idx] = task; return next; }
        return [task, ...prev];
      });
    };
    const onUpdated = (task) => {
      setTasks(prev => prev.map(t => (t.id === task.id || (t.uuid && t.uuid === task.uuid)) ? task : t));
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
  }, [assignedFilter, statusFilter]);

  const loadEmployees = async () => {
    try {
      const data = await api('/auth/employees');
      setEmployees(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTasks = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (assignedFilter) qs.append('assigned_to', assignedFilter);
      if (statusFilter) qs.append('status', statusFilter);

      const data = await api(`/tasks?${qs.toString()}`);
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Merge a saved task into the visible list immediately (no full-screen loader),
  // so it appears without waiting for the websocket echo or a manual reload.
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

      {/* Stats Quick View (Simplified) */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">
            {tasks.filter(t => t.status === 'pending').length}
          </div>
          <div className="text-xs font-medium text-blue-600 dark:text-blue-500 uppercase tracking-wider">Pendientes</div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/50 rounded-2xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {tasks.filter(t => t.status === 'done').length}
          </div>
          <div className="text-xs font-medium text-emerald-600 dark:text-emerald-500 uppercase tracking-wider">Hechas</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 w-[85%] mx-auto">
        <button
          onClick={() => setActiveTab('activas')}
          className={cn(
            "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
            activeTab === 'activas' 
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm" 
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          Activas
        </button>
        <button
          onClick={() => setActiveTab('historial')}
          className={cn(
            "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
            activeTab === 'historial' 
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm" 
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          Historial
        </button>
      </div>

      {/* Filters & Actions */}
      <div className="flex gap-2 mb-4 w-[85%] mx-auto">
        <Select value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)} className="flex-1">
          <option value="">Todos los emp.</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </Select>
        {activeTab === 'historial' && (
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="flex-1">
            <option value="">Todos (Historial)</option>
            <option value="done">Hechas</option>
            <option value="failed">Fallidas</option>
          </Select>
        )}
        <Button onClick={openNewTask} className="px-4 shrink-0">
          <Plus size={20} />
        </Button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto -mx-5 px-5 pb-safe space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-slate-500"><Loader2 size={18} className="animate-spin" /> Cargando...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center p-8 text-slate-500">No hay tareas.</div>
        ) : (
          <AnimatePresence>
            {tasks
              .filter(t => activeTab === 'activas' ? t.status === 'pending' : t.status !== 'pending')
              .filter(t => (activeTab === 'historial' && statusFilter) ? t.status === statusFilter : true)
              .map(task => (
              <motion.div key={task.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <TaskCard 
                  task={task} 
                  isSocio={true}
                  onComplete={Number(task.assigned_to) === Number(user.id) ? handleComplete : undefined}
                  onAction={(t) => (
                    <>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="w-10 px-0" 
                        onClick={() => {
                          if (t.assignee && t.assignee.id) {
                            window.dispatchEvent(new CustomEvent('OPEN_CHAT', { detail: { userId: t.assignee.id, prefilledTask: t } }));
                          } else {
                            window.dispatchEvent(new CustomEvent('OPEN_CHAT', { detail: { prefilledTask: t } }));
                          }
                        }}
                      >
                        <MessageCircle size={16} />
                      </Button>
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
                    </>
                  )}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Task Form Modal Optimizada */}
      <TaskFormModal 
        isOpen={taskModalOpen} 
        onClose={() => setTaskModalOpen(false)} 
        initialTask={currentTaskToEdit} 
        employees={employees} 
        onSave={saveTask}
        user={user}
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
