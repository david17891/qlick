# setup-whatsapp-vars.ps1
# Sube las 4 vars de WhatsApp Cloud API a Vercel production.
# Las 3 IDs estan hardcoded (no cambian). El token se pide al operador.

$ErrorActionPreference = "Stop"
$projectRoot = "C:\Users\User\Documents\Click"
$envName = "production"

Write-Host "=== Setup WhatsApp Cloud API vars en Vercel production ===" -ForegroundColor Cyan
Write-Host ""

# IDs hardcoded (del WABA 1670509767335938 + App Qlick_wb 1532987041600498)
$phoneNumberId = "1224238960768919"
$appId = "1532987041600498"
$wabaId = "1670509767335938"

# 1. Borrar las vars vacias que quedaron de la sesion anterior.
Write-Host "Paso 1/3: Borrando vars vacias existentes..." -ForegroundColor Yellow
foreach ($var in @("WHATSAPP_CLOUD_ACCESS_TOKEN", "WHATSAPP_CLOUD_PHONE_NUMBER_ID", "WHATSAPP_CLOUD_APP_ID", "WHATSAPP_CLOUD_WABA_ID")) {
    Write-Host "  rm $var..." -NoNewline
    vercel env rm $var $envName --cwd $projectRoot 2>&1 | Out-Null
    Write-Host " OK" -ForegroundColor Green
}

# 2. Pedir el token al operador (NO se loggea).
Write-Host ""
Write-Host "Paso 2/3: Pegando vars nuevas..." -ForegroundColor Yellow
Write-Host "  Cuando pregunta 'What's the value?' pega el token (215 chars, empieza con EAA)." -ForegroundColor Gray
Write-Host ""

# Token: lo pide interactivamente
Write-Host "  add WHATSAPP_CLOUD_ACCESS_TOKEN..." -ForegroundColor Gray
vercel env add WHATSAPP_CLOUD_ACCESS_TOKEN $envName --cwd $projectRoot
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR agregando ACCESS_TOKEN. Abortando." -ForegroundColor Red
    exit 1
}

# IDs hardcoded via pipe (non-interactive)
Write-Host "  add WHATSAPP_CLOUD_PHONE_NUMBER_ID..." -ForegroundColor Gray
$phoneNumberId | vercel env add WHATSAPP_CLOUD_PHONE_NUMBER_ID $envName --cwd $projectRoot 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR agregando PHONE_NUMBER_ID. Abortando." -ForegroundColor Red
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

Write-Host "  add WHATSAPP_CLOUD_APP_ID..." -ForegroundColor Gray
$appId | vercel env add WHATSAPP_CLOUD_APP_ID $envName --cwd $projectRoot 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR agregando APP_ID. Abortando." -ForegroundColor Red
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

Write-Host "  add WHATSAPP_CLOUD_WABA_ID..." -ForegroundColor Gray
$wabaId | vercel env add WHATSAPP_CLOUD_WABA_ID $envName --cwd $projectRoot 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR agregando WABA_ID. Abortando." -ForegroundColor Red
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# 3. Verificar que estan todas.
Write-Host ""
Write-Host "Paso 3/3: Verificando..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Vars de WhatsApp en production:" -ForegroundColor Cyan
vercel env ls $envName --cwd $projectRoot 2>&1 | Select-String "WHATSAPP"

Write-Host ""
Write-Host "=== Listo. Avisame y yo corro el redeploy desde aca. ===" -ForegroundColor Cyan