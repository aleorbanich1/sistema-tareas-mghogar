# 🔔 Recordatorios que SUENAN (APK + Web) — Guía de instalación

Se agregó doble sistema de notificaciones para que los recordatorios suenen
**aunque la app esté cerrada o el celular bloqueado**:

- **APK (Android):** notificaciones **locales nativas** (Capacitor). Las agenda
  el sistema operativo. **No necesita servidor.** Funciona 100% offline.
- **Web (PWA):** **Web Push**. Una Edge Function de Supabase programada cada
  minuto envía el aviso a la hora exacta. Requiere la config de abajo.

---

## ✅ Llaves VAPID ya generadas (para este proyecto)

```
Public  key: BOqdDgxUACEprn0o4zhXQ12TN5pKs5iNWAAFd3lQ-3SBUd0o4n6sA2_bM0i68Nsd46IHty2jSSvrCEP5D9OS0IU
Private key: Furh1ehfEizNpLsBskUV15tFvWmXqh5NoL4o4enWH7c
```

> La **pública** ya podés pegarla en `task-system/frontend/.env`.
> La **privada** va SOLO en los secrets de Supabase (NUNCA en el frontend/git).
> Si preferís generar tus propias llaves: `npx web-push generate-vapid-keys`.

---

## 1) Frontend — pegar la clave pública

En `task-system/frontend/.env`:

```
VITE_VAPID_PUBLIC_KEY=BOqdDgxUACEprn0o4zhXQ12TN5pKs5iNWAAFd3lQ-3SBUd0o4n6sA2_bM0i68Nsd46IHty2jSSvrCEP5D9OS0IU
```

Después rebuild: `yarn build` (y para el APK, `yarn cap sync android`).

---

## 2) Supabase — base de datos (SQL Editor → Run)

Pegá y ejecutá el contenido de:

```
supabase/migrations/0001_web_push_reminders.sql
```

Crea la tabla `push_subscriptions` y la columna `tasks.reminder_sent_at`.

---

## 3) Supabase — desplegar la Edge Function

Necesitás el [Supabase CLI](https://supabase.com/docs/guides/cli). Desde la raíz del repo:

```bash
supabase login
supabase link --project-ref qsewancpibyyakitwpnr

# Secrets (la privada VAPID + el secreto del cron):
supabase secrets set VAPID_PUBLIC_KEY=BOqdDgxUACEprn0o4zhXQ12TN5pKs5iNWAAFd3lQ-3SBUd0o4n6sA2_bM0i68Nsd46IHty2jSSvrCEP5D9OS0IU
supabase secrets set VAPID_PRIVATE_KEY=Furh1ehfEizNpLsBskUV15tFvWmXqh5NoL4o4enWH7c
supabase secrets set VAPID_SUBJECT=mailto:tuemail@ejemplo.com
supabase secrets set CRON_SECRET=elegí-un-texto-secreto-largo

# Desplegar (sin verificación JWT: la protege el CRON_SECRET):
supabase functions deploy send-reminders --no-verify-jwt
```

> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase solo; no hace falta setearlos.

---

## 4) Supabase — programar el cron (SQL Editor → Run)

Abrí `supabase/migrations/0002_schedule_reminders_cron.sql`, reemplazá
`<CRON_SECRET>` por el **mismo** valor del paso anterior, y ejecutalo.
Deja la función corriendo cada minuto.

Verificar:
```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
```

---

## 5) Probar

- **Web:** abrí la PWA, aceptá el permiso de notificaciones (se crea la
  suscripción en `push_subscriptions`). Creá una tarea con recordatorio en
  ~2 minutos. Cerrá la pestaña. Debe sonar/aparecer el aviso.
- **APK:** instalá el nuevo APK, aceptá el permiso. Creá una tarea con
  recordatorio cercano, cerrá la app. El SO la dispara con sonido.

---

## Notas técnicas

- **Zona horaria:** la función interpreta los horarios en **-03:00 (Argentina)**.
  Si operan en otra zona, cambiá `TZ_OFFSET` en
  `supabase/functions/send-reminders/index.ts`.
- El campo `reminder_hours` en realidad guarda **minutos** (la UI dice "minutos").
- El sonido en Web Push / APK es el **sonido de notificación del sistema**
  (no el chime WebAudio propio, que solo suena con la app abierta en la web).
- Sin `VITE_VAPID_PUBLIC_KEY` la web simplemente no suscribe (no rompe nada);
  el APK funciona igual porque no depende de Web Push.
