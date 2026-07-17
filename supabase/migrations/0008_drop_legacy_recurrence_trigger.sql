-- ═══════════════════════════════════════════════════════════════════════════
--  Desactivar el trigger viejo de recurrencia en Postgres
--  Pegar en Supabase → SQL Editor → Run. Es idempotente.
--
--  Problema: al completar una tarea repetitiva se creaba DOS veces la próxima
--  ocurrencia (con doble notificación). Una la genera el cliente (transport.js,
--  maybeCreateRecurrence); la otra la seguía generando un trigger de Postgres
--  que se creó a mano en el SQL Editor y nunca quedó en el repo. La lógica de
--  recurrencia ahora vive SOLO en el cliente, así que ese trigger sobra.
--
--  Este bloque busca en public.tasks cualquier trigger cuyo función haga
--  `insert into ... tasks ...` (o sea, se autoinserta = recurrencia) y lo borra.
--  NO toca triggers de otro tipo (ej. el de updated_at), que no insertan tareas.
--
--  🔎 Para ver qué triggers hay antes/después:
--      select tgname from pg_trigger t
--      join pg_class c on c.oid = t.tgrelid
--      where c.relname = 'tasks' and not t.tgisinternal;
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  r record;
begin
  for r in
    select t.tgname, p.oid as fnoid, p.proname
    from pg_trigger t
    join pg_class c     on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p      on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname = 'tasks'
      and not t.tgisinternal
      and pg_get_functiondef(p.oid) ~* 'insert\s+into\s+(public\.)?tasks'
  loop
    execute format('drop trigger if exists %I on public.tasks', r.tgname);
    -- La función queda huérfana; la borramos si ningún otro trigger la usa.
    if not exists (select 1 from pg_trigger where tgfoid = r.fnoid and not tgisinternal) then
      execute format('drop function if exists public.%I()', r.proname);
    end if;
    raise notice 'Trigger de recurrencia eliminado: % (función %)', r.tgname, r.proname;
  end loop;
end $$;
