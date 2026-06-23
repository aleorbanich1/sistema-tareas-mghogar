import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Home, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../utils/supabaseClient';
import { emailFor } from '../utils/userEmail';
import { useAuthActions } from '../utils/auth';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthActions();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const email = emailFor(username.trim());
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw new Error('Usuario o contraseña incorrectos');

      const { data: profile, error: pErr } = await supabase
        .from('users').select('id, username, full_name, role')
        .eq('auth_id', data.user.id).single();
      if (pErr || !profile) throw new Error('No se encontró el perfil del usuario');

      login(data.session.access_token, profile);
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
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 mb-6 shadow-sm overflow-hidden p-2">
          <img src="/logo.png" alt="MG Hogar Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mb-2">
          MG Hogar
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Sistema de Tareas
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
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1" htmlFor="username">
            Usuario
          </label>
          <Input 
            id="username" 
            type="text" 
            placeholder="ej: ale" 
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
            autoComplete="current-password" 
            required 
            disabled={loading}
          />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? 'Ingresando...' : 'Ingresar'}
        </Button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          ¿No tenés cuenta?{' '}
          <Link 
            to="/register" 
            className="font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
          >
            Registrate acá
          </Link>
        </p>
      </div>
    </div>
  );
}
