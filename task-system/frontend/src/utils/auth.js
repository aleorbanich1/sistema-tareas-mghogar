import { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

export const AuthContext = createContext(null);

export function getAuthFromStorage() {
  try {
    const token = localStorage.getItem('mg_token');
    const user = JSON.parse(localStorage.getItem('mg_user') || 'null');
    return { token, user, isAuthenticated: !!token && !!user };
  } catch {
    return { token: null, user: null, isAuthenticated: false };
  }
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthActions() {
  const { setAuth } = useContext(AuthContext);

  const login = useCallback((token, user) => {
    localStorage.setItem('mg_token', token);
    localStorage.setItem('mg_user', JSON.stringify(user));
    // Reaparece el aviso de permisos de notificación en cada inicio de sesión.
    sessionStorage.removeItem('mg_notif_gate_seen');
    setAuth({ token, user, isAuthenticated: true });
  }, [setAuth]);

  // Actualiza el usuario guardado (ej: cambió de rol al transferir la jefatura)
  // sin cerrar sesión, para que las rutas y los dashboards reaccionen al toque.
  const updateUser = useCallback((patch) => {
    let current = {};
    try { current = JSON.parse(localStorage.getItem('mg_user') || '{}'); } catch {}
    const user = { ...current, ...patch };
    localStorage.setItem('mg_user', JSON.stringify(user));
    setAuth(prev => ({ ...prev, user }));
  }, [setAuth]);

  const logout = useCallback(() => {
    supabase.auth.signOut().catch(() => {});
    localStorage.clear();
    setAuth({ token: null, user: null, isAuthenticated: false });
  }, [setAuth]);

  return { login, logout, updateUser };
}
