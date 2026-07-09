// EscalationNotifications — Banner PERMANENTE de las notificaciones que manda
// Manychat (conversación que necesita intervención humana). NO es una tarea:
// aparece fijo hasta que un destinatario toca "Resolver", y ahí desaparece para
// TODOS (la resolución es compartida). Se muestra a cualquier usuario que sea
// destinatario según el ruteo del jefe, tenga la web en Netlify o en local.
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { playChime } from '../utils/notifications';
import { AlertTriangle, Phone, Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function currentUser() {
  try { return JSON.parse(localStorage.getItem('mg_user') || '{}'); }
  catch { return {}; }
}

export function EscalationNotifications() {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const myId = currentUser().id;

  // Tope de columnas por ancho de pantalla (para que en celular no queden 5
  // columnas ilegibles). En desktop el máximo es 5.
  const [maxCols, setMaxCols] = useState(5);
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setMaxCols(w < 500 ? 1 : w < 768 ? 2 : w < 1024 ? 3 : 5);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  // IDs ya vistos, para sonar solo cuando llega una NUEVA (no en la carga inicial
  // ni cuando se resuelve una). null = todavía no cargamos por primera vez.
  const seenIdsRef = useRef(null);

  // Trae mis notificaciones activas (a través de la tabla de destinatarios).
  const load = useCallback(async () => {
    if (!myId) return;
    const { data, error } = await supabase
      .from('notification_recipients')
      .select('notification:notifications(id,cliente_nombre,cliente_telefono,mensaje_cliente,motivo,created_at,resolved_at)')
      .eq('user_id', myId);
    if (error) { console.error('[escalation] load', error.message); return; }
    const active = (data || [])
      .map(r => r.notification)
      .filter(n => n && !n.resolved_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // ¿Hay alguna que no habíamos visto? → sonido + vibración (salvo primera carga).
    if (seenIdsRef.current && active.some(n => !seenIdsRef.current.has(n.id))) {
      playChime();
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* noop */ }
    }
    seenIdsRef.current = new Set(active.map(n => n.id));
    setItems(active);
  }, [myId]);

  useEffect(() => {
    if (!myId) return;
    load();
    // Realtime: llega una nueva para mí (INSERT en recipients) o alguien resolvió
    // una (UPDATE en notifications). En cualquier caso, recargamos mi lista.
    const ch = supabase
      .channel('escalation-notifs')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_recipients', filter: `user_id=eq.${myId}` },
        load)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myId, load]);

  const resolve = async (id) => {
    setBusyId(id);
    setItems(prev => prev.filter(n => n.id !== id)); // optimista
    const { error } = await supabase
      .from('notifications')
      .update({ resolved_at: new Date().toISOString(), resolved_by: myId })
      .eq('id', id);
    if (error) { console.error('[escalation] resolve', error.message); load(); }
    setBusyId(null);
  };

  if (!items.length) return null;

  // Columnas = min(cantidad, tope por ancho). 1→100%, 2→50%… 5→20%, y wrap.
  const cols = Math.min(items.length, maxCols);

  return (
    <div
      className="w-full grid gap-2 mb-4"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      <AnimatePresence initial={false}>
        {items.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="flex flex-col rounded-2xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 shadow-lg shadow-amber-900/10 p-3"
          >
            <div className="flex items-start gap-2">
              <div className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Intervención
                  </span>
                  {n.motivo && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 truncate max-w-full">
                      {n.motivo}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {n.cliente_nombre || 'Cliente sin nombre'}
                </p>
                {n.cliente_telefono && (
                  <a
                    href={`https://wa.me/${String(n.cliente_telefono).replace(/[^\d]/g, '')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline truncate max-w-full"
                  >
                    <Phone size={11} className="shrink-0" /> {n.cliente_telefono}
                  </a>
                )}
              </div>
            </div>
            {n.mensaje_cliente && (
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                “{n.mensaje_cliente}”
              </p>
            )}
            <button
              onClick={() => resolve(n.id)}
              disabled={busyId === n.id}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 min-h-[38px] rounded-lg bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {busyId === n.id
                ? <Loader2 size={15} className="animate-spin" />
                : <Check size={15} />}
              Resolver
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
