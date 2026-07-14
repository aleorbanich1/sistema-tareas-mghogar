import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { supabase } from '../utils/supabaseClient';
import { AlertTriangle, Loader2, Crown } from 'lucide-react';

// Transferencia irreversible del rol de Jefe.
// Va directo a la RPC (no por api()) a propósito: api() encola las mutaciones
// que fallan por red y las reintenta sola, y una acción irreversible no se
// reintenta a ciegas. El servidor vuelve a validar todo (ver 0007_transfer_jefe.sql).
export function TransferJefeModal({ isOpen, onClose, me, onTransferred }) {
  const [candidates, setCandidates] = useState([]);
  const [targetId, setTargetId] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTargetId('');
    setConfirmation('');
    setError('');
    setLoading(true);
    supabase
      .from('users')
      .select('id,username,full_name,role')
      .neq('role', 'jefe')
      .order('full_name')
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setCandidates((data || []).filter(u => Number(u.id) !== Number(me?.id)));
      })
      .finally(() => setLoading(false));
  }, [isOpen, me?.id]);

  const target = candidates.find(u => String(u.id) === String(targetId));
  const nameMatches = !!target &&
    confirmation.trim().toLowerCase() === target.full_name.trim().toLowerCase();

  const transfer = async () => {
    if (!target || !nameMatches || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { error: err } = await supabase.rpc('transfer_jefe_role', {
        p_target_id: Number(target.id),
        p_confirmation: confirmation.trim(),
      });
      if (err) throw err;
      onTransferred(target);
    } catch (err) {
      setError(err.message || 'No se pudo transferir la jefatura');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transferir jefatura">
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 p-4 rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-900/50">
          <AlertTriangle size={20} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div className="text-sm text-red-700 dark:text-red-300">
            <p className="font-semibold">Esto no se puede deshacer.</p>
            <p className="mt-1">
              La persona que elijas pasa a ser <strong>Jefe</strong> y vos quedás como{' '}
              <strong>empleado</strong>. Vas a perder el acceso al panel de jefe y solo el
              nuevo jefe va a poder volver a transferirlo.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nuevo jefe</label>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 size={16} className="animate-spin" /> Cargando usuarios…
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-slate-500">No hay a quién transferirle la jefatura.</p>
          ) : (
            <Select value={targetId} onChange={e => { setTargetId(e.target.value); setConfirmation(''); }}>
              <option value="">Elegí a quién</option>
              {candidates.map(u => (
                <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>
              ))}
            </Select>
          )}
        </div>

        {target && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Para confirmar, escribí <span className="font-mono text-red-600 dark:text-red-400">{target.full_name}</span>
            </label>
            <Input
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              placeholder={target.full_name}
              autoComplete="off"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex gap-3 mt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="danger" className="flex-1" onClick={transfer} disabled={!nameMatches || submitting}>
            {submitting
              ? (<><Loader2 size={16} className="animate-spin mr-1" /> Transfiriendo…</>)
              : (<><Crown size={16} className="mr-1" /> Transferir</>)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
