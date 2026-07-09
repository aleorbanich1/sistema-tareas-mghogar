// NotificationRoutingPanel — Panel del JEFE para elegir QUIÉN recibe las
// notificaciones de Manychat. Es un simple toggle por persona: la que esté
// activada recibe TODAS las notificaciones de escalamiento. Se guarda en
// notification_routes (una fila por persona, enabled true/false).
import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { supabase } from '../utils/supabaseClient';
import { Modal } from './ui/Modal';
import { Loader2 } from 'lucide-react';

export function NotificationRoutingPanel({ isOpen, onClose }) {
  const [people, setPeople] = useState([]);
  const [enabled, setEnabled] = useState({});   // { [userId]: true }
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [users, { data: routes, error: rErr }] = await Promise.all([
        api('/auth/users'),
        supabase.from('notification_routes').select('user_id, enabled'),
      ]);
      if (rErr) throw rErr;
      setPeople(Array.isArray(users) ? users : []);
      const map = {};
      for (const r of routes || []) if (r.enabled) map[r.user_id] = true;
      setEnabled(map);
    } catch (e) {
      console.error('[routing] load', e);
      setError(e.message || 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isOpen) load(); }, [isOpen]);

  const toggle = async (userId) => {
    const next = !enabled[userId];
    setBusyId(userId);
    setEnabled(prev => ({ ...prev, [userId]: next }));   // optimista
    const { error: e } = await supabase
      .from('notification_routes')
      .upsert({ user_id: userId, enabled: next }, { onConflict: 'user_id' });
    if (e) {
      console.error('[routing] toggle', e.message);
      setEnabled(prev => ({ ...prev, [userId]: !next }));  // revertir
      setError(e.message);
    }
    setBusyId(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Notificaciones de Manychat">
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
        Activá quién recibe la notificación cuando el bot escala una conversación.
        La persona activada la ve como un aviso permanente hasta que alguien lo resuelve.
      </p>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-10 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : people.length === 0 ? (
        <p className="text-sm text-center text-slate-400 py-6">No hay personas para mostrar.</p>
      ) : (
        <ul className="space-y-2">
          {people.map(p => {
            const on = !!enabled[p.id];
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {p.full_name || p.username || `#${p.id}`}
                  </p>
                  {p.role && p.role !== 'empleado' && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{p.role}</p>
                  )}
                </div>
                <button
                  onClick={() => toggle(p.id)}
                  disabled={busyId === p.id}
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? 'Desactivar' : 'Activar'} notificaciones para ${p.full_name || p.username}`}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                    on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    on ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
