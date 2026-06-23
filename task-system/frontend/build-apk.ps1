# build-apk.ps1 — genera el APK de MG Hogar (offline-first + Capacitor)
# Uso:   powershell -ExecutionPolicy Bypass -File build-apk.ps1
# Opcional: setear la URL de la API antes (si no, usa el .env / localhost):
#   $env:VITE_API_URL = "https://TU-PROYECTO.supabase.co/rest/v1"

$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = 'C:\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'C:\Android\Sdk'

Set-Location $PSScriptRoot

Write-Host "==> 1/4 Build web (vite, comprimido)" -ForegroundColor Cyan
npm run build

Write-Host "==> 2/4 Copiar assets web al proyecto Android" -ForegroundColor Cyan
npx cap copy android

Write-Host "==> 3/4 Compilar APK (Gradle)" -ForegroundColor Cyan
Set-Location "$PSScriptRoot\android"
.\gradlew.bat assembleDebug

$apk = "$PSScriptRoot\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host "==> 4/4 Listo" -ForegroundColor Green
if (Test-Path $apk) {
  $mb = [math]::Round((Get-Item $apk).Length / 1MB, 2)
  Copy-Item $apk "$PSScriptRoot\MG-Hogar.apk" -Force
  Write-Host "APK: $PSScriptRoot\MG-Hogar.apk  ($mb MB)" -ForegroundColor Green
} else {
  Write-Host "No se encontro el APK en $apk" -ForegroundColor Red
}
