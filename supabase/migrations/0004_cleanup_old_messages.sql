-- ═══════════════════════════════════════════════════════════════════════════
--  Borrado automático de mensajes con más de 7 días.
--  Pegar en Supabase → SQL Editor → Run (una sola vez).
--  Corre todos los días a las 4:00 AM (hora del servidor).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

-- Evitar duplicar el job si se corre de nuevo.
select cron.unschedule('cleanup-old-messages')
where exists (select 1 from cron.job where jobname = 'cleanup-old-messages');

select cron.schedule(
  'cleanup-old-messages',
  '0 4 * * *',   -- todos los días 4:00 AM
  $$ delete from public.messages where created_at < now() - interval '7 days'; $$
);

-- Ver el job:            select * from cron.job where jobname = 'cleanup-old-messages';
-- Ver últimas corridas:  select * from cron.job_run_details order by start_time desc limit 10;
-- Borrar ya lo viejo a mano (opcional, sin esperar al cron):
--   delete from public.messages where created_at < now() - interval '7 days';
