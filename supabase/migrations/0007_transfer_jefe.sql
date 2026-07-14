-- ═══════════════════════════════════════════════════════════════════════════
--  Transferencia del rol de Jefe (irreversible)
--  Pegar en Supabase → SQL Editor → Run. Es idempotente.
--
--  Regla: solo el jefe actual puede transferir. El destinatario pasa a 'jefe'
--  y el que transfiere queda como 'empleado' en la misma transacción. El nuevo
--  jefe puede volver a transferir (la cadena sigue), pero el anterior NO puede
--  recuperarlo por su cuenta.
--
--  Confirmación obligatoria: hay que mandar el nombre completo exacto del
--  destinatario en p_confirmation. Se valida en el servidor, no solo en la UI.
--
--  🔙 ROLLBACK (si hace falta revertir a mano, como service_role):
--      update public.users set role = 'jefe'     where id = <id_viejo_jefe>;
--      update public.users set role = 'empleado' where id = <id_nuevo_jefe>;
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.transfer_jefe_role(
  p_target_id bigint,
  p_confirmation text
)
returns table (id bigint, username text, full_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     public.users%rowtype;
  v_target public.users%rowtype;
begin
  select * into v_me from public.users where auth_id = auth.uid() limit 1;
  if v_me.id is null then
    raise exception 'No hay sesión activa';
  end if;
  if v_me.role <> 'jefe' then
    raise exception 'Solo el jefe puede transferir la jefatura';
  end if;

  -- FOR UPDATE: si dos transferencias corren a la vez, se serializan y la
  -- segunda vuelve a chequear el rol del que transfiere (ya no será jefe).
  select * into v_target from public.users where id = p_target_id for update;
  if v_target.id is null then
    raise exception 'El usuario destino no existe';
  end if;
  if v_target.id = v_me.id then
    raise exception 'No podés transferirte la jefatura a vos mismo';
  end if;
  if v_target.role = 'jefe' then
    raise exception 'Ese usuario ya es jefe';
  end if;

  if lower(btrim(coalesce(p_confirmation, ''))) <> lower(btrim(v_target.full_name)) then
    raise exception 'La confirmación no coincide con el nombre del destinatario';
  end if;

  -- Habilita el cambio de rol solo dentro de esta transacción (ver trigger abajo).
  perform set_config('app.role_transfer', 'on', true);

  update public.users set role = 'jefe'     where users.id = v_target.id;
  update public.users set role = 'empleado' where users.id = v_me.id;

  perform set_config('app.role_transfer', 'off', true);

  return query
    select u.id, u.username, u.full_name, u.role
    from public.users u
    where u.id in (v_target.id, v_me.id);
end;
$$;

revoke all on function public.transfer_jefe_role(bigint, text) from public;
grant execute on function public.transfer_jefe_role(bigint, text) to authenticated;

-- ── Candado: el rol NO se cambia desde el cliente ───────────────────────────
-- Sin esto la transferencia no significa nada: la política users_update_self_or_admin
-- deja que cualquiera edite su propia fila, así que un empleado podría ponerse
-- 'jefe' con un update directo. Los cambios de rol pasan solo por la RPC de arriba
-- (que activa app.role_transfer) o por service_role / SQL editor (auth.uid() null).
create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and coalesce(current_setting('app.role_transfer', true), 'off') <> 'on' then
    raise exception 'El rol no se puede cambiar directamente. Usá la transferencia de jefatura.';
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_role_change on public.users;
create trigger users_guard_role_change
  before update on public.users
  for each row execute function public.guard_role_change();
