import { DB } from './db';
import { request, socket } from './transport';

// Re-exportamos el shim de realtime con la MISMA interfaz que socket.io,
// para que App.jsx / dashboards / ChatPanel no cambien.
export { socket };

const MUTATIONS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// ── Offline op parsing ──────────────────────────────────────────────────────
// Translate an HTTP request against /tasks into the local-cache effect it has.
// Returns null for non-task paths.
function parseTaskOp(path, method, body) {
  const clean = path.split('?')[0];
  if (method === 'POST' && (clean === '/tasks' || clean === '/tasks/self')) {
    return { kind: 'create' };
  }
  if (clean.startsWith('/tasks/')) {
    const [rawId, action] = clean.slice('/tasks/'.length).split('/');
    // Server task ids are numeric; offline-created ids are uuid strings.
    const id = /^\d+$/.test(rawId) ? Number(rawId) : rawId;
    if (method === 'DELETE') return { kind: 'delete', id };
    if (method === 'PATCH') {
      if (action === 'complete') return { kind: 'update', id, patch: { status: 'done' } };
      if (action === 'fail') return { kind: 'update', id, patch: { status: 'failed', fail_reason: body?.reason } };
      if (action === 'info-needed') return { kind: 'update', id, patch: { status: 'info_needed' } };
      return { kind: 'update', id, patch: body || {} }; // plain edit
    }
  }
  return null;
}

// Apply a task op to the local cache (optimistic / before network).
async function applyTaskOpLocal(op, body, uuid) {
  if (op.kind === 'create') {
    await DB.upsertTask({ ...body, id: uuid, uuid, status: 'pending', _pendingSync: true });
  } else if (op.kind === 'update') {
    // Match the existing cached task by id only — never clobber its real uuid.
    await DB.upsertTask({ id: op.id, ...op.patch, _pendingSync: true });
  } else if (op.kind === 'delete') {
    await DB.removeTask(op.id);
  }
}

// Reconcile the server response of a task op into the local cache.
async function reconcileTaskOp(op, serverData) {
  if (!serverData || typeof serverData !== 'object') return;
  if (op.kind === 'create' || op.kind === 'update') {
    if (serverData.id) await DB.upsertTask({ ...serverData, _pendingSync: false });
  } else if (op.kind === 'delete') {
    await DB.removeTask(op.id);
  }
}

// Merge a server task list into the local cache without losing pending writes.
async function mergeServerTasks(serverTasks, isFullList) {
  const cache = await DB.getTasks();
  const pending = cache.filter(t => t._pendingSync);

  if (isFullList) {
    // Authoritative snapshot: trust the server, but re-attach writes not yet synced.
    const result = serverTasks.map(t => ({ ...t, _pendingSync: false }));
    for (const p of pending) {
      if (!result.some(t => (p.uuid && t.uuid === p.uuid) || t.id === p.id)) result.push(p);
    }
    await DB.saveTasks(result);
    return result;
  }

  // Filtered query: upsert returned rows, keep everything else (incl. other statuses).
  const merged = [...cache];
  for (const st of serverTasks) {
    const idx = merged.findIndex(t => (st.uuid && t.uuid === st.uuid) || t.id === st.id);
    if (idx >= 0) merged[idx] = { ...merged[idx], ...st, _pendingSync: false };
    else merged.push({ ...st, _pendingSync: false });
  }
  await DB.saveTasks(merged);
  return merged;
}

function isFullTaskList(path) {
  const qs = path.split('?')[1] || '';
  const params = new URLSearchParams(qs);
  return !params.get('status') && !params.get('priority') && !params.get('assigned_to') && params.get('history') !== 'true';
}

// Filter cached tasks to match the request's query params, so offline reads and
// filtered views behave like the server (which filters server-side).
function filterTasksForQuery(tasks, path) {
  const params = new URLSearchParams(path.split('?')[1] || '');
  const status = params.get('status');
  const priority = params.get('priority');
  const assignedTo = params.get('assigned_to');
  const history = params.get('history') === 'true';
  return tasks.filter(t => {
    if (history) return t.status === 'done' || t.status === 'failed';
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (assignedTo && Number(t.assigned_to) !== Number(assignedTo)) return false;
    return true;
  });
}

export async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const isTasks = path.startsWith('/tasks');
  const isMessages = path.startsWith('/chat/messages');

  // ── GET: stale-while-revalidate, never clobber pending writes ──────────────
  if (method === 'GET') {
    // Push any queued writes before reading so the server snapshot is current.
    if (navigator.onLine) await flushSyncQueue();

    if (!navigator.onLine) {
      if (isTasks) return filterTasksForQuery(await DB.getTasks(), path);
      if (isMessages) return await DB.getMessages();
    }

    try {
      const data = await request(path, 'GET');

      if (isTasks && Array.isArray(data)) {
        const merged = await mergeServerTasks(data, isFullTaskList(path));
        return filterTasksForQuery(merged, path);
      }
      if (isMessages && Array.isArray(data)) {
        await DB.saveMessages(data);
        return data;
      }
      return data;
    } catch (err) {
      if (isTasks) return filterTasksForQuery(await DB.getTasks(), path);
      if (isMessages) return await DB.getMessages();
      throw err;
    }
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  const opUuid = DB.generateUUID();
  const taskOp = isTasks ? parseTaskOp(path, method, opts.body) : null;

  // Deleting a task whose CREATE is still queued (never reached the server):
  // just cancel the queued create.
  if (taskOp?.kind === 'delete') {
    const queue = await DB.getSyncQueue();
    const pendingCreate = queue.find(o =>
      o.uuid === taskOp.id && o.method === 'POST' &&
      ['/tasks', '/tasks/self'].includes(o.path.split('?')[0]));
    if (pendingCreate) {
      await DB.dequeueSync(pendingCreate.uuid);
      await DB.removeTask(taskOp.id);
      return { __queued: true, offline: true, cancelled: true };
    }
  }

  // Editing a task whose CREATE is still queued: fold the changes into the
  // queued create body.
  if (taskOp?.kind === 'update') {
    const queue = await DB.getSyncQueue();
    const pendingCreate = queue.find(o =>
      o.uuid === taskOp.id && o.method === 'POST' &&
      ['/tasks', '/tasks/self'].includes(o.path.split('?')[0]));
    if (pendingCreate) {
      pendingCreate.body = { ...pendingCreate.body, ...taskOp.patch };
      await DB.dequeueSync(pendingCreate.uuid);
      await DB.enqueueSync(pendingCreate);
      await applyTaskOpLocal(taskOp, opts.body, opUuid);
      return { __queued: true, offline: true, merged: true };
    }
  }

  // Tie the create body to its uuid so writes can de-duplicate replays.
  if (taskOp?.kind === 'create' && opts.body) opts.body.uuid = opUuid;

  // Optimistic local write (applies whether we end up online or offline).
  if (taskOp) {
    await applyTaskOpLocal(taskOp, opts.body, opUuid);
  } else if (isMessages && method === 'POST' && opts.body) {
    opts.body.uuid = opUuid;
    const meUser = JSON.parse(localStorage.getItem('mg_user') || '{}');
    await DB.upsertMessage({ ...opts.body, id: opUuid, created_at: new Date().toISOString(), from_user: meUser.id, uuid: opUuid });
  }

  try {
    const data = await request(path, method, opts.body);

    if (taskOp) await reconcileTaskOp(taskOp, data);
    else if (isMessages) await DB.upsertMessage(data);

    flushSyncQueue();
    return data;
  } catch (err) {
    const isNetwork = err.isNetwork || err instanceof TypeError || !navigator.onLine;
    if (isNetwork && MUTATIONS.includes(method)) {
      await DB.enqueueSync({ path, method, body: opts.body || null, uuid: opUuid });
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.sync.register('sync-mutations');
        } catch (e) {
          console.warn('Background sync not supported', e);
        }
      }
      return { __queued: true, offline: true, uuid: opUuid };
    }
    throw err;
  }
}

let flushing = false;
export async function flushSyncQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const queue = await DB.getSyncQueue();
    for (const op of queue) {
      try {
        const data = await request(op.path, op.method, op.body);

        const taskOp = op.path.startsWith('/tasks') ? parseTaskOp(op.path, op.method, op.body) : null;
        if (taskOp) await reconcileTaskOp(taskOp, data);
        else if (op.path.startsWith('/chat') && data) await DB.upsertMessage(data);
        await DB.dequeueSync(op.uuid);
      } catch (err) {
        if (err.isNetwork) break;          // sin red: reintentar al volver online
        await DB.dequeueSync(op.uuid);     // error permanente (validación/RLS): descartar
      }
    }
  } finally {
    flushing = false;
  }
}

// Auto-flush when returning online
if (typeof window !== 'undefined') {
  window.addEventListener('online', flushSyncQueue);
}
