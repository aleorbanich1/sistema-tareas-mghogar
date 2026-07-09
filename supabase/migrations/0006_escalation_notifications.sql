-- ═══════════════════════════════════════════════════════════════════════════
--  Notificaciones de escalamiento (Manychat → sistema de tareas)
--  Pegar en Supabase → SQL Editor → Run. Idempotente (se puede correr 2 veces).
--
--  ⚠️ SIN RLS: esta app funciona con RLS APAGADO (acceso abierto con la anon key),
--     igual que tasks/messages/users. NO activamos RLS acá para no romper nada.
--     La seguridad del webhook la da el token de la Edge Function, no la base.
--
--  Qué hace:
--   • notifications           → la notificación PERMANENTE (no es una tarea).
--   • notification_recipients → a QUÉ usuarios les llega cada notificación.
--   • notification_routes     → panel del jefe: toggle por persona (recibe sí/no).
--
--  Flujo: Manychat pega a la Edge Function `manychat-notification` (service_role).
--  La función inserta 1 fila en `notifications` y N filas en
--  `notification_recipients`, una por cada persona ACTIVADA en el panel del jefe
--  (notification_routes.enabled = true). El frontend (cualquier rol, en Netlify o
--  local) la lee por Realtime y la muestra hasta que alguien toca "Resolver" →
--  se resuelve para TODOS.
--
--  🔙 ROLLBACK:
--     drop table if exists public.notification_recipients cascade;
--     drop table if exists public.notification_routes     cascade;
--     drop table if exists public.notifications           cascade;
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tabla: notifications ─────────────────────────────────────────────────────
create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  cliente_nombre   text,
  cliente_telefono text,
  mensaje_cliente  text,
  motivo           text,                        -- solo informativo (se muestra en el banner)
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,                 -- null = activa; con fecha = resuelta
  resolved_by      bigint references public.users(id) on delete set null
);

create index if not exists notifications_active_idx
  on public.notifications (created_at desc) where resolved_at is null;

-- ── Tabla: notification_recipients ───────────────────────────────────────────
-- Quién debe VER cada notificación. La resolución es compartida (vive en
-- notifications.resolved_at), así que acá solo guardamos el destino.
create table if not exists public.notification_recipients (
  notification_id uuid   not null references public.notifications(id) on delete cascade,
  user_id         bigint not null references public.users(id)         on delete cascade,
  primary key (notification_id, user_id)
);

create index if not exists notification_recipients_user_idx
  on public.notification_recipients (user_id);

-- ── Tabla: notification_routes (panel del jefe) ──────────────────────────────
-- Una fila por persona. enabled = true → esa persona recibe TODAS las
-- notificaciones de Manychat. El toggle del panel prende/apaga esto.
-- (No hay ruteo por "motivo": el motivo lo genera un bot de IA y es impredecible,
--  así que rutear por él podría hacer que una notificación no le llegue a nadie.)
create table if not exists public.notification_routes (
  user_id    bigint primary key references public.users(id) on delete cascade,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Para que el frontend reciba INSERT/UPDATE en vivo (como tasks/messages).
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notification_recipients;
  exception when duplicate_object then null;
  end;
end $$;

-- ── Limpieza automática: borrar notificaciones de +36 horas ──────────────────
-- Para que la tabla no crezca infinito. Corre CADA HORA (así ninguna pasa mucho
-- de las 36h). El borrado cae en cascada a notification_recipients.
create extension if not exists pg_cron;

select cron.unschedule('cleanup-old-notifications')
where exists (select 1 from cron.job where jobname = 'cleanup-old-notifications');

select cron.schedule(
  'cleanup-old-notifications',
  '0 * * * *',   -- cada hora, en punto
  $$ delete from public.notifications where created_at < now() - interval '36 hours'; $$
);
-- Ver el job:        select * from cron.job where jobname = 'cleanup-old-notifications';
-- Borrar ya a mano:  delete from public.notifications where created_at < now() - interval '36 hours';
