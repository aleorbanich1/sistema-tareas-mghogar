# MG Hogar — APK: cómo generarlo, instalarlo y usarlo

App offline-first (React + Vite PWA) envuelta con **Capacitor**. Liviana (~pocos MB),
corre en celulares de gama baja. Funciona sin internet: las acciones se guardan en el
celular y se sincronizan solas al volver la conexión.

---

## 0. Antes que nada: la URL de la API

Dentro del APK, `localhost` = el propio celular, **no** tu PC. La app debe apuntar a
una URL accesible desde el dispositivo. Editá `frontend/.env` (o exportá la variable):

```
VITE_API_URL=https://TU-PROYECTO.supabase.co/rest/v1   # cuando conectes Supabase
# o, red local (mismo WiFi):
VITE_API_URL=http://192.168.1.45:3000/api
```

Cada vez que cambies la URL → volvé a generar el APK (paso 1).

---

## 1. Generar el APK

Desde `frontend/`:

```powershell
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

Resultado: **`frontend/MG-Hogar.apk`**. Ese archivo es el que instalás/compartís.

> Es un APK *debug* (firmado automáticamente) → se instala sin trámites. Para subir a
> Google Play hace falta firmar release con keystore propio (no necesario para uso interno).

---

## 2. Instalar en tu celular Android

**Opción A — por cable USB (la más simple):**
1. Conectá el celular a la PC por USB.
2. Copiá `MG-Hogar.apk` a la memoria del celular.
3. En el celular, abrí el archivo con el explorador → "Instalar".
4. Si aparece "App no permitida / orígenes desconocidos" → Permitir para esa app.

**Opción B — por link/WhatsApp/Drive:**
1. Subí `MG-Hogar.apk` a Drive o mandátelo por WhatsApp.
2. En el celular descargalo y tocá "Instalar".
3. Aceptá "instalar de orígenes desconocidos" si lo pide.

**Opción C — por adb (si tenés el cable y depuración USB activada):**
```powershell
C:\Android\Sdk\platform-tools\adb.exe install -r "C:\SYB\task-system\frontend\MG-Hogar.apk"
```

Para cada empleado: solo pasale el `.apk` y que repita la Opción A o B. Mismo archivo
sirve para cualquier celular Android (cualquier gama).

---

## 3. Usar la app

1. Abrí "MG Hogar" (ícono en el cajón de apps).
2. Login con tu usuario (ej: `ale` / `empleado1`).
3. Socio: crea/edita/borra tareas. Empleado: completa o marca fallidas.
4. **Sin internet:** podés operar igual; arriba la app guarda los cambios y los sube
   cuando vuelve la conexión. (Lectura offline = última info cacheada.)

---

## 4. Usar desde BlueStacks (en la PC)

BlueStacks = emulador de Android para Windows. Sirve para usar el mismo APK en la PC.

1. Instalá BlueStacks desde https://www.bluestacks.com (gratis).
2. Abrí BlueStacks y esperá que cargue Android.
3. Instalá el APK de cualquiera de estas formas:
   - **Arrastrar y soltar:** arrastrá `MG-Hogar.apk` a la ventana de BlueStacks, o
   - **Botón "Instalar APK":** en la barra lateral derecha → "Instalar apk" → elegí `MG-Hogar.apk`, o
   - Doble clic en el `.apk` y elegí abrir con BlueStacks.
4. Se instala "MG Hogar" en la pantalla de inicio de BlueStacks → clic para abrir.
5. Login y usar igual que en el celular.

> Nota red en BlueStacks: si la API está en `localhost` de tu PC, dentro de BlueStacks
> `localhost` es el Android virtual, no Windows. Usá la IP LAN de la PC (ej `192.168.1.45`)
> o, mejor, la URL pública/Supabase. Lo mismo que en el celular.

---

## Resumen de decisiones técnicas

- **Capacitor** (no TWA): mete los assets dentro del APK → arranca rápido y offline sin depender de un host.
- **Outbox offline** (`src/utils/outbox.js`): escrituras sin red → cola en localStorage → replay al reconectar.
- **URL configurable** (`src/utils/config.js` + `.env`): listo para apuntar a Supabase sin tocar código.
- **APK debug firmado**: instala por sideload en cualquier gama y en BlueStacks, sin keystore.
