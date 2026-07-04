-- ═══════════════════════════════════════════════════════════════════════════
--  RLS (Row Level Security) para MG Hogar
--  Pegar en Supabase → SQL Editor → Run. Es idempotente (se puede recorrer 2 veces).
--
--  Modelo de auth: la app usa Supabase Auth. Cada usuario logueado trae auth.uid().
--  La tabla `users` linkea auth.uid() ↔ users.id vía la columna `users.auth_id`.
--  Las tareas/mensajes referencian users.id (assigned_to, created_by, from_user…).
--
--  ⚠️ ANTES DE CORRER: verificá que TODOS los usuarios tengan auth_id, si no
--     quedarían sin acceso a nada:
--         select count(*) from public.users where auth_id is null;   -- debe dar 0
--
--  🔙 ROLLBACK (si algo se rompe, desactivá RLS de la tabla afectada):
--         alter table public.tasks              disable row level security;
--         alter table public.messages           disable row level security;
--         alter table public.users              disable row level security;
--         alter table public.push_subscriptions disable row level security;
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helpers SECURITY DEFINER ────────────────────────────────────────────────
-- Devuelven el id/rol del usuario actual SIN disparar RLS (evita recursión
-- infinita cuando una política de `users` necesita consultar `users`).
create or replace function public.current_app_user_id()
returns bigint
language sql stable security definer set search_path = public as $$
  select id from public.users where auth_id = auth.uid() limit 1;
$$;

create or replace function public.current_app_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where auth_id = auth.uid() limit 1;
$$;

-- ── USERS ───────────────────────────────────────────────────────────────────
-- Todos los logueados pueden LEER la lista de usuarios (chat, asignar tareas).
-- Escribir su propia fila: sí. Gestionar otras: solo socio/jefe.
alter table public.users enable row level security;

drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (auth.role() = 'authenticated');

drop policy if exists users_update_self_or_admin on public.users;
create policy users_update_self_or_admin on public.users
  for update using (auth_id = auth.uid() or public.current_app_role() in ('socio','jefe'))
  with check (auth_id = auth.uid() or public.current_app_role() in ('socio','jefe'));

drop policy if exists users_admin_delete on public.users;
create policy users_admin_delete on public.users
  for delete using (public.current_app_role() in ('socio','jefe'));

-- NOTA: no agrego política de INSERT en users. Si tu registro crea la fila con
-- un INSERT directo desde el cliente, descomentá esto (si usa una RPC/trigger
-- SECURITY DEFINER, no hace falta):
-- drop policy if exists users_insert on public.users;
-- create policy users_insert on public.users for insert with check (true);

-- ── TASKS ───────────────────────────────────────────────────────────────────
-- Empleado: ve/gestiona lo asignado a él o lo que creó. Socio/jefe: todo.
alter table public.tasks enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    public.current_app_role() in ('socio','jefe')
    or assigned_to = public.current_app_user_id()
    or created_by  = public.current_app_user_id()
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (
    public.current_app_role() in ('socio','jefe')
    or created_by = public.current_app_user_id()
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (
    public.current_app_role() in ('socio','jefe')
    or assigned_to = public.current_app_user_id()
    or created_by  = public.current_app_user_id()
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (
    public.current_app_role() in ('socio','jefe')
    or created_by = public.current_app_user_id()
  );

-- ── MESSAGES ────────────────────────────────────────────────────────────────
-- Ves los mensajes donde sos emisor o receptor. Enviás solo como vos mismo.
-- Podés marcar como leídos SOLO los que recibiste (esto además arregla el
-- contador fantasma si antes el update de "read" no persistía).
alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    from_user = public.current_app_user_id()
    or to_user = public.current_app_user_id()
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (from_user = public.current_app_user_id());

drop policy if exists messages_update_received on public.messages;
create policy messages_update_received on public.messages
  for update using (to_user = public.current_app_user_id())
  with check (to_user = public.current_app_user_id());

-- ── PUSH_SUBSCRIPTIONS ──────────────────────────────────────────────────────
-- Cada uno gestiona solo sus propias suscripciones (reemplaza la política
-- abierta `using(true)` del setup inicial).
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_all on public.push_subscriptions;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
