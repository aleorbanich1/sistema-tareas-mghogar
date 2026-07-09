# MG Hogar — Principios y convenciones (para construir apps compatibles)

> **Para quién es este documento:** para otra IA (o dev) que va a construir **otra
> app** usando el **mismo stack y las mismas convenciones** que la app de Tareas.
> La idea es que ambas puedan **fusionarse en una sola** cuando estén terminadas.
> Define lo que **NO hay que romper** para que esa fusión sea posible y para que las
> dos apps se **vean y se comporten como una sola**. Sirve para **cualquier** app.
>
> Regla de oro: **cuando dudes, abrí la app de Tareas y copiá EXACTO lo que hace.**
> No inventes la forma de auth, transport, api, socket ni notificaciones: ya están
> definidas abajo con su firma exacta. Las **únicas excepciones** (cosas de Tareas que
> NO hay que copiar) están listadas en la sección 12.
>
> **Antes de empezar, leé la sección 11 ("Errores comunes que cuestan tiempo").**
> Son las trampas concretas que hacen perder horas.

---

## 1. Stack (NO cambiar)

- **Frontend:** React **19** + **Vite 6+** (build) + **vite-plugin-pwa** (PWA/Service Worker).
- **Estilos:** **Tailwind CSS v4** (`@import "tailwindcss";` en `index.css`, sin config gigante).
  ⚠ Tareas lo integra vía **PostCSS** (`@tailwindcss/postcss` en `postcss.config.js`),
  **no** vía el plugin `@tailwindcss/vite`. Las dos integraciones valen, pero si copiás
  la config de Tareas, copiá la de PostCSS. El `tailwind.config.js` que hay en Tareas
  es un **resto de v3 que v4 ignora**: no lo copies.
- **Animaciones:** **framer-motion** (`motion`, `AnimatePresence`; Tareas **no** usa
  `Reorder` — si necesitás drag, agregalo vos).
- **Íconos:** **lucide-react** (nada de otras librerías de íconos).
- **Ruteo:** **react-router-dom v7**, con páginas **lazy** (`React.lazy` + `Suspense`).
- **Backend:** **NO hay backend propio.** La app habla **directo con Supabase**
  (anon key + Supabase Auth). Lógica de servidor puntual = **Edge Functions** (Deno).
- **Base de datos / Auth / Realtime:** **Supabase** (mismo proyecto: ref `qsewancpibyyakitwpnr`).
- **Offline:** **localforage** para la cola de sincronización y el cache.
- **Mapas (si hacen falta):** **Leaflet** + tiles de OpenStreetMap. Geocoding con
  **Nominatim** vía Edge Function. Atribución `© OpenStreetMap contributors` obligatoria.
- **Mobile:** **Capacitor 8** (Android). La misma web se empaqueta como APK.
- **Gestor de paquetes:** **yarn 1.x (classic)** — `"packageManager": "yarn@1.22.22"`
  en el `package.json` de Tareas. **No usar npm**, y no asumas yarn 4/berry.
- Otras libs: `clsx` + `tailwind-merge` (helper `cn`), `date-fns`, `uuid`.
  (`socket.io-client` figura en las deps de Tareas pero **ya no se usa** — el shim lo
  reemplazó. NO la instales en tu app.)

---

## 2. Estructura de carpetas (replicar)

```
frontend/
  index.html          # Inter no bloqueante + <html lang="es"> + theme-color #059669
  vite.config.js      # ver §6 (JSX en .js + VitePWA + manualChunks)
  capacitor.config.json
  src/
    main.jsx          # entrypoint
    App.jsx           # Provider de Auth + Router + ErrorBoundary (NotificationGate va
                      # dentro de los dashboards, no en App.jsx)
    index.css         # @import "tailwindcss" + scrollbar. Las utilidades pb-safe/pt-safe
                      # NO existen en Tareas: si las necesitás, crealas vos con
                      # env(safe-area-inset-*)
    pages/            # una página por vista (lazy)
    components/
      ui/             # Button, Input, Select, Modal, CalendarPicker (copiar IDÉNTICOS).
                      # Confirm/useConfirm NO existe en Tareas: crealo vos sobre Modal (§5)
      <dominio>/      # componentes propios del dominio (en Tareas van sueltos en
                      # components/: TaskCard.jsx, ChatPanel.jsx; una subcarpeta está bien)
    utils/
      api.js          # capa PÚBLICA: api(path, opts), socket, flushSyncQueue (+ offline)
      transport.js    # traduce api(path) → Supabase + shim socket (realtime)
      supabaseClient.js # cliente ÚNICO de Supabase
      config.js       # variables VITE_* + constantes compartidas
      auth.js         # AuthContext + getAuthFromStorage/useAuth/useAuthActions
      cn.js           # helper clsx + tailwind-merge
      format.js       # es-AR: fmtARS, fmtFecha, fmtFechaHora (recomendado — NO existe
                      # en Tareas; si lo querés, crealo)
  supabase/
    functions/<nombre>/index.ts   # Edge Functions (Deno)
```

---

## 3. Arquitectura — patrones NO NEGOCIABLES

### 3.1 Sin backend: todo pasa por `api()` → `transport.js`

Los componentes **nunca** llaman a `supabase.from(...)` directo (salvo `auth.js` y
`transport.js`, que son la infraestructura). Firma exacta:

```js
// utils/api.js  → lo que usan los componentes
api(path, { method = 'GET', body } = {})   // Promise<data>
export { socket }                           // shim realtime (ver 3.5)
export async function flushSyncQueue()      // reintenta la cola offline
// OJO: pendingCount() NO existe en Tareas. Si querés diagnóstico de la cola,
// agregalo vos leyendo DB.getSyncQueue().length — no lo des por existente.
```

```js
// utils/transport.js  → única capa que toca Supabase para datos
export async function request(path, method = 'GET', body = null) // imita un backend REST
export const socket = { connect, disconnect, on, off }           // shim socket.io
```

Reglas del contrato (copiá el comportamiento de Tareas):

- **Cola offline (localforage).** Las MUTACIONES (`POST/PUT/PATCH/DELETE`) que fallan por
  red se **encolan** y se reintentan con `flushSyncQueue()` al volver online. Los `GET`
  hacen **stale-while-revalidate** (devuelven cache si no hay red).
- **`wrapError`**: `transport` marca los errores de red con `error.isNetwork = true`
  para que `api()` sepa encolar. Copialo tal cual.
- **`me()`**: helper interno de `transport` que lee el usuario de `localStorage`:
  `JSON.parse(localStorage.getItem('mg_user') || '{}')`. Úsalo para `created_by`, etc.
- **Dedup offline**: si una tabla puede crearse offline, agregale una columna `uuid`
  y dedupliká por ella en el `insert` (como `tasks`/`messages`). Si no, asumí que un
  reintento podría duplicar.
- **Rutas que NO son datos** (RPC, Edge Functions como `/geocode`): **excluílas de la
  cola offline** (una lista `NO_QUEUE`). Necesitan respuesta sincrónica; si no hay red,
  que fallen, no que se encolen. (La lista `NO_QUEUE` **no existe en Tareas** porque
  Tareas no tiene rutas de ese tipo: es una regla para TU app, la tenés que escribir vos.)
- **`api()`/`transport` viven una sola vez.** En la fusión hay UN `api.js`, UN
  `transport.js` y UN `socket`. Tu app **agrega sus rutas** al `request()` y sus
  eventos al `socket`, no crea copias.

### 3.2 Auth y usuarios (COMPARTIDOS — el corazón de la fusión)

Copiá estos archivos **tal cual** de Tareas: `utils/userEmail.js`, `utils/auth.js`,
`pages/Login.jsx`. No reimplementes el flujo.

- Tabla **`users`**: `id` (bigint), `auth_id` (uuid → `auth.users`), `username`,
  `full_name`, `role` (`'empleado' | 'socio' | 'jefe'`). **Se reutiliza, no se duplica.**
- **Login por USERNAME, no por email.** El usuario escribe su nombre de usuario; se
  traduce a un email interno con `userEmail.js`:

  ```js
  // slug: NFD → saca acentos → minúsculas → sólo a-z0-9
  emailFor(username) === `${slug(username)}@mghogar.local`  // dominio FIJO
  ```

- **Flujo de `Login.jsx`** (copialo): `emailFor(usuario)` →
  `supabase.auth.signInWithPassword({ email, password })` → buscar la fila de `users`
  por `auth_id` (`id, username, full_name, role`) → **si no hay fila**:
  `signOut()` + mensaje **"Tu cuenta está pendiente de aprobación por el jefe."**
- **`auth.js` NO hace el signIn.** Su API exacta es:

  ```js
  export const AuthContext = createContext(null);
  export function getAuthFromStorage()   // { token, user, isAuthenticated } desde localStorage
  export function useAuth()              // { token, user, isAuthenticated, setAuth }
  export function useAuthActions()       // { login(token, user), logout() }
  ```

  `login(token, user)` sólo **persiste** (`localStorage`: `mg_token`, `mg_user`) y hace
  `setAuth(...)`. El signIn ocurre en el componente Login. `logout()` hace
  `supabase.auth.signOut()` + `localStorage.clear()`.
- **El Provider vive en `App.jsx`**: `const [auth, setAuth] = useState(getAuthFromStorage)`
  y `<AuthContext.Provider value={{ ...auth, setAuth }}>`. En `App.jsx` un `useEffect`
  conecta/desconecta el `socket` según `isAuthenticated`.
- **Roles**: reutilizá `empleado/socio/jefe`. `empleado` es el trabajador base.
  Si de verdad necesitás un rol nuevo, agregalo al `check` de `users.role` **y** a los
  guards; pero preferí reutilizar.
- **Guard por rol — cómo es en Tareas de verdad:** NO hay componente `RequireRole` ni
  ruta `/login`. El login se renderiza en `/`, y el guard es **inline en cada `<Route>`**
  de `App.jsx` (ternario: `isAuthenticated && rol permitido ? <Página/> : <Navigate to="/" replace/>`).
  Si preferís extraerlo a un componente `RequireRole roles={[...]}`, vale — pero ojo con
  los bucles de redirección: si el usuario tiene sesión pero un rol no permitido, mostrale
  una pantalla "sin acceso" TERMINAL en vez de redirigir en cadena.

### 3.3 Seguridad (RLS) — obligatorio por tabla

Con anon key + Auth, la seguridad es **100% RLS**. Existen helpers SECURITY DEFINER:
`current_app_user_id()` y `current_app_role()`.

- **RLS activo SIN policy = tabla bloqueada (deny all).** Por CADA tabla nueva:
  activá RLS **y** creá al menos una policy. Plantilla copy-paste:

  ```sql
  alter table <tabla> enable row level security;
  drop policy if exists app_rw on <tabla>;
  create policy app_rw on <tabla> for all
    using (current_app_user_id() is not null)
    with check (current_app_user_id() is not null);
  -- (para restringir escritura por rol, sumá current_app_role() in ('socio','jefe'))
  ```

- **Tablas de log/cache** que la app sólo **lee** (o que sólo escribe una Edge Function
  con service_role): podés dejarlas **sin RLS** (datos no sensibles) siempre que el rol
  `authenticated` tenga `SELECT`. Documentá esa decisión.
- **Acceso público/anónimo** (ej. una página de seguimiento sin login): NO abras la
  tabla a `anon`. Exponé **sólo lo no sensible** con una función `SECURITY DEFINER`
  y `grant execute ... to anon`. Nunca teléfono/plata a anon.
  - Gotcha: `create or replace function` **no** deja cambiar el tipo de retorno →
    hacé `drop function <nombre>(<args>);` antes de recrearla.

### 3.4 Nombres de tablas (evitar colisiones para la fusión)

- Tareas usa: `users`, `tasks`, `messages`, `push_subscriptions`.
- Tu app crea **TODAS** sus tablas con **prefijo temático** (ej. `entregas`,
  `entregas_zonas`, `entregas_config`, `entregas_eventos`, …). Incluí config, logs y
  cache en el prefijo.
- **`users` y la auth se reutilizan.** **`push_subscriptions` también se comparte**
  (es la tabla de Web Push): reusala, no la dupliques.

### 3.5 Realtime (el shim `socket`)

- `socket` imita socket.io (`connect/disconnect/on/off`) pero por debajo usa Supabase
  Realtime. Emití eventos **enriquecidos** y con nombre **UPPER_SNAKE** (ej.
  `TASK_UPDATED`, `ENTREGA_CREATED`). Al recibir un `postgres_changes`, **re-consultá**
  la fila con sus JOINs (los eventos llegan sin los embeds) antes de emitir.
- **Publicación**: para que `postgres_changes` dispare, la tabla debe estar en la
  publicación de Realtime. Una vez por tabla:
  `alter publication supabase_realtime add table <tabla>;` (¡fácil de olvidar!).
- **Nombres de canal únicos** por dominio (`mg-realtime`, `entregas-realtime`, …) para
  no pisar canales de otra app.
- **Broadcast** (avisos en vivo entre clientes, sin tabla): útil, pero **el `subscribe`
  puede colgarse** si Realtime no engancha → envolvé el `subscribe`/`send` en un
  `Promise.race` con timeout y tratalo como **best-effort** (nunca bloquees la acción
  principal por un broadcast/push).

---

## 4. Sistema de diseño (respetar al pie)

### 4.1 Paleta
- **Primario / marca:** **emerald** (`emerald-600` = `#059669`; en dark `emerald-500`).
  `theme_color` de la PWA = `#059669`.
- **Neutros:** **slate**. Fondo claro `bg-slate-50`, oscuro `bg-slate-950`. Tarjetas
  `bg-white`/`dark:bg-slate-900`. Bordes `slate-200`/`dark:slate-800`. Texto
  `slate-900`/`dark:slate-50`; secundario `slate-500`.
- **Semánticos:** peligro/eliminar **red-600**; advertencia/temporal **amber**;
  info **blue/indigo**.
- **Dark mode obligatorio**, siempre en pares `light`/`dark:` y respetando
  `prefers-color-scheme` (Tailwind v4 usa el media query por defecto — **no** uses
  dark por clase salvo que Tareas lo haga).

### 4.2 Forma y tipografía
- **Inter**, cargada **no bloqueante** desde Google Fonts en `index.html`
  (`media="print" onload="this.media='all'"`), aplicada al `body`.
- **Radios:** `rounded-xl` (botones/inputs), `rounded-2xl` (tarjetas/modales),
  `rounded-full` (chips/badges/avatares).
- **Sombras** suaves (`shadow-sm`; `shadow-xl` en flotantes/modales).
- **Mobile-first:** `100dvh`, tarjetas centradas, áreas seguras (`pb-safe`/`pt-safe`,
  definidas en `index.css` con `env(safe-area-inset-*)`), `viewport-fit=cover`.

### 4.3 Interacción
- Botones `active:scale-[0.98]`, `focus-visible:ring` emerald.
- Entradas/salidas con framer-motion (spring `damping ~25, stiffness ~300`).
- Chips/badges: `text-xs font-medium px-2 py-0.5 rounded-full` con fondo teñido.
- **Animaciones optimizadas**: sólo `transform`/`opacity` (nada de blur pesado ni
  partículas), para que corran bien en celus/compus flojos.

---

## 5. Componentes UI (copiar IDÉNTICOS)

Copiá de Tareas, sin cambiarles nada: `components/ui/Button.jsx`, `Input.jsx`,
`Select.jsx`, `Modal.jsx`, `CalendarPicker.jsx`, y el helper `utils/cn.js`.

- **`Button`** — `variant`: `primary` | `secondary` | `danger` | `ghost`.
  `size`: `default` (min-h 52) | `sm` | `lg`.
- **`Input`**, **`Select`** — `forwardRef`, bordes slate, focus emerald.
- **`Modal`** — prop **`isOpen`** (no `open`), overlay `bg-slate-950/50 backdrop-blur`,
  panel `rounded-2xl`, header sticky con título + X, animado.
- **`CalendarPicker`** — props **`selectedDate`** / **`onSelectDate`**, parsea al
  mediodía (`+ 'T12:00:00'`), locale `es`.
- **`cn(...)`** siempre para componer clases.
- **NADA de diálogos nativos** (`window.confirm`/`alert`/`prompt`): usá un
  **confirm in-app** reutilizable (hook `useConfirm` sobre `Modal`). Cualquier
  confirmación de borrado va por ahí. **Ojo:** en Tareas NO hay un `Confirm.jsx` ni
  `useConfirm` para copiar (sus confirmaciones son modales ad-hoc en cada pantalla);
  el componente reutilizable lo creás vos sobre `Modal`.

Patrones visuales: header con logo + "Hola, {nombre}", listas de tarjetas, banners
ámbar/emerald, tabs con la pestaña activa en emerald.

---

## 6. Convenciones de código (y el gotcha de JSX en `.js`)

- **Idioma:** UI y comentarios en **español (Argentina)**. Fechas/horas con
  `toLocaleDateString('es-AR')` / `toLocaleTimeString('es-AR')`. Plata en **$ AR**
  (`toLocaleString('es-AR', { style:'currency', currency:'ARS' })`).
- **Zona horaria −03:** al parsear `'YYYY-MM-DD'` hacelo **al mediodía**
  (`new Date(fecha + 'T12:00:00')`) para no correr el día.
- **Estado:** React hooks. Nada de Redux. Context sólo para auth (y opcional para
  "salud del sistema").
- **IDs:** siempre `Number(a) === Number(b)` (vienen como string o number).
- **Fallos defensivos:** optional chaining con datos de realtime
  (`e?.zona?.nombre`). Hay un `ErrorBoundary` global en `App.jsx`.
- **Offline:** toda mutación por `api()`; nunca rompas la cola.

**Gotcha — JSX dentro de archivos `.js`:** el `auth.js` de Tareas **NO tiene JSX**
(es sólo `createContext` + hooks), por eso Tareas no necesita ninguna config especial
de Vite. El gotcha aplica **sólo si VOS ponés JSX en un archivo `.js`**: ahí `yarn dev`
explota (`The JSX syntax extension is not currently enabled`) salvo que configures
Vite así:

```js
plugins: [ react({ include: /\.(js|jsx)$/ }), tailwindcss(), VitePWA({...}) ],
esbuild: { loader: 'jsx', include: /src\/.*\.jsx?$/ },
optimizeDeps: {
  entries: ['index.html'],                 // NO escanear android/ de Capacitor
  esbuildOptions: { loader: { '.js': 'jsx' } },  // ⚠ es "esbuildOptions", no "esbuild"
},
```

Alternativa (la que usa Tareas y la más simple): **todo archivo con JSX se llama `.jsx`**,
y los `.js` quedan sin JSX. Elegí una y sé consistente.

---

## 7. PWA / Capacitor / Notificaciones

### 7.1 PWA (`vite-plugin-pwa`)
- `registerType: 'autoUpdate'`, `injectRegister: 'auto'`.
- **Precache** de la app shell + **runtimeCaching**: fuentes (CacheFirst), **GET a la
  API de Supabase** (`/rest/…`, NetworkFirst), y **tiles OSM** si usás mapas
  (StaleWhileRevalidate).
  ⚠ **NO copies literal el `runtimeCaching` de Tareas:** su patrón de API es
  `url.pathname.startsWith('/api')`, un **resto del backend Express que no matchea
  NUNCA** las requests a Supabase (van a otro origin con path `/rest/v1/...`). El patrón
  correcto compara contra el **host de tu proyecto Supabase** (ej.
  `url.origin === 'https://<ref>.supabase.co' && url.pathname.startsWith('/rest/')`).
- Handlers de push en `public/push-sw.js`, inyectados con
  `workbox.importScripts: ['push-sw.js']`.
- `manifest` con `theme_color #059669`, íconos 192/512/maskable en `public/icons/`.
- **`manualChunks` gotcha:** separá SÓLO vendors pesados e independientes
  (`leaflet`, `framer-motion`). **No** metas `react` en su propio chunk: genera el
  warning *"Circular chunk"*. Dejá react/router/supabase juntos en `vendor`.
  (Excepción a "copiá exacto": el `vite.config.js` de Tareas **sí** separa
  `react-vendor` — no lo repliques; en apps nuevas ese split dio el warning.)

### 7.2 Notificaciones (fachada única — copiá el patrón de Tareas)
- `utils/reminders.js` orquesta web y APK. Sus exports REALES son:
  `initReminders(userId)`, `syncReminders(tasks, userId)`, `notificationStatus()`,
  `requestNotifications(userId)` e `isNative`. **NO existe un `notify(title, body)`**
  genérico — si tu app necesita avisos en vivo, agregalo vos (sobre `Notification` /
  local-notifications), no lo importes esperando que esté.
- **APK (Capacitor):** `utils/nativeNotifications.js` usa
  `@capacitor/local-notifications` detrás de `Capacitor.isNativePlatform()`
  (import perezoso del plugin). Crea un canal Android de importancia alta.
- **Web:** `Notification` API + **Web Push opcional** (`utils/webPush.js` con
  `VAPID_PUBLIC_KEY`, guarda la suscripción en `push_subscriptions`).
- **`NotificationGate`** al iniciar sesión: pide el permiso (web y APK).
- **Caveat importante:** las notificaciones **locales** sólo suenan si el proceso está
  vivo (o son **agendadas** de antemano). Para un aviso **event-driven con la app
  cerrada** (ej. "hoja publicada") necesitás un **emisor en el servidor**: Web Push
  desde una **Edge Function** (web) o **FCM** (APK). VAPID sola no envía nada.

### 7.3 Capacitor 8 (APK)
- `capacitor.config.json`: `appId: "com.mghogar.<app>"`, `appName`, `webDir: "dist"`.
- Deps: `@capacitor/{core,cli,android,local-notifications}@8`.
- Flujo: `yarn build` → `cap add android` (necesita Android Studio/SDK) →
  `cap sync` → compilar/firmar. La carpeta `android/` va en `.gitignore`.

---

## 8. Edge Functions (Supabase, Deno)

Cuando hace falta lógica de servidor (geocoding, envío de push, tareas con service_role):

- Van en `supabase/functions/<nombre>/index.ts`. **Deployá desde la raíz del repo**
  (donde está la carpeta `supabase/`), no desde `frontend/`:
  `supabase functions deploy <nombre>` (si pide Docker, `--use-api`).
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los **inyecta el runtime**. Otros
  secretos: `supabase secrets set CLAVE=valor`. **Nunca** service_role ni VAPID
  privada en el cliente.
- Poné **CORS** (OPTIONS + headers) y usá `service_role` sólo adentro de la función.
- **Nunca tumbar la app**: ante error, devolvé un estado manejable (ej.
  `{ status: 'fallo' }`) en vez de romper. La UI trata estos servicios como
  "informativos / con degradación elegante".
- Servicios gratuitos externos (Nominatim): **User-Agent identificable**,
  respetá el rate-limit (~1 req/s), cacheá resultados, y detectá bloqueos (429/403).

---

## 9. Reglas para la FUSIÓN (lo más importante)

1. **Mismo proyecto Supabase**, misma **auth**, misma tabla **`users`**, mismos **roles**,
   y **`push_subscriptions`** compartida.
2. **Tablas nuevas con prefijo propio** (config/log/cache incluidos). No pisar
   `users`/`tasks`/`messages`/`push_subscriptions`.
3. **Mismo sistema de diseño** (emerald+slate, Inter, radios, dark mode, componentes
   `ui/` idénticos, confirm in-app). La app fusionada se ve como **una sola**.
4. **Mismo patrón de datos:** UN `api()` + UN `transport.js` + UN `socket`. Tu app
   **agrega rutas y eventos**, no duplica clientes ni archivos. Nada de `fetch` suelto
   ni segundo cliente Supabase.
5. **Mismas convenciones:** es-AR, −03, IDs numéricos, offline-first, `ErrorBoundary`,
   optional chaining defensivo.
6. **Ruteo por rol** reutilizando el `AuthContext` y el guard, sin duplicar login.
7. **Cola offline con store propio:** `localforage.createInstance({ name: 'MG_<App>_PWA' })`
   para **no chocar** con el store de Tareas (`MG_Hogar_PWA`). La cola `syncQueue`
   puede unificarse en la fusión (una sola `flushSyncQueue`).
8. **Env `VITE_*`** en `config.js` (sólo `anon`, nunca `service_role`).

---

## 10. Checklist antes de dar por buena una pantalla nueva

- [ ] ¿Usa `api()`/`transport.js` (ningún `supabase.from` en el componente)?
- [ ] ¿Usa los `ui/` copiados + `cn`, y confirma con el modal in-app (no `window.confirm`)?
- [ ] ¿Emerald primario, slate neutro, **dark mode** por `prefers-color-scheme`?
- [ ] ¿Textos es-AR, fechas parseadas al mediodía, plata en $ AR?
- [ ] ¿Funciona sin conexión (mutaciones encoladas; GET con cache)?
- [ ] ¿Reutiliza `users`/auth/roles (login por username → `@mghogar.local`)?
- [ ] ¿Tablas con prefijo, RLS activada **con policy**, realtime en la publicación?
- [ ] ¿Datos sensibles fuera del acceso anon (sólo por RPC SECURITY DEFINER)?
- [ ] ¿Mobile-first, áreas seguras, animaciones livianas?

---

## 11. Errores comunes que cuestan tiempo (leé esto ANTES)

- **JSX en `.js` sin configurar Vite** → `yarn dev` rompe. Config exacta en §6
  (ojo: es `optimizeDeps.esbuildOptions`, no `esbuild`). Tareas NO tiene este
  problema porque todo su JSX vive en `.jsx` — lo más simple es imitar eso.
- **RLS activada sin policy** → todo falla "silencioso". Una policy **por tabla** (§3.3).
- **Olvidar la publicación de Realtime** → los eventos nunca llegan y creés que el
  socket está roto. `alter publication supabase_realtime add table <tabla>;`
- **Login por email en vez de username** → nadie entra. Es `emailFor(username)` (§3.2).
- **Reimplementar `auth.js`** con `login(email,password)` → el signIn va en `Login.jsx`;
  `auth.js` sólo persiste con `login(token, user)` (§3.2).
- **Encolar offline llamadas a RPC/Edge Functions** (geocode, etc.) → cuelgan la UI.
  Excluílas de la cola (`NO_QUEUE`).
- **Broadcast/`subscribe` de Realtime sin timeout** → botón "Publicando…" infinito.
  `Promise.race` con timeout; best-effort (§3.5).
- **`create or replace function` cambiando el tipo de retorno** → error 42P13.
  `drop function` primero (§3.3).
- **Deployar la Edge Function desde `frontend/`** → "Entrypoint path does not exist".
  Deployá desde la raíz del repo (§8).
- **Store de localforage con el mismo `name` que Tareas** → se pisan los datos offline.
  Usá `MG_<App>_PWA` (§9.7).
- **Separar `react` en su propio chunk** → warning *Circular chunk*. Sólo separá
  leaflet/framer-motion (§7.1).
- **Esperar que una notificación local suene con la app cerrada** para un evento del
  servidor → no pasa; eso necesita push del servidor (§7.2).
- **`Modal` con prop `open`** → es `isOpen`. **`CalendarPicker`** es
  `selectedDate`/`onSelectDate`. Copialos y mirá las props reales.

> Si todo esto se cumple, la app nueva se fusiona con Tareas de forma natural y el
> usuario final siente que **siempre fue una sola app**.

---

## 12. Fe de erratas — verificado contra el código real (07/07/2026)

Este documento se revisó línea por línea contra el código real de Tareas
(`sistema-tareas-mghogar/task-system/frontend`). Versiones anteriores del documento
afirmaban cosas que **no existen o no son así** en la app real. Quedan listadas acá
para que ninguna app futura las dé por ciertas ni pierda tiempo buscándolas:

**Cosas que el documento decía y NO existen en Tareas (si las querés, las creás vos):**

- `pendingCount()` en `api.js` — no existe (§3.1).
- La lista `NO_QUEUE` — no existe; Tareas encola TODA mutación fallida por red (§3.1).
- El componente `RequireRole` y la ruta `/login` — el guard es inline en `App.jsx` y el
  login vive en `/` (§3.2).
- `Confirm.jsx` / hook `useConfirm` en `components/ui/` — las confirmaciones de Tareas
  son modales ad-hoc (§5).
- Las utilidades `pb-safe`/`pt-safe` en `index.css` — no están (§2).
- `format.js` — no existe; es una recomendación (§2).
- `notify(title, body)` en `reminders.js` — no existe; los exports reales son
  `initReminders`, `syncReminders`, `notificationStatus`, `requestNotifications`,
  `isNative` (§7.2).
- JSX dentro de `auth.js` — falso: `auth.js` no tiene JSX y Tareas no necesita la
  config de Vite de §6 (aplica sólo si vos ponés JSX en `.js`).
- `Reorder` de framer-motion — Tareas no lo usa (§1).
- yarn 4.x vía corepack — falso: Tareas usa **yarn 1.22 (classic)** (§1).
- Tailwind vía plugin `@tailwindcss/vite` — falso: Tareas usa `@tailwindcss/postcss`
  con `postcss.config.js` (§1).

**Cosas que Tareas SÍ tiene pero NO hay que copiar (deuda/restos de versiones viejas):**

- `tailwind.config.js` estilo v3 — Tailwind v4 lo ignora; no lo copies (§1).
- `socket.io-client` en `package.json` — dependencia muerta; no la instales (§1).
- El `runtimeCaching` de la "API" con patrón `/api` — resto del backend Express, nunca
  matchea Supabase; escribí el patrón contra el host de Supabase (§7.1).
- El split `react-vendor` en `manualChunks` — en apps nuevas genera el warning
  *Circular chunk*; dejá react en `vendor` (§7.1).

**Moraleja:** antes de afirmar en este documento que un archivo, export o config existe,
**abrí el archivo real y verificalo**. Y al construir una app nueva, si un import de
esta guía no existe, revisá esta sección antes de asumir que rompiste algo.
