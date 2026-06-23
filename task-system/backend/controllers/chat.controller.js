const db = require('../db');
const { z } = require('zod');

const messageSchema = z.object({
  content:  z.string().min(1, 'Mensaje vacío').max(2000),
  to_user:  z.number().int().positive(),
  task_ids: z.array(z.number().int().positive()).default([]),
  uuid:     z.string().optional().nullable(),
});

async function enrichMsg(msg) {
  let taskIds = [];
  try {
    if (typeof msg.task_ids === 'string') {
      taskIds = JSON.parse(msg.task_ids);
    } else if (Array.isArray(msg.task_ids)) {
      taskIds = msg.task_ids;
    }
  } catch {}

  let tasks = [];
  if (taskIds && taskIds.length > 0) {
    const { data } = await db.from('tasks').select('id, title, status, priority').in('id', taskIds);
    tasks = data || [];
  }

  // Flatten the user objects to match previous format
  const formattedMsg = {
    ...msg,
    task_ids: taskIds,
    tasks,
    from_username: msg.sender?.username,
    from_full_name: msg.sender?.full_name,
    to_username: msg.receiver?.username,
    to_full_name: msg.receiver?.full_name,
  };
  delete formattedMsg.sender;
  delete formattedMsg.receiver;
  
  return formattedMsg;
}

async function getMessages(req, res) {
  const { with: withUserId } = req.query;

  try {
    let msgs = [];
    if (withUserId) {
      const wid = Number(withUserId);
      const { data, error } = await db.from('messages')
        .select('*, sender:users!messages_from_user_fkey(username, full_name), receiver:users!messages_to_user_fkey(username, full_name)')
        .or(`and(from_user.eq.${req.user.id},to_user.eq.${wid}),and(from_user.eq.${wid},to_user.eq.${req.user.id})`)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      msgs = data || [];

      // Mark messages from other user as read
      await db.from('messages')
        .update({ read: 1 })
        .eq('to_user', req.user.id)
        .eq('from_user', wid);

    } else {
      const { data, error } = await db.from('messages')
        .select('*, sender:users!messages_from_user_fkey(username, full_name), receiver:users!messages_to_user_fkey(username, full_name)')
        .or(`from_user.eq.${req.user.id},to_user.eq.${req.user.id}`)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      msgs = data || [];
    }

    const enriched = await Promise.all(msgs.map(enrichMsg));
    return res.json(enriched);
  } catch (e) {
    console.error('[getMessages]', e.message);
    return res.status(500).json({ error: 'Error al obtener mensajes' });
  }
}

async function sendMessage(req, res) {
  const parsed = messageSchema.safeParse({
    ...req.body,
    task_ids: req.body.task_ids || [],
  });

  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }

  const { content, to_user, task_ids, uuid } = parsed.data;

  try {
    if (uuid) {
      const { data: existing } = await db.from('messages')
        .select('*, sender:users!messages_from_user_fkey(username, full_name), receiver:users!messages_to_user_fkey(username, full_name)')
        .eq('uuid', uuid)
        .single();
        
      if (existing) {
        return res.status(200).json(await enrichMsg(existing));
      }
    }

    const { data: recipient, error: recErr } = await db.from('users').select('id').eq('id', to_user).single();
    if (recErr || !recipient) return res.status(404).json({ error: 'Destinatario no encontrado' });

    if (task_ids.length > 0) {
      const { data: foundTasks } = await db.from('tasks').select('id').in('id', task_ids);
      if (!foundTasks || foundTasks.length !== task_ids.length) {
        return res.status(400).json({ error: 'Una o más tareas no existen' });
      }
    }

    const taskIdsStr = JSON.stringify(task_ids);

    const { data: result, error: insErr } = await db.from('messages')
      .insert([{
        from_user: req.user.id,
        to_user,
        content,
        task_ids: taskIdsStr,
        uuid: uuid || null
      }])
      .select('*, sender:users!messages_from_user_fkey(username, full_name), receiver:users!messages_to_user_fkey(username, full_name)')
      .single();

    if (insErr) throw insErr;

    const enriched = await enrichMsg(result);
    if (req.io) {
      req.io.emit('MESSAGE_ADDED', enriched);
    }

    return res.status(201).json(enriched);
  } catch (e) {
    console.error('[sendMessage]', e.message);
    return res.status(500).json({ error: 'Error al enviar mensaje' });
  }
}

async function getUnread(req, res) {
  try {
    const { count, error } = await db.from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_user', req.user.id)
      .eq('read', 0);
      
    if (error) throw error;
    return res.json({ unread: count || 0 });
  } catch (e) {
    console.error('[getUnread]', e.message);
    return res.status(500).json({ error: 'Error al obtener no leídos' });
  }
}

module.exports = { getMessages, sendMessage, getUnread };
