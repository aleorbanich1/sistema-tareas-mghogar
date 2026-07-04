import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { api, socket } from '../utils/api';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { MessageCircle, Send, ArrowLeft, Loader2, X, ChevronDown, Paperclip, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { notify } from '../utils/notifications';

// ── Floating chat bubble + panel ────────────────────────────────────────────
// Both Socio and Empleado dashboards mount this component. It handles:
//   1. Unread badge on a floating button
//   2. Conversation list (all users you can message)
//   3. Individual chat thread with real-time messages

const PANEL_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.92 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 28, stiffness: 340 } },
  exit:    { opacity: 0, y: 24, scale: 0.92, transition: { duration: 0.18 } },
};

// ── Message bubble ──────────────────────────────────────────────────────────
const MsgBubble = memo(({ msg, isMine }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15 }}
    className={cn("flex w-full", isMine ? "justify-end" : "justify-start")}
  >
    <div
      className={cn(
        "max-w-[80%] px-4 py-2.5 text-sm leading-relaxed break-words",
        isMine
          ? "bg-emerald-600 text-white rounded-2xl rounded-br-md"
          : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl rounded-bl-md"
      )}
    >
      {msg.content}
      {/* Linked tasks */}
      {msg.tasks && msg.tasks.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/20 dark:border-slate-700/40 flex flex-col gap-1.5">
          {msg.tasks.map(t => (
            <div
              key={t.id}
              className={cn(
                "text-xs px-3 py-2 rounded-xl font-medium flex flex-col gap-1",
                isMine
                  ? "bg-emerald-700/60 text-emerald-100"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              )}
            >
              <span className="font-bold opacity-80 uppercase text-[9px] tracking-wider">Tarea adjunta</span>
              <span>{t.title}</span>
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "text-[10px] mt-1 tabular-nums",
          isMine ? "text-emerald-200/70" : "text-slate-400 dark:text-slate-500"
        )}
      >
        {formatTime(msg.created_at)}
      </div>
    </div>
  </motion.div>
));

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// ── Main ChatPanel ──────────────────────────────────────────────────────────
export default function ChatPanel() {
  const me = JSON.parse(localStorage.getItem('mg_user') || '{}');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [unreadBy, setUnreadBy] = useState({}); // { [fromUserId]: count }
  const [users, setUsers] = useState([]);
  const [activeChat, setActiveChat] = useState(null); // user object
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Attachment state
  const [activeTasks, setActiveTasks] = useState([]);
  const [attachedTask, setAttachedTask] = useState(null);
  const [showTaskSelector, setShowTaskSelector] = useState(false);

  // ── Load users and unread count ─────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    try {
      const data = await api('/auth/users');
      if (Array.isArray(data)) setUsers(data);
    } catch {}
  }, []);

  const fetchActiveTasks = useCallback(async () => {
    try {
      const data = await api('/tasks?status=pending');
      if (Array.isArray(data)) setActiveTasks(data);
    } catch {}
  }, []);

  // Fuente de verdad de no leídos, agrupados por remitente. Setea el detalle por
  // conversación Y el total. Se usa al entrar (incluso tras estar cerrada la app).
  const fetchUnreadBy = useCallback(async () => {
    try {
      const data = await api('/chat/unread-by-sender');
      if (data && typeof data === 'object') {
        const map = {};
        let total = 0;
        for (const [k, v] of Object.entries(data)) { map[k] = Number(v) || 0; total += map[k]; }
        setUnreadBy(map);
        setUnread(total);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchUnreadBy();
    fetchActiveTasks();
    const iv = setInterval(fetchUnreadBy, 30_000);
    return () => clearInterval(iv);
  }, [fetchUsers, fetchUnreadBy, fetchActiveTasks]);

  // ── Listen to OPEN_CHAT global event ────────────────────────────────────
  useEffect(() => {
    const handleOpenChat = (e) => {
      const { userId, prefilledTask } = e.detail || {};
      setOpen(true);
      if (userId) {
        // Wait for users to load if not already
        setTimeout(() => {
          setUsers(prevUsers => {
            const userToOpen = prevUsers.find(u => Number(u.id) === Number(userId));
            if (userToOpen) {
              setActiveChat(userToOpen);
              setMessages([]);
              setUnreadBy(prev => { const n = { ...prev }; delete n[userToOpen.id]; return n; });
            }
            return prevUsers;
          });
        }, 100);
      }
      if (prefilledTask) {
        setAttachedTask(prefilledTask);
      }
    };
    window.addEventListener('OPEN_CHAT', handleOpenChat);
    return () => window.removeEventListener('OPEN_CHAT', handleOpenChat);
  }, []);

  // ── WebSocket: live messages ────────────────────────────────────────────
  useEffect(() => {
    const onMsg = (msg) => {
      // Belongs to active conversation?
      if (
        activeChat &&
        ((msg.from_user === activeChat.id && msg.to_user === me.id) ||
         (msg.from_user === me.id && msg.to_user === activeChat.id))
      ) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id || (m.uuid && m.uuid === msg.uuid))) return prev;
          return [...prev, msg];
        });
      }
      // Update unread in any case
      if (Number(msg.to_user) === Number(me.id)) {
        const viewingThisChat = open && activeChat && Number(msg.from_user) === Number(activeChat.id);
        if (!viewingThisChat) {
          setUnread(u => u + 1);
          setUnreadBy(prev => ({ ...prev, [msg.from_user]: (prev[msg.from_user] || 0) + 1 }));
          // Notificación específica: de quién es el mensaje nuevo (con sonido + banner).
          const from = msg.from_full_name || msg.from_username || 'Alguien';
          notify(`💬 ${from}`, msg.content || 'Te envió un mensaje', { tag: `msg-${msg.from_user}` });
        }
      }
    };
    socket.on('MESSAGE_ADDED', onMsg);
    return () => socket.off('MESSAGE_ADDED', onMsg);
  }, [activeChat, me.id, open]);

  // ── Load messages for active chat ───────────────────────────────────────
  useEffect(() => {
    if (!activeChat) return;
    let cancelled = false;
    (async () => {
      setLoadingMsgs(true);
      try {
        const data = await api(`/chat/messages?with=${activeChat.id}`);
        if (!cancelled && Array.isArray(data)) setMessages(data);
        // El GET marca como leídos en el servidor; reconciliamos el badge con
        // la verdad del servidor (arregla contadores fantasma que no bajaban).
        if (!cancelled) fetchUnreadBy();
      } catch {}
      if (!cancelled) setLoadingMsgs(false);
    })();
    return () => { cancelled = true; };
  }, [activeChat, fetchUnreadBy]);

  // ── Auto-scroll to bottom ──────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, loadingMsgs]);

  // Focus input when chat opens
  useEffect(() => {
    if (activeChat && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeChat]);

  // ── Send message ───────────────────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !attachedTask) || sending || !activeChat) return;
    setSending(true);
    setText('');
    const tId = attachedTask ? attachedTask.id : null;
    setAttachedTask(null);
    setShowTaskSelector(false);

    try {
      const saved = await api('/chat/messages', {
        method: 'POST',
        body: { content: trimmed || 'Envié una tarea adjunta.', to_user: activeChat.id, task_ids: tId ? [tId] : [] },
      });
      if (saved && !saved.__queued) {
        setMessages(prev => {
          if (prev.some(m => m.id === saved.id || (m.uuid && m.uuid === saved.uuid))) return prev;
          return [...prev, saved];
        });
      }
    } catch (err) {
      console.error('Send message error:', err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Unread reset when viewing a chat ───────────────────────────────────
  useEffect(() => {
    if (open && activeChat) fetchUnreadBy();
  }, [open, activeChat, fetchUnreadBy]);

  const clearUnreadFor = (userId) => {
    setUnreadBy(prev => {
      const cnt = prev[userId] || 0;
      if (!cnt) return prev;
      setUnread(u => Math.max(0, u - cnt));
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const openChat = (user) => {
    setActiveChat(user);
    setMessages([]);
    clearUnreadFor(user.id);
  };

  const backToList = () => {
    setActiveChat(null);
    setMessages([]);
    fetchUnreadBy();
  };

  // ── Group messages by day ──────────────────────────────────────────────
  const groupedMessages = messages.reduce((acc, msg) => {
    const day = new Date(msg.created_at).toDateString();
    if (!acc.length || acc[acc.length - 1].day !== day) {
      acc.push({ day, label: formatDay(msg.created_at), items: [msg] });
    } else {
      acc[acc.length - 1].items.push(msg);
    }
    return acc;
  }, []);

  return (
    <>
      {/* ── Floating Action Button ─────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(o => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-[60] w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-colors",
          open
            ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        )}
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && unread > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-950"
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </motion.button>

      {/* ── Chat Panel ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            variants={PANEL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed bottom-24 right-4 z-[60] w-[calc(100vw-2rem)] max-w-sm h-[480px] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
          >
            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="shrink-0 px-4 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              {activeChat && (
                <button
                  onClick={backToList}
                  className="p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Volver"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
                  {activeChat ? activeChat.full_name : 'Mensajes'}
                </h3>
                {!activeChat && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">Seleccioná una conversación</p>
                )}
              </div>
            </div>

            {/* Aviso: los mensajes son temporales */}
            <div className="shrink-0 px-4 py-1.5 bg-amber-50 dark:bg-amber-900/15 border-b border-amber-100 dark:border-amber-900/30 text-[11px] font-medium text-amber-700 dark:text-amber-400 text-center">
              ⏳ Los mensajes son temporales: se borran a los 7 días.
            </div>

            {/* ── Body: Contact list or Chat thread ────────────────────── */}
            {!activeChat ? (
              /* ── Contact List ──────────────────────────────────────── */
              <div className="flex-1 overflow-y-auto overscroll-contain">
                {users.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-2 p-6">
                    <MessageCircle size={32} strokeWidth={1.5} />
                    <p className="text-sm">No hay contactos disponibles</p>
                  </div>
                ) : (
                  <div className="py-2">
                    {users
                      .filter(u => u.id !== me.id)
                      // Los que tienen mensajes sin leer, primero.
                      .sort((a, b) => (unreadBy[b.id] || 0) - (unreadBy[a.id] || 0))
                      .map(u => {
                        const uUnread = unreadBy[u.id] || 0;
                        return (
                        <button
                          key={u.id}
                          onClick={() => openChat(u)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
                        >
                          {/* Avatar */}
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
                              {(u.full_name || u.username || '?').charAt(0).toUpperCase()}
                            </div>
                            {uUnread > 0 && (
                              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                                {uUnread > 9 ? '9+' : uUnread}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm truncate",
                              uUnread > 0 ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-900 dark:text-slate-100"
                            )}>
                              {u.full_name || u.username}
                            </p>
                            <p className={cn(
                              "text-[11px] capitalize",
                              uUnread > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-400 dark:text-slate-500"
                            )}>
                              {uUnread > 0 ? `${uUnread} mensaje${uUnread > 1 ? 's' : ''} nuevo${uUnread > 1 ? 's' : ''}` : u.role}
                            </p>
                          </div>
                          <ChevronDown size={14} className="text-slate-300 dark:text-slate-600 -rotate-90" />
                        </button>
                        );
                      })}
                  </div>
                )}
              </div>
            ) : (
              /* ── Chat Thread ───────────────────────────────────────── */
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center h-full gap-2 text-slate-400">
                      <Loader2 size={16} className="animate-spin" /> Cargando...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-2">
                      <MessageCircle size={28} strokeWidth={1.5} />
                      <p className="text-xs">No hay mensajes aún. Escribí algo.</p>
                    </div>
                  ) : (
                    groupedMessages.map(group => (
                      <div key={group.day}>
                        {/* Day separator */}
                        <div className="flex items-center gap-3 my-3">
                          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            {group.label}
                          </span>
                          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                        </div>
                        {group.items.map(msg => (
                          <MsgBubble
                            key={msg.id || msg.uuid}
                            msg={msg}
                            isMine={Number(msg.from_user) === Number(me.id)}
                          />
                        ))}
                      </div>
                    ))
                  )}
                </div>

                {/* ── Task Selector Popover ────────────────────────────── */}
                <AnimatePresence>
                  {showTaskSelector && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-16 left-4 right-4 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-20 flex flex-col max-h-48"
                    >
                      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Adjuntar Tarea Activa</span>
                        <button onClick={() => setShowTaskSelector(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                      </div>
                      <div className="overflow-y-auto p-2 flex flex-col gap-1">
                        {activeTasks.length === 0 ? (
                          <div className="text-xs text-slate-400 p-2 text-center">No hay tareas pendientes.</div>
                        ) : (
                          activeTasks.map(t => (
                            <button
                              key={t.id}
                              onClick={() => { setAttachedTask(t); setShowTaskSelector(false); inputRef.current?.focus(); }}
                              className="text-left px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors truncate"
                            >
                              {t.title}
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Input Bar ─────────────────────────────────────────── */}
                <div className="shrink-0 flex flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800">
                  {attachedTask && (
                    <div className="px-3 pt-2 pb-1 flex items-center">
                      <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 px-3 py-1.5 rounded-lg text-xs font-medium max-w-full">
                        <Paperclip size={14} className="shrink-0" />
                        <span className="truncate">{attachedTask.title}</span>
                        <button onClick={() => setAttachedTask(null)} className="ml-1 hover:text-emerald-900 dark:hover:text-emerald-200 shrink-0"><X size={14} /></button>
                      </div>
                    </div>
                  )}
                  <div className="px-3 py-2.5 flex items-center gap-2">
                    <button
                      onClick={() => setShowTaskSelector(!showTaskSelector)}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0",
                        showTaskSelector || attachedTask
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                          : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                      aria-label="Adjuntar tarea"
                    >
                      <Paperclip size={18} />
                    </button>
                    <input
                      ref={inputRef}
                      value={text}
                      onChange={e => setText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Escribí un mensaje..."
                      className="flex-1 min-w-0 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                    />
                    <button
                      onClick={handleSend}
                      disabled={(!text.trim() && !attachedTask) || sending}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0",
                        text.trim() || attachedTask
                          ? "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                      )}
                      aria-label="Enviar mensaje"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
