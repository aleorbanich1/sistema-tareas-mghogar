# MG Hogar — Guía del proyecto (setup + notas)

Guía rápida para retomar el proyecto sin empezar de cero. Cubre: qué es la app,
cómo se levanta, cómo se arma el APK, y el estado de Supabase.

---

## ¿Qué es la app?

**Sistema de tareas para MG Hogar** (empresa de servicios del hogar). Es una
**PWA web + app Android** (Capacitor). Dos roles:

- **Socio / Jefe:** asigna tareas a cualquier empleado, ve todas, aprueba registros.
- **Empleado:** ve sus tareas, se auto-asigna, las completa / reporta fallo.

Funciones principales:
- **Tareas** con prioridad (P1–P4), fecha + horario (el horario es solo para ordenar),
  y **repetición**: diaria / semanal / mensual / **último día hábil del mes**.
  Al completar una repetitiva, la app crea sola la próxima.
- **Recordatorios repetitivos**: mientras la tarea esté pendiente, avisa cada X
  (minutos u horas). Suenan con sonido + notificación.
- **Chat** entre usuarios (con tareas adjuntas). Los mensajes son **temporales:
  se borran a los 7 días**.
- **Notificaciones**: nativas en el APK (suenan con la app cerrada) y Web Push en
  la web (requiere setup de Supabase, ver abajo). Sonido "pop" al completar tarea.
- **Offline**: las acciones se encolan y se sincronizan al volver la conexión.

---

## Stack

- **Frontend:** React 19 + Vite + `vite-plugin-pwa` + Tailwind. Gestor: **yarn**.
- **Sin backend propio:** la app habla **directo con Supabase** (anon key + Supabase
  Auth). El "traductor" de llamadas está en `src/utils/transport.js`.
  (El viejo backend Express fue eliminado; no se usa.)
- **Android:** Capacitor 8. Se arma con `build-apk.ps1`.
- **Proyecto Supabase:** ref `qsewancpibyyakitwpnr`.

---

## Cómo iniciar la app (desarrollo)

```powershell
cd C:\Users\Thiago\Desktop\hola\sistema-tareas-mghogar\task-system\frontend
yarn dev
```

Abre en **http://localhost:5173/**. Como habla directo con Supabase, **no hay que
levantar ningún backend**.

> **yarn**: si `yarn` no existe, activalo una vez con `corepack enable` (PowerShell
> como Administrador). Alternativa sin instalar nada: usar `corepack yarn dev`.

Para probar en el celular por HTTPS (necesario para sonido/notificaciones) se puede
exponer con un túnel (ngrok); ya está permitido en `vite.config.js` (`allowedHosts`).

---

## Cómo armar el APK

```powershell
cd C:\Users\Thiago\Desktop\hola\sistema-tareas-mghogar\task-system\frontend
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

Hace: `yarn build` → `yarn cap sync android` → compila con Gradle → deja
**`MG-Hogar.apk`** en la carpeta del frontend. Requiere Android Studio (usa su Java
JBR) y el SDK de Android; las rutas ya están puestas en el script.

---

## Supabase — cómo está y qué falta

**Ya funcionando:**
- **Auth**: login con Supabase Auth. La tabla `users` linkea `auth_id` ↔ `users.id`
  y tiene `role` ('empleado' | 'socio' | 'jefe').
- **Realtime**: cambios de `tasks` y `messages` en vivo (chat, actualizaciones).
- **Recurrencia**: la genera la app al completar (no hay trigger). El viejo trigger
  `tasks_recurrence` ya se **desactivó** (se dejó solo `tasks_updated_at`).

**Migraciones en el repo** (`supabase/migrations/`, correr en SQL Editor):
- `0003_rls_policies.sql` — **Seguridad (RLS)**. Importante: aplicar con cuidado,
  tabla por tabla, verificando que todos los usuarios tengan `auth_id`. Trae el
  rollback comentado por si algo se rompe.
- `0004_cleanup_old_messages.sql` — borra automáticamente los mensajes de +7 días
  (cron diario). Correr una vez.

**Web Push (notificaciones en la web con la app cerrada) — OPCIONAL / pendiente:**
- Hay una Edge Function en `supabase/functions/send-reminders/index.ts` que manda
  los push. Para activarla hace falta: tabla `push_subscriptions` + columna
  `tasks.reminder_sent_at`, desplegar la función con sus secrets (VAPID + CRON_SECRET)
  y un cron cada minuto (pg_cron + pg_net).
- **El APK NO depende de esto**: sus notificaciones son nativas y ya andan con la
  app cerrada. Web Push es solo para que suenen en el navegador cuando está cerrado.

**Llaves VAPID** (para Web Push; la pública ya está en `.env`):
```
Public : BOqdDgxUACEprn0o4zhXQ12TN5pKs5iNWAAFd3lQ-3SBUd0o4n6sA2_bM0i68Nsd46IHty2jSSvrCEP5D9OS0IU
Private: Furh1ehfEizNpLsBskUV15tFvWmXqh5NoL4o4enWH7c   (va SOLO en secrets de Supabase)
```

---

## Notas / decisiones para tener en cuenta

- **`reminder_hours`** en la tabla `tasks` ahora guarda **segundos** (nombre viejo;
  la UI ofrece minutos/horas). El recordatorio es un **intervalo de repetición**,
  no "X antes de la hora".
- **Repetición**: se guarda como palabra clave en la columna `recurrence_days`
  (`daily` | `weekly` | `monthly` | `last_business_day`). La lógica de la próxima
  fecha está en `src/utils/recurrence.js`.
- **Fechas**: se parsean al mediodía para evitar el desfase de zona horaria que
  corría el día para atrás.
- **Mensajes**: contador de no leídos por remitente; se borran a los 7 días (0004).
- El sonido de Web Push / APK es el **sonido de notificación del sistema** (el chime
  propio solo suena con la app abierta en la web).

---

## Checklist de deploy (cuando toque)

1. Frontend web: `yarn build` → subir `dist/` (o que Netlify buildee del repo).
2. APK: `build-apk.ps1` → distribuir `MG-Hogar.apk`.
3. Supabase: correr `0003` (RLS) y `0004` (limpieza de mensajes).
4. (Opcional) Activar Web Push: desplegar la Edge Function + tabla + cron.
5. Notificaciones de Manychat: correr `0006` + desplegar la Edge Function (ver abajo).
   (`0006` NO usa RLS, no depende de `0003`.)

---

## Notificaciones de escalamiento (Manychat → sistema de tareas)

Cuando el bot de Manychat detecta una conversación que necesita intervención
humana, le pega a una **API en Supabase** que crea una **notificación PERMANENTE**
(NO una tarea). Aparece como un banner fijo y se apaga cuando alguien toca
"Resolver" (se resuelve para **todos** los destinatarios).

**Dónde vive la API:** en Supabase (Edge Function), NO en Netlify ni en local. La
URL es fija para todos los clientes, esté la web en Netlify o en `localhost`,
porque el único backend real es Supabase. Manychat siempre le pega a Supabase.

**Piezas:**
- Migración: `supabase/migrations/0006_escalation_notifications.sql` — tablas
  `notifications`, `notification_recipients`, `notification_routes` + Realtime +
  cron que borra las de **+36 h** (para que la tabla no explote). **No usa RLS**
  (igual que el resto de la app; la seguridad la da el token del webhook).
- Edge Function: `supabase/functions/manychat-notification/index.ts` — recibe el
  webhook, valida el token secreto y se la manda a todas las personas activadas.
- Frontend: `EscalationNotifications.jsx` (banner global, todos los roles) y
  `NotificationRoutingPanel.jsx` (panel del jefe, botón de campana en el header).

### Deploy (una vez)

```powershell
# 1) Base de datos: pegar 0006 en Supabase → SQL Editor → Run
# 2) Secret del webhook (elegí un string secreto y largo):
supabase secrets set MANYCHAT_WEBHOOK_SECRET=un-secreto-largo-y-random
# 3) Desplegar la función CON --no-verify-jwt (importante, ver nota abajo):
supabase functions deploy manychat-notification --no-verify-jwt
```

> **`--no-verify-jwt` es obligatorio.** Por defecto el gateway de Supabase exige un
> JWT válido en el header `Authorization` y devuelve **401** antes de correr la
> función. Manychat manda ahí su propio secreto, no un JWT, así que hay que apagar
> esa verificación. La seguridad la da el token que valida la función.
>
> Correr `supabase functions deploy` desde la **raíz del repo** (donde está la
> carpeta `supabase/`), no desde `task-system/frontend`.

URL que queda (reemplazá el ref si cambia): 
`https://qsewancpibyyakitwpnr.supabase.co/functions/v1/manychat-notification`

### Config en Manychat (External Request / acción HTTP)

- **Method:** POST
- **URL:** la de arriba
- **Headers:**
  - `Authorization: Bearer un-secreto-largo-y-random`  (el mismo del secret)
  - `Content-Type: application/json`
- **Body (JSON):**
  ```json
  {
    "cliente_nombre": "{{full_name}}",
    "cliente_telefono": "{{whatsapp_id}}",
    "mensaje_cliente": "{{ultimo_mensaje_cliente}}",
    "motivo": "{{motivo_escalamiento}}"
  }
  ```

### Configurar QUIÉN recibe (panel del jefe)

En la cuenta del jefe, botón de **campana** (🔔) arriba a la derecha. Es un
**toggle por persona**: la que esté activada recibe TODAS las notificaciones de
escalamiento (no se rutea por `motivo`, porque el motivo lo genera un bot de IA y
es impredecible). El campo `motivo` igual llega y se muestra en el banner como dato.
Ojo: si no hay nadie activado, la notificación se crea pero **no le llega a nadie**.

### Probar sin Manychat (curl)

```bash
curl -X POST "https://qsewancpibyyakitwpnr.supabase.co/functions/v1/manychat-notification" \
  -H "Authorization: Bearer un-secreto-largo-y-random" \
  -H "Content-Type: application/json" \
  -d '{"cliente_nombre":"Ana Test","cliente_telefono":"5491122334455","mensaje_cliente":"Necesito hablar con alguien","motivo":"reclamo"}'
```
Respuesta esperada: `{"ok":true,"notification_id":"...","delivered":N}`. Si
`delivered` es 0, no hay nadie ruteado para ese motivo (revisá el panel).
