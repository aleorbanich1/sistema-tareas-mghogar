import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { UserPlus, AlertCircle, ArrowLeft, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../utils/supabaseClient';
import { emailFor } from '../utils/userEmail';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const uname = username.trim();
      const email = emailFor(uname);

      // 1) Crear la credencial en Supabase Auth (NO crea perfil todavía).
      const { data: signUpData, error: signErr } = await supabase.auth.signUp({ email, password });
      let session = signUpData?.session || null;
      if (signErr) {
        const msg = signErr.message || '';
        if (/already|registered|exists/i.test(msg)) {
          // Reintento: la credencial ya existe → loguear y reenviar la solicitud.
          const { data: s, error: sErr } = await supabase.auth.signInWithPassword({ email, password });
          if (sErr) throw new Error('El usuario ya existe');
          session = s.session;
        } else if (/password/i.test(msg)) {
          throw new Error('La contraseña debe tener al menos 6 caracteres');
        } else if (/signups? not allowed|disabled/i.test(msg)) {
          throw new Error('El registro está deshabilitado en el servidor. Activá "Allow new users to sign up" en Supabase.');
        } else if (/email/i.test(msg)) {
          throw new Error('El nombre de usuario no es válido (usá solo letras y números).');
        } else {
          throw new Error(msg || 'Error al registrar el usuario');
        }
      }

      // Asegurar sesión activa: submit_registration necesita auth.uid().
      if (!session) {
        const { data: s, error: sErr } = await supabase.auth.signInWithPassword({ email, password });
        if (sErr) throw new Error('Cuenta creada pero falta confirmación de email. Desactivá "Confirm email" en Supabase.');
        session = s.session;
      }

      // 2) Dejar la solicitud PENDIENTE (sin perfil ⇒ sin acceso hasta que el jefe apruebe).
      const { error: rpcErr } = await supabase.rpc('submit_registration', {
        p_full_name: fullName.trim(),
        p_username: uname,
      });
      if (rpcErr) throw new Error(rpcErr.message || 'No se pudo enviar la solicitud');

      // 3) No dejar la sesión abierta: la cuenta todavía no tiene acceso.
      await supabase.auth.signOut();
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
          className="text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 mb-6 shadow-sm">
            <Clock size={32} strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mb-3">
            Solicitud enviada
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8">
            Tu cuenta quedó <span className="font-semibold text-slate-700 dark:text-slate-300">pendiente de aprobación</span>.
            Cuando el jefe la acepte vas a poder iniciar sesión.
          </p>
          <Link to="/">
            <Button className="w-full">Volver al ingreso</Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 mb-6 shadow-sm">
          <UserPlus size={32} strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mb-2">
          Crear cuenta
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Tu cuenta quedará pendiente hasta que el jefe la apruebe
        </p>
      </motion.div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-100 dark:border-red-900/50"
        >
          <AlertCircle size={20} className="shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1" htmlFor="fullName">
            Nombre Completo
          </label>
          <Input 
            id="fullName" 
            type="text" 
            placeholder="ej: Juan Pérez" 
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required 
            disabled={loading}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1" htmlFor="username">
            Usuario
          </label>
          <Input 
            id="username" 
            type="text" 
            placeholder="ej: juanp" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" 
            required 
            disabled={loading}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1" htmlFor="password">
            Contraseña
          </label>
          <Input 
            id="password" 
            type="password" 
            placeholder="••••••••" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" 
            required 
            disabled={loading}
          />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? 'Enviando solicitud...' : 'Solicitar cuenta'}
        </Button>
      </form>

      <div className="mt-8 text-center">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={16} />
          Volver al ingreso
        </Link>
      </div>
    </div>
  );
}
