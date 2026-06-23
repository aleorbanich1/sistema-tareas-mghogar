const db = require('../db');
const { z } = require('zod');

// ── Schemas ───────────────────────────────────────────────────────────────────

const createTaskSchema = z.object({
  title:       z.string().min(1, 'Título requerido').max(200),
  description: z.string().optional().default(''),
  motivation:  z.string().optional().default(''),
  priority:    z.enum(['P1', 'P2', 'P3', 'P4']).default('P3'),
  due_date:            z.string().optional().default(''),
  recurrence_interval: z.number().int().positive().optional().nullable(),
  recurrence_days:     z.string().optional().nullable(),
  recurrence_time:     z.string().optional().nullable(),
  reminder_hours:      z.number().int().positive().optional().nullable(),
  assigned_to:         z.number().int().positive().optional().nullable(),
  uuid:                z.string().optional().nullable(),
});

const updateTaskSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  motivation:  z.string().optional(),
  priority:    z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  due_date:            z.string().optional(),
  recurrence_interval: z.number().int().positive().optional().nullable(),
  recurrence_days:     z.string().optional().nullable(),
  recurrence_time:     z.string().optional().nullable(),
  reminder_hours:      z.number().int().positive().optional().nullable(),
  assigned_to:         z.number().int().positive().nullable().optional(),
  status:      z.enum(['pending', 'done', 'failed', 'info_needed']).optional(),
  fail_reason: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUser(id) {
  const { data } = await db.from('users').select('id, username, full_name').eq('id', id).single();
  return data;
}

async function enrichTask(task) {
  if (!task) return null;
  const assignee = task.assigned_to ? await getUser(task.assigned_to) : null;
  const creator = task.created_by ? await getUser(task.created_by) : null;
  return {
    ...task,
    assignee,
    creator,
  };
}

// ── Recurrence Helpers ────────────────────────────────────────────────────────

function findNextRecurrenceDate(baseDateStr, dayNumbers) {
  const base = new Date(baseDateStr + 'T12:00:00');
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(base);
    candidate.setDate(candidate.getDate() + offset);
    const dow = candidate.getDay();
    if (dayNumbers.includes(dow)) {
      const yyyy = candidate.getFullYear();
      const mm = String(candidate.getMonth() + 1).padStart(2, '0');
      const dd = String(candidate.getDate()).padStart(2, '0');
      return { nextDate: `${yyyy}-${mm}-${dd}`, dayUsed: dow };
    }
  }
  return null;
}

async function generateNextRecurringTask(task, io) {
  if (!task.recurrence_days) return null;

  const days = task.recurrence_days.split(',').map(Number).filter(n => !isNaN(n));
  if (days.length === 0) return null;

  const baseDate = task.due_date || new Date().toISOString().slice(0, 10);
  const result = findNextRecurrenceDate(baseDate, days);
  if (!result) return null;

  const { nextDate, dayUsed } = result;
  const primaryDay = task.primary_recurrence_day;

  let newDays = [...days];
  if (primaryDay !== null && primaryDay !== undefined && dayUsed !== primaryDay) {
    newDays = newDays.filter(d => d !== dayUsed);
  }
  if (primaryDay !== null && primaryDay !== undefined && !newDays.includes(primaryDay)) {
    newDays.push(primaryDay);
  }

  const newRecurrenceDays = newDays.length > 0 ? newDays.join(',') : null;

  try {
    const { data: newTask, error } = await db.from('tasks').insert([{
      title: task.title,
      description: task.description || '',
      motivation: task.motivation || '',
      priority: task.priority,
      due_date: nextDate,
      recurrence_interval: task.recurrence_interval || null,
      recurrence_days: newRecurrenceDays,
      recurrence_time: task.recurrence_time || null,
      reminder_hours: task.reminder_hours || null,
      assigned_to: task.assigned_to || null,
      created_by: task.created_by,
      primary_recurrence_day: primaryDay
    }]).select().single();

    if (error) throw error;

    const enriched = await enrichTask(newTask);
    if (io) io.emit('TASK_CREATED', enriched);
    return enriched;
  } catch (e) {
    console.error('[generateNextRecurringTask]', e.message);
    return null;
  }
}

// ── Controllers ───────────────────────────────────────────────────────────────

async function listTasks(req, res) {
  const { status, priority, assigned_to, history } = req.query;

  try {
    let query = db.from('tasks').select('*');

    if (req.user.role === 'empleado') {
      query = query.eq('assigned_to', req.user.id);
    } else if (assigned_to) {
      query = query.eq('assigned_to', Number(assigned_to));
    }

    if (history === 'true') {
      query = query.in('status', ['done', 'failed']).order('updated_at', { ascending: false });
    } else {
      if (status) {
        query = query.eq('status', status);
      }
      if (priority) {
        query = query.eq('priority', priority);
      }
      // P1 < P2 < P3 < P4 alphabetically
      query = query.order('priority', { ascending: true }).order('due_date', { ascending: true });
    }

    const { data, error } = await query;
    if (error) throw error;

    const tasks = await Promise.all((data || []).map(enrichTask));
    return res.json(tasks);
  } catch (e) {
    console.error('[listTasks]', e.message);
    return res.status(500).json({ error: 'Error interno' });
  }
}

async function getTask(req, res) {
  const { data: task, error } = await db.from('tasks').select('*').eq('id', req.params.id).single();
  if (error || !task) return res.status(404).json({ error: 'Tarea no encontrada' });

  if (req.user.role === 'empleado' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta tarea' });
  }
  return res.json(await enrichTask(task));
}

async function createTask(req, res) {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }

  const { title, description, motivation, priority, due_date, recurrence_interval, recurrence_days, recurrence_time, reminder_hours, assigned_to, uuid } = parsed.data;

  try {
    if (uuid) {
      const { data: existing } = await db.from('tasks').select('*').eq('uuid', uuid).maybeSingle();
      if (existing) return res.status(200).json(await enrichTask(existing));
    }

    if (assigned_to) {
      const { data: assignee } = await db.from('users').select('id').eq('id', assigned_to).single();
      if (!assignee) return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    let primary_recurrence_day = null;
    if (due_date && recurrence_days) {
      const d = new Date(due_date + 'T12:00:00');
      primary_recurrence_day = d.getDay();
    }

    const { data: result, error } = await db.from('tasks').insert([{
      title, description, motivation, priority,
      due_date: due_date || null,
      recurrence_interval: recurrence_interval || null,
      recurrence_days: recurrence_days || null,
      recurrence_time: recurrence_time || null,
      reminder_hours: reminder_hours || null,
      assigned_to: assigned_to || null,
      created_by: req.user.id,
      uuid: uuid || null,
      primary_recurrence_day
    }]).select().single();

    if (error) throw error;

    const enriched = await enrichTask(result);
    if (req.io) req.io.emit('TASK_CREATED', enriched);
    return res.status(201).json(enriched);
  } catch (e) {
    console.error('[createTask]', e.message);
    return res.status(500).json({ error: 'Error al crear tarea' });
  }
}

async function updateTask(req, res) {
  const { data: task, error: fetchErr } = await db.from('tasks').select('*').eq('id', req.params.id).single();
  if (fetchErr || !task) return res.status(404).json({ error: 'Tarea no encontrada' });

  if (req.user.role === 'empleado' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta tarea' });
  }

  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }

  const data = { ...parsed.data };

  // Permite que los empleados reasignen tareas o que cualquier rol pueda asignar.
  if (data.assigned_to) {
    const { data: assignee } = await db.from('users').select('id').eq('id', data.assigned_to).single();
    if (!assignee) return res.status(400).json({ error: 'Usuario no encontrado' });
  }

  if (Object.keys(data).length === 0) return res.json(await enrichTask(task));

  try {
    const { data: updatedTask, error } = await db.from('tasks').update(data).eq('id', task.id).select().single();
    if (error) throw error;

    const enriched = await enrichTask(updatedTask);
    if (req.io) req.io.emit('TASK_UPDATED', enriched);
    return res.json(enriched);
  } catch (e) {
    console.error('[updateTask]', e.message);
    return res.status(500).json({ error: 'Error al actualizar tarea' });
  }
}

async function completeTask(req, res) {
  const { data: task, error: fetchErr } = await db.from('tasks').select('*').eq('id', req.params.id).single();
  if (fetchErr || !task) return res.status(404).json({ error: 'Tarea no encontrada' });

  if (req.user.role === 'empleado' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta tarea' });
  }

  try {
    const { data: updatedTask, error } = await db.from('tasks').update({ status: 'done' }).eq('id', task.id).select().single();
    if (error) throw error;

    const enriched = await enrichTask(updatedTask);
    if (req.io) req.io.emit('TASK_UPDATED', enriched);

    await generateNextRecurringTask(task, req.io);

    return res.json(enriched);
  } catch (e) {
    console.error('[completeTask]', e.message);
    return res.status(500).json({ error: 'Error al completar tarea' });
  }
}

async function failTask(req, res) {
  const { data: task, error: fetchErr } = await db.from('tasks').select('*').eq('id', req.params.id).single();
  if (fetchErr || !task) return res.status(404).json({ error: 'Tarea no encontrada' });

  if (req.user.role === 'empleado' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta tarea' });
  }

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Razón requerida' });
  }

  try {
    const { data: updatedTask, error } = await db.from('tasks').update({ status: 'failed', fail_reason: reason.trim() }).eq('id', task.id).select().single();
    if (error) throw error;

    const enriched = await enrichTask(updatedTask);
    if (req.io) req.io.emit('TASK_UPDATED', enriched);
    return res.json(enriched);
  } catch (e) {
    console.error('[failTask]', e.message);
    return res.status(500).json({ error: 'Error al fallar tarea' });
  }
}

async function markInfoNeeded(req, res) {
  const { data: task, error: fetchErr } = await db.from('tasks').select('*').eq('id', req.params.id).single();
  if (fetchErr || !task) return res.status(404).json({ error: 'Tarea no encontrada' });

  if (req.user.role === 'empleado' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta tarea' });
  }

  try {
    const { data: updatedTask, error } = await db.from('tasks').update({ status: 'info_needed' }).eq('id', task.id).select().single();
    if (error) throw error;

    const enriched = await enrichTask(updatedTask);
    if (req.io) req.io.emit('TASK_UPDATED', enriched);
    return res.json(enriched);
  } catch (e) {
    console.error('[markInfoNeeded]', e.message);
    return res.status(500).json({ error: 'Error al marcar tarea' });
  }
}

async function deleteTask(req, res) {
  const { data: task, error: fetchErr } = await db.from('tasks').select('id, assigned_to').eq('id', req.params.id).single();
  if (fetchErr || !task) return res.status(404).json({ error: 'Tarea no encontrada' });

  if (req.user.role === 'empleado' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Sin acceso a esta tarea' });
  }

  try {
    const { error } = await db.from('tasks').delete().eq('id', task.id);
    if (error) throw error;

    if (req.io) req.io.emit('TASK_DELETED', { id: task.id });
    return res.json({ message: 'Tarea eliminada' });
  } catch (e) {
    console.error('[deleteTask]', e.message);
    return res.status(500).json({ error: 'Error al eliminar tarea' });
  }
}

async function createSelfTask(req, res) {
  const selfSchema = createTaskSchema.omit({ assigned_to: true });
  const parsed = selfSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }

  const { title, description, motivation, priority, due_date, recurrence_interval, recurrence_days, recurrence_time, reminder_hours, uuid } = parsed.data;

  try {
    if (uuid) {
      const { data: existing } = await db.from('tasks').select('*').eq('uuid', uuid).maybeSingle();
      if (existing) return res.status(200).json(await enrichTask(existing));
    }

    let primary_recurrence_day = null;
    if (due_date && recurrence_days) {
      const d = new Date(due_date + 'T12:00:00');
      primary_recurrence_day = d.getDay();
    }

    const { data: result, error } = await db.from('tasks').insert([{
      title, description, motivation, priority,
      due_date: due_date || null,
      recurrence_interval: recurrence_interval || null,
      recurrence_days: recurrence_days || null,
      recurrence_time: recurrence_time || null,
      reminder_hours: reminder_hours || null,
      assigned_to: req.user.id,
      created_by: req.user.id,
      uuid: uuid || null,
      primary_recurrence_day
    }]).select().single();

    if (error) throw error;

    const enriched = await enrichTask(result);
    if (req.io) req.io.emit('TASK_CREATED', enriched);
    return res.status(201).json(enriched);
  } catch (e) {
    console.error('[createSelfTask]', e.message);
    return res.status(500).json({ error: 'Error al crear tarea' });
  }
}

module.exports = {
  listTasks, getTask, createTask, createSelfTask, updateTask,
  completeTask, failTask, markInfoNeeded, deleteTask,
};
