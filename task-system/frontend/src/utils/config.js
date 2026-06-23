// Configuración Supabase (app directo a Supabase, sin servidor propio).
// Se inyectan en build-time desde frontend/.env:
//   VITE_SUPABASE_URL       -> URL del proyecto
//   VITE_SUPABASE_ANON_KEY  -> anon/public key (segura para el cliente; NUNCA la service_role)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qsewancpibyyakitwpnr.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
