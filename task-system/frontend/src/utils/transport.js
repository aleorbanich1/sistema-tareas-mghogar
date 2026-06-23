// transport.js — Traduce las llamadas api(path, opts) del frontend a operaciones
// directas contra Supabase (anon key + RLS). Reemplaza al backend Express.
// La capa offline (api.js) NO cambia: solo cambia "el transporte".
import { supabase } from './supabaseClient';

// Embebido de relaciones (mismos nombres de FK que usaba el backend).
const TASK_SELECT =
  '*, assignee:users!tasks_assigned_to_fkey(id,username,full_name), creator:users!tasks_created_by_fkey(id,username,full_name)';
const MSG_SELECT =
  '*, sender:users!messages_from_user_fkey(id,username,full_name), receiver:users!messages_to_user_fkey(id,username,full_name)';

const TASK_PATCH_FIELDS = [
  'title', 'description', 'motivation', 'priority', 'due_date',
  'recurrence_interval', 'recurrence_days', 'recurrence_time', 'reminder_hours',
  'assigned_to', 'status', 'fail_reason',
];

function me() {
  try { return JSON.parse(localStorage.getItem('mg_user') || '{}'); }
  catch { return {}; }
}

// Marca el error como "de red" para que api.js encole la mutación offline.
function wrapError(error) {
  const msg = error?.message || 'Error';
  if (!navigator.onLine || /fetch|network|failed to fetch|timeout/i.test(msg)) {
    return Object.assign(new Error(msg), { isNetwork: true });
  }
  return new Error(msg);
}

function dayOfWeek(dueDate) {
  // Acepta 'YYYY-MM-DD' o ISO completo. Devuelve 0=Dom..6=Sáb (como JS getDay).
  let d = new Date(`${dueDate}T12:00:00`);
  if (isNaN(d)) d = new Date(dueDate);
  return isNaN(d) ? null : d.getDay();
}

// ── Enriquecido de mensajes (= enrichMsg del backend) ───────────────────────
async function enrichMessage(row) {
  let taskIds = [];
  try {
    if (typeof row.task_ids === 'string') taskIds = JSON.parse(row.task_ids);
    else if (Array.isArray(row.task_ids)) taskIds = row.task_ids;
  } catch {}

  let tasks = [];
  if (taskIds.length > 0) {
    const { data } = await supabase.from('tasks').select('id,title,status,priority').in('id', taskIds);
    tasks = data || [];
  }

  const m = {
    ...row,
    task_ids: taskIds,
    tasks,
    from_username: row.sender?.username,
    from_full_name: row.sender?.full_name,
    to_username: row.receiver?.username,
    to_full_name: row.receiver?.full_name,
  };
  delete m.sender;
  delete m.receiver;
  return m;
}

// ── Crear tarea (POST /tasks y /tasks/self) ─────────────────────────────────
async function createTask(body, self) {
  const u = me();
  const b = body || {};

  if (b.uuid) {
    const { data: existing } = await supabase.from('tasks').select(TASK_SELECT).eq('uuid', b.uuid).maybeSingle();
    if (existing) return existing; // dedup de reintentos offline
  }

  // empleado solo puede asignarse a sí mismo; socio/jefe a quien sea.
  let assigned_to;
  if (self || u.role === 'empleado') assigned_to = u.id;
  else assigned_to = b.assigned_to ?? null;

  let primary_recurrence_day = null;
  if (b.due_date && b.recurrence_days) primary_recurrence_day = dayOfWeek(b.due_date);

  const insert = {
    title: b.title,
    description: b.description || '',
    motivation: b.motivation || '',
    priority: b.priority || 'P3',
    due_date: b.due_date || null,
    recurrence_interval: b.recurrence_interval || null,
    recurrence_days: b.recurrence_days || null,
    recurrence_time: b.recurrence_time || null,
    reminder_hours: b.reminder_hours || null,
    assigned_to: assigned_to || null,
    created_by: u.id,
    uuid: b.uuid || null,
    primary_recurrence_day,
  };

  const { data, error } = await supabase.from('tasks').insert(insert).select(TASK_SELECT).single();
  if (error) throw error;
  return data;
}

// ── Enviar mensaje (POST /chat/messages) ────────────────────────────────────
async function sendMessage(body) {
  const u = me();
  const b = body || {};

  if (b.uuid) {
    const { data: existing } = await supabase.from('messages').select(MSG_SELECT).eq('uuid', b.uuid).maybeSingle();
    if (existing) return enrichMessage(existing);
  }

  const insert = {
    from_user: u.id,
    to_user: b.to_user,
    content: b.content,
    task_ids: Array.isArray(b.task_ids) ? b.task_ids : [],
    uuid: b.uuid || null,
    read: false,
  };

  const { data, error } = await supabase.from('messages').insert(insert).select(MSG_SELECT).single();
  if (error) throw error;
  return enrichMessage(data);
}

// ── Router principal: imita las respuestas del backend (devuelve data o tira) ─
export async function request(path, method = 'GET', body = null) {
  method = method.toUpperCase();
  const [rawPath, qs] = path.split('?');
  const params = new URLSearchParams(qs || '');

  try {
    // ── AUTH ────────────────────────────────────────────────────────────
    if (rawPath === '/auth/users' && method === 'GET') {
      const { data, error } = await supabase.from('users').select('id,username,full_name,role').order('id');
      if (error) throw error;
      return data || [];
    }
    if (rawPath === '/auth/employees' && method === 'GET') {
      const { data, error } = await supabase.from('users').select('id,username,full_name,role').eq('role', 'empleado').order('id');
      if (error) throw error;
      return data || [];
    }
    if (rawPath === '/auth/me' && method === 'GET') {
      const { data, error } = await supabase.from('users').select('id,username,full_name,role,created_at').eq('id', me().id).single();
      if (error) throw error;
      return data;
    }

    // ── TASKS ───────────────────────────────────────────────────────────
    if (rawPath === '/tasks' && method === 'GET') {
      let q = supabase.from('tasks').select(TASK_SELECT);
      const status = params.get('status');
      const priority = params.get('priority');
      const assignedTo = params.get('assigned_to');
      const history = params.get('history') === 'true';

      if (assignedTo) q = q.eq('assigned_to', Number(assignedTo));
      if (history) {
        q = q.in('status', ['done', 'failed']).order('updated_at', { ascending: false });
      } else {
        if (status) q = q.eq('status', status);
        if (priority) q = q.eq('priority', priority);
        q = q.order('priority', { ascending: true }).order('due_date', { ascending: true });
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    }
    if (rawPath === '/tasks' && method === 'POST') return await createTask(body, false);
    if (rawPath === '/tasks/self' && method === 'POST') return await createTask(body, true);

    if (rawPath.startsWith('/tasks/')) {
      const [rawId, action] = rawPath.slice('/tasks/'.length).split('/');
      const col = /^\d+$/.test(rawId) ? 'id' : 'uuid';
      const val = col === 'id' ? Number(rawId) : rawId;

      if (method === 'GET') {
        const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq(col, val).single();
        if (error) throw error;
        return data;
      }
      if (method === 'DELETE') {
        const { error } = await supabase.from('tasks').delete().eq(col, val);
        if (error) throw error;
        return { message: 'Tarea eliminada' };
      }
      if (method === 'PATCH') {
        let patch;
        if (action === 'complete') patch = { status: 'done' };
        else if (action === 'fail') patch = { status: 'failed', fail_reason: (body?.reason || '').trim() };
        else if (action === 'info-needed') patch = { status: 'info_needed' };
        else {
          patch = {};
          for (const k of TASK_PATCH_FIELDS) if (body && body[k] !== undefined) patch[k] = body[k];
        }
        const { data, error } = await supabase.from('tasks').update(patch).eq(col, val).select(TASK_SELECT).single();
        if (error) throw error;
        return data; // el trigger de Postgres genera la próxima tarea recurrente al completar
      }
    }

    // ── CHAT ────────────────────────────────────────────────────────────
    if (rawPath === '/chat/unread' && method === 'GET') {
      const { count, error } = await supabase
        .from('messages').select('*', { count: 'exact', head: true })
        .eq('to_user', me().id).eq('read', false);
      if (error) throw error;
      return { unread: count || 0 };
    }
    if (rawPath === '/chat/messages' && method === 'GET') {
      const uid = me().id;
      const wid = params.get('with') ? Number(params.get('with')) : null;
      let q = supabase.from('messages').select(MSG_SELECT).order('created_at', { ascending: true });
      if (wid) q = q.or(`and(from_user.eq.${uid},to_user.eq.${wid}),and(from_user.eq.${wid},to_user.eq.${uid})`);
      else q = q.or(`from_user.eq.${uid},to_user.eq.${uid}`);
      const { data, error } = await q;
      if (error) throw error;
      if (wid) {
        await supabase.from('messages').update({ read: true })
          .eq('to_user', uid).eq('from_user', wid).eq('read', false);
      }
      return await Promise.all((data || []).map(enrichMessage));
    }
    if (rawPath === '/chat/messages' && method === 'POST') return await sendMessage(body);

    throw new Error(`Ruta no soportada: ${method} ${rawPath}`);
  } catch (error) {
    throw wrapError(error);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  Realtime shim: misma interfaz que socket.io (connect/disconnect/on/off)
//  pero por debajo usa Supabase Realtime. Emite TASK_CREATED/UPDATED/DELETED
//  y MESSAGE_ADDED, ya enriquecidos como los esperaban los dashboards/chat.
// ══════════════════════════════════════════════════════════════════════════
const listeners = {
  TASK_CREATED: new Set(),
  TASK_UPDATED: new Set(),
  TASK_DELETED: new Set(),
  MESSAGE_ADDED: new Set(),
};
let channel = null;

function emit(event, payload) {
  for (const cb of listeners[event] || []) {
    try { cb(payload); } catch (e) { console.error('[realtime]', e); }
  }
}

async function enrichedTaskById(id) {
  const { data } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle();
  return data;
}

export const socket = {
  connect() {
    if (channel) return;
    channel = supabase
      .channel('mg-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' },
        async ({ new: row }) => emit('TASK_CREATED', (await enrichedTaskById(row.id)) || row))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' },
        async ({ new: row }) => emit('TASK_UPDATED', (await enrichedTaskById(row.id)) || row))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' },
        ({ old: row }) => emit('TASK_DELETED', { id: row.id }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        async ({ new: row }) => emit('MESSAGE_ADDED', await enrichMessage(row)))
      .subscribe();
  },
  disconnect() {
    if (channel) { supabase.removeChannel(channel); channel = null; }
  },
  on(event, cb) { (listeners[event] = listeners[event] || new Set()).add(cb); },
  off(event, cb) { listeners[event]?.delete(cb); },
};
