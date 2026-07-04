import React, { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, socket } from '../utils/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { CalendarPicker } from '../components/ui/CalendarPicker';
import { TaskCard } from '../components/TaskCard';
import { MessageCircle, Plus, Edit2, Trash2, Loader2, Check, Bell, Home, LogOut, UserPlus, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { useAuthActions } from '../utils/auth';
import { supabase } from '../utils/supabaseClient';
import ChatPanel from '../components/ChatPanel';
import { ensureNotificationPermission, armAudioUnlock, playPop } from '../utils/notifications';
import { useTaskReminders } from '../utils/useTaskNotifications';
import { initReminders, syncReminders } from '../utils/reminders';
import { REMINDER_UNITS, toReminderSeconds, fromReminderSeconds } from '../utils/reminderUnit';
import { RECURRENCE_OPTIONS } from '../utils/recurrence';
import { NotificationGate } from '../components/NotificationGate';

// Iniciales para el avatar del registro (ej. "Olivia Sterling" → "OS").
function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

// Tiempo relativo corto en español.
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

// Optimizacion: Componente separado para evitar re-render del dashboard
const TaskFormModal = memo(({ isOpen, onClose, initialTask, employees, onSave, user }) => {
  const [formData, setFormData] = useState({
    title: '', priority: 'P3', assigned_to: '', description: '',
    due_date: '', recurrence_time: '', recurrence_days: '', reminder_hours: '', reminder_unit: 'minutes', motivation: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (initialTask) {
        setFormData({
          title: initialTask.title || '', priority: initialTask.priority || 'P3',
          assigned_to: initialTask.assigned_to || '', description: initialTask.description || '',
          due_date: initialTask.due_date || '', recurrence_time: initialTask.recurrence_time || '',
          recurrence_days: initialTask.recurrence_days || '',
          ...(() => { const r = fromReminderSeconds(initialTask.reminder_hours); return { reminder_hours: r.value, reminder_unit: r.unit }; })(),
          motivation: initialTask.motivation || ''
        });
      } else {
        setFormData({
          title: '', priority: 'P3', assigned_to: '', description: '',
          due_date: '', recurrence_time: '', recurrence_days: '', reminder_hours: '', reminder_unit: 'minutes', motivation: ''
        });
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
              setFormData(prev => ({ ...prev, due_date: dateStr }));
            }} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Horario</label>
            <Input type="time" value={formData.recurrence_time} onChange={e => setFormData({...formData, recurrence_time: e.target.value})} />
          </div>
          <div className="flex flex-col gap-2 col-span-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Repetición</label>
            <Select
              value={formData.recurrence_days}
              onChange={e => setFormData(prev => ({ ...prev, recurrence_days: e.target.value }))}
            >
              {RECURRENCE_OPTIONS.map(o => (
                <option key={o.value || 'none'} value={o.value}>{o.label}</option>
              ))}
            </Select>
            {formData.recurrence_days && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Al completarla se crea sola la próxima, según esta repetición.
              </span>
            )}
          </div>

        </div>

        {/* Recordatorio */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Bell size={16} /> Recordatorio
            <span className="text-xs font-normal text-slate-400">¿Cada cuánto repetir el aviso?</span>
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
            <select
              value={formData.reminder_unit}
              onChange={e => setFormData(prev => ({ ...prev, reminder_unit: e.target.value }))}
              className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium text-slate-700 dark:text-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
            >
              {REMINDER_UNITS.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Suena cada ese tiempo mientras la tarea esté pendiente. Dejá en 0 para no avisar.
          </span>
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
  const isJefe = user.role === 'jefe';

  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Registros pendientes (solo jefe)
  const [pendingRegs, setPendingRegs] = useState([]);
  const [regsModalOpen, setRegsModalOpen] = useState(false);
  const [regsLoading, setRegsLoading] = useState(false);
  const [regBusyId, setRegBusyId] = useState(null);
  const [confirmRejectId, setConfirmRejectId] = useState(null);
  
  // Filters
  const [activeTab, setActiveTab] = useState('activas'); // 'activas' | 'historial'
  const [assignedFilter, setAssignedFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [currentTaskToEdit, setCurrentTaskToEdit] = useState(null);
  const [currentTaskIdToDelete, setCurrentTaskIdToDelete] = useState(null);

  // Notificaciones: permiso, sonido y entrega en segundo plano (push/nativo).
  useEffect(() => {
    ensureNotificationPermission();
    armAudioUnlock();
    initReminders(user.id);
  }, [user.id]);

  // Recordatorios en primer plano (solo web) para tareas asignadas al socio/jefe.
  useTaskReminders(tasks, user.id);

  // Reagenda notificaciones nativas (APK) al cambiar las tareas.
  useEffect(() => {
    syncReminders(tasks, user.id);
  }, [tasks, user.id]);

  // Banner visible dentro de la app cuando salta un recordatorio.
  const [reminderBanner, setReminderBanner] = useState(null);
  useEffect(() => {
    const onReminder = (e) => {
      setReminderBanner(e.detail);
      setTimeout(() => setReminderBanner(null), 8000);
    };
    window.addEventListener('MG_REMINDER', onReminder);
    return () => window.removeEventListener('MG_REMINDER', onReminder);
  }, []);

  useEffect(() => {
    loadEmployees();
    if (isJefe) loadPendingRegs();
  }, []);

  const loadPendingRegs = async () => {
    if (!isJefe) return;
    setRegsLoading(true);
    try {
      const { data, error } = await supabase
        .from('pending_registrations')
        .select('id, full_name, username, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setPendingRegs(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setRegsLoading(false);
    }
  };

  const approveReg = async (id) => {
    setRegBusyId(id);
    try {
      const { error } = await supabase.rpc('approve_registration', { p_id: id });
      if (error) throw error;
      setPendingRegs(prev => prev.filter(r => r.id !== id));
      loadEmployees(); // el nuevo empleado ya queda disponible para asignar
    } catch (err) {
      alert(err.message || 'No se pudo aprobar');
    } finally {
      setRegBusyId(null);
    }
  };

  const rejectReg = async (id) => {
    setRegBusyId(id);
    try {
      const { error } = await supabase.rpc('reject_registration', { p_id: id });
      if (error) throw error;
      setPendingRegs(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(err.message || 'No se pudo rechazar');
    } finally {
      setRegBusyId(null);
      setConfirmRejectId(null);
    }
  };

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
    playPop(); // sonido de tarea completada (inmediato, antes de la red)
    try {
      const saved = await api(`/tasks/${id}/complete`, { method: 'PATCH' });
      upsertTaskInState(saved);
      loadTasks({ silent: true });
    } catch (err) {
      alert(err.message);
    }
  };

  // Reactivar una tarea completada/fallida: vuelve a "pendiente".
  const handleReopen = async (id) => {
    try {
      const saved = await api(`/tasks/${id}`, { method: 'PATCH', body: { status: 'pending', fail_reason: null } });
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
        recurrence_interval: null,
        recurrence_days: formData.recurrence_days || null, // patrón de repetición (keyword)
        reminder_hours: toReminderSeconds(formData.reminder_hours, formData.reminder_unit), // guardado en segundos
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
        <div className="flex items-center gap-2">
          {isJefe && (
            <button
              onClick={() => { setRegsModalOpen(true); loadPendingRegs(); }}
              aria-label="Registros pendientes"
              className="relative p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors"
            >
              <UserPlus size={20} />
              {pendingRegs.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums ring-2 ring-slate-50 dark:ring-slate-950">
                  {pendingRegs.length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Aviso de permisos de notificación (al iniciar sesión) */}
      <NotificationGate userId={user.id} />

      {/* Banner de recordatorio dentro de la app */}
      {reminderBanner && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 mb-4 rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50"
        >
          <Bell size={20} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold">{reminderBanner.title}</p>
            <p className="text-sm">{reminderBanner.body}</p>
          </div>
          <button onClick={() => setReminderBanner(null)} className="text-emerald-600 dark:text-emerald-400 shrink-0">✕</button>
        </motion.div>
      )}

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
                  onReopen={handleReopen}
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

      {/* Registros pendientes (solo jefe) */}
      {isJefe && (
        <Modal
          isOpen={regsModalOpen}
          onClose={() => { setRegsModalOpen(false); setConfirmRejectId(null); }}
          title="Registros pendientes"
        >
          {regsLoading ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3 py-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-2.5 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : pendingRegs.length === 0 ? (
            <div className="text-center py-10">
              <div className="inline-flex w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 items-center justify-center text-slate-400 mb-4">
                <Clock size={26} />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No hay registros pendientes</p>
              <p className="text-xs text-slate-400 mt-1">Cuando alguien se registre, va a aparecer acá para aprobar.</p>
            </div>
          ) : (
            <div className="flex flex-col max-h-[60vh] overflow-y-auto -mx-1 px-1">
              <AnimatePresence initial={false}>
                {pendingRegs.map(r => {
                  const busy = regBusyId === r.id;
                  const confirming = confirmRejectId === r.id;
                  return (
                    <motion.div
                      key={r.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
                      className="flex items-center gap-3 py-3 border-t border-slate-100 dark:border-slate-800 first:border-t-0"
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 text-sm font-bold">
                        {initials(r.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">{r.full_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          @{r.username} · {timeAgo(r.created_at)}
                        </p>
                      </div>

                      {confirming ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" variant="danger" disabled={busy} onClick={() => rejectReg(r.id)}>
                            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Rechazar'}
                          </Button>
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmRejectId(null)}>
                            No
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" className="px-3" disabled={busy} onClick={() => approveReg(r.id)}>
                            {busy ? <Loader2 size={16} className="animate-spin" /> : (<><Check size={16} className="mr-1" /> Aprobar</>)}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-11 px-0 text-red-600 dark:text-red-400"
                            disabled={busy}
                            aria-label={`Rechazar a ${r.full_name}`}
                            onClick={() => setConfirmRejectId(r.id)}
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </Modal>
      )}

      {/* Chat Flotante */}
      <ChatPanel />
    </div>
  );
}
