# Probar MG Hogar APK en BlueStacks (Windows)

APK a probar: `MG-Hogar-release.apk` (firmado, release).
Ubicación: `C:\SYB\task-system\frontend\MG-Hogar-release.apk`

---

## 1. Instalar BlueStacks

1. Descargá BlueStacks 5 desde https://www.bluestacks.com/ (botón **Download**).
2. Ejecutá el instalador y seguí los pasos (Next → Install). Tarda unos minutos.
3. Abrí BlueStacks. La primera vez tarda en arrancar el motor de Android.
   - Si te pide iniciar sesión con una cuenta de Google, **podés saltarlo** (Skip). No hace falta para instalar un APK manual.

> Recomendado: en **Settings → Engine**, dejá el perfil de Android en **Android 11 (Pie/Nougat o superior)**. Esta app requiere Android 7.0 (API 24) como mínimo, así que cualquier perfil moderno de BlueStacks sirve.

---

## 2. Instalar el APK (3 formas, cualquiera funciona)

### Opción A — Arrastrar y soltar (la más rápida)
1. Abrí la carpeta `C:\SYB\task-system\frontend\` en el Explorador de Windows.
2. Con BlueStacks abierto, **arrastrá** el archivo `MG-Hogar-release.apk` y soltalo encima de la ventana de BlueStacks.
3. Esperá el cartel "App installed".

### Opción B — Botón "Install APK"
1. En la pantalla principal de BlueStacks, buscá el ícono **Install APK** (esquina inferior derecha, ícono de una flecha hacia abajo / caja).
2. Navegá hasta `C:\SYB\task-system\frontend\MG-Hogar-release.apk` y abrilo.

### Opción C — Doble clic
1. Hacé doble clic sobre `MG-Hogar-release.apk` en Windows.
2. Si BlueStacks está asociado a archivos `.apk`, se instalará solo. (Si Windows pregunta con qué abrirlo, elegí BlueStacks.)

---

## 3. Abrir la app

1. Volvé a la pantalla de inicio de BlueStacks (Home).
2. Vas a ver el ícono **MG Hogar**. Hacé clic para abrirla.
3. La app es una PWA empaquetada con Capacitor: carga su interfaz local y se conecta al backend por internet.

---

## 4. Notas importantes

- **Internet / backend:** la app necesita conexión para login, registro y sincronización (usa Supabase/API). BlueStacks usa la conexión de tu PC, así que debería funcionar directamente. Si la API apunta a `localhost`, no será accesible desde BlueStacks (es otra "máquina"); en ese caso configurá `VITE_API_URL` a una URL pública/IP de tu PC y recompilá.
- **`usesCleartextTraffic` está activado**, así que la app puede hablar con endpoints HTTP (no solo HTTPS) si hiciera falta.
- **Es la versión release firmada**, no debug: certificado `CN=MG Hogar`. Se instala igual que cualquier APK normal.
- Si BlueStacks dice "App not installed", desinstalá cualquier versión previa de MG Hogar dentro de BlueStacks y reintentá (un APK firmado con otra clave no se puede instalar encima).

---

## 5. Datos técnicos del APK

| Dato | Valor |
|------|-------|
| Archivo | `MG-Hogar-release.apk` |
| Package | `com.mghogar.tareas` |
| Versión | 1.0 (versionCode 1) |
| Tamaño | ~3.84 MB |
| Android mínimo | 7.0 (API 24) |
| Android target | 14 (API 34) |
| Firma | Release (CN=MG Hogar) — **no debug** |
| Tipo | APK universal (sin splits de ABI/densidad/idioma) |
