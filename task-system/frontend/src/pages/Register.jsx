import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { UserPlus, AlertCircle, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../utils/supabaseClient';
import { emailFor } from '../utils/userEmail';
import { useAuthActions } from '../utils/auth';

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuthActions();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const uname = username.trim();
      const email = emailFor(uname);

      // 1) Crear el usuario en Supabase Auth (queda logueado si "Confirm email" está OFF).
      const { data: signUpData, error: signErr } = await supabase.auth.signUp({ email, password });
      if (signErr) {
        if (/already|registered|exists/i.test(signErr.message)) throw new Error('El usuario ya existe');
        throw new Error(signErr.message);
      }

      // Asegurar sesión activa (necesaria para que RLS permita crear el perfil).
      let session = signUpData.session;
      if (!session) {
        const { data: s, error: sErr } = await supabase.auth.signInWithPassword({ email, password });
        if (sErr) throw new Error('Cuenta creada pero falta confirmación de email. Desactivá "Confirm email" en Supabase.');
        session = s.session;
      }

      // 2) Crear la fila de perfil (rol empleado forzado, igual que antes).
      const { data: profile, error: pErr } = await supabase
        .from('users')
        .insert({ username: uname, full_name: fullName.trim(), role: 'empleado', auth_id: session.user.id })
        .select('id, username, full_name, role')
        .single();
      if (pErr) throw new Error('No se pudo crear el perfil: ' + pErr.message);

      // 3) Iniciar sesión automáticamente.
      login(session.access_token, profile);
      navigate(`/${profile.role}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
          Registrá un nuevo usuario en el sistema
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
          {loading ? 'Registrando...' : 'Registrar'}
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
