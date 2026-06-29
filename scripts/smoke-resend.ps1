# scripts/smoke-resend.ps1
# Carga vars de Resend desde .env.local al proceso actual y corre el smoke test.
# Bypassea npx/dotenv-cli (que en PowerShell se pelean con `--eval` y quoting).
#
# Uso:
#   pwsh -File scripts/smoke-resend.ps1
#
# Si `pwsh` no estÃ¡ en PATH, probar:
#   powershell -ExecutionPolicy Bypass -File scripts/smoke-resend.ps1
#
# Variable opcional:
#   $env:SMOKE_RESEND_TO = "otro@email.com"   # override del destinatario

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile     = Join-Path $projectRoot ".env.local"
$scriptPath  = Join-Path $PSScriptRoot "smoke-resend.mjs"

if (-not (Test-Path $envFile)) {
  Write-Error "[smoke-resend] No existe $envFile"
  exit 1
}
if (-not (Test-Path $scriptPath)) {
  Write-Error "[smoke-resend] No existe $scriptPath"
  exit 1
}

# Cargar SOLO las 4 vars que necesita el wrapper (mÃ­nimo privilegio).
$keys = @(
  "RESEND_API_KEY"
  "RESEND_FROM_ADDRESS"
  "RESEND_REPLY_TO"
  "ADMIN_NOTIFICATION_EMAILS"
)

foreach ($key in $keys) {
  $line = Select-String -Path $envFile -Pattern ("^" + [regex]::Escape($key) + "=")
  if ($line) {
    $value = ($line.Line -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if ($value) {
      # Scope "Process" garantiza que child processes (node) lo hereden.
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    } else {
      Write-Warning "[smoke-resend] $key estÃ¡ vacÃ­o en .env.local"
    }
  } else {
    Write-Warning "[smoke-resend] $key no aparece en .env.local"
  }
}

Write-Host ""
Write-Host "[smoke-resend] VerificaciÃ³n (deberÃ­an NO estar vacÃ­as):" -ForegroundColor Cyan
Write-Host "  RESEND_API_KEY length = $($env:RESEND_API_KEY.Length)"
Write-Host "  RESEND_FROM_ADDRESS   = $env:RESEND_FROM_ADDRESS"
Write-Host "  RESEND_REPLY_TO       = $env:RESEND_REPLY_TO"
Write-Host ""

# Correr el smoke. node hereda las env vars que acabamos de setear.
Write-Host "[smoke-resend] Ejecutando smoke test..." -ForegroundColor Cyan
node --experimental-strip-types $scriptPath
exit $LASTEXITCODE
