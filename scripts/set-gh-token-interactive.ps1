#!/usr/bin/env pwsh
# scripts/set-gh-token-interactive.ps1
#
# Sincroniza GH_TOKEN entre Windows env var (HKCU\Environment) y el vault
# (~/.mavis/api-box.env). Input seguro con -AsSecureString para que el
# token NO quede visible en pantalla ni en transcript de PowerShell.
#
# Uso recomendado (David):
#   1. .\scripts\set-gh-token-interactive.ps1
#   2. Te pide el token (input oculto, no aparece en pantalla)
#   3. Lo valida y lo escribe en HKCU\Environment + vault
#   4. Te avisa cuando esta listo
#
# Por que existe:
#   - Los fine-grained PATs de GitHub NO usan el scope clasico workflow.
#     Requieren "Repository permissions - Actions: Read+write" en la config.
#   - El credential helper de `gh` cachea credenciales en disco y tiene
#     prioridad sobre las env vars. Para pushear con un token nuevo, hay
#     que limpiar el cache: `gh auth logout`.
#   - HKCU\Environment se cachea por proceso. Para que una sesion Mavis
#     vea el token nuevo, hay que relanzarla.

[CmdletBinding()]
param(
    [Parameter()]
    [string]$Token,

    [Parameter()]
    [switch]$Show,

    [Parameter()]
    [switch]$Interactive
)

$ErrorActionPreference = "Stop"
$vaultPath = Join-Path $env:USERPROFILE ".mavis/api-box.env"

function Test-TokenShape {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Token vacio. Abortando."
    }
    if ($Value.Length -lt 30) {
        throw "Token demasiado corto ($($Value.Length) chars). Esperado: 90+ para fine-grained PAT, 40 para classic."
    }
    if ($Value -notlike "ghp_*" -and $Value -notlike "github_pat_*") {
        throw "Token no parece valido. Esperado: empieza con ghp_ (classic) o github_pat_ (fine-grained). Prefijo leido: $($Value.Substring(0, [Math]::Min(15, $Value.Length)))"
    }
    $type = if ($Value.StartsWith("github_pat_")) { "fine-grained" } else { "classic" }
    Write-Host "  Tipo: $type PAT ($($Value.Length) chars)"
}

function Read-TokenFromStdin {
    Write-Host ""
    Write-Host "Pegar el token COMPLETO. Input oculto (no aparece en pantalla, no queda en transcript)." -ForegroundColor Cyan
    Write-Host "Para cancelar: Ctrl+C o dejar vacio y Enter." -ForegroundColor Cyan
    Write-Host ""
    $secure = Read-Host -Prompt "Token" -AsSecureString
    if ($null -eq $secure) {
        throw "Entrada cancelada."
    }
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Read-TokenFromVault {
    if (-not (Test-Path $vaultPath)) {
        throw "Vault no encontrado: $vaultPath"
    }
    $line = Select-String -Path $vaultPath -Pattern "^GH_TOKEN=" | Select-Object -First 1
    if (-not $line) {
        throw "Vault no contiene GH_TOKEN"
    }
    # FIX 2026-07-06: el vault guarda el valor con comillas (formato .env
    # estandar). Strippeamos ambas comillas antes de validar/usar.
    $raw = $line.Line -replace '^GH_TOKEN=', ''
    return $raw.Trim().Trim('"').Trim("'")
}

function Write-TokenToHKCU {
    param([string]$Value)
    [Environment]::SetEnvironmentVariable("GH_TOKEN", $Value, "User")
}

function Write-TokenToVault {
    param([string]$Value)
    if (-not (Test-Path $vaultPath)) {
        Write-Warning "Vault no existe, solo se actualizo HKCU. La proxima vez que se ejecute sin -Token, vault seguira viejo."
        return
    }
    $content = Get-Content $vaultPath
    $newContent = $content | ForEach-Object {
        if ($_ -match "^GH_TOKEN=") { "GH_TOKEN=$Value" } else { $_ }
    }
    Set-Content -Path $vaultPath -Value $newContent
}

if ($Show) {
    Write-Host "--- Estado actual de GH_TOKEN ---" -ForegroundColor Cyan
    $hkcu = [Environment]::GetEnvironmentVariable("GH_TOKEN", "User")
    if ($hkcu) {
        Write-Host "HKCU\Environment\GH_TOKEN length: $($hkcu.Length)"
        Write-Host "Prefix: $($hkcu.Substring(0, [Math]::Min(15, $hkcu.Length)))..."
    } else {
        Write-Host "HKCU\Environment\GH_TOKEN: NULL (no seteado)" -ForegroundColor Yellow
    }
    if (Test-Path $vaultPath) {
        $vaultVal = Read-TokenFromVault
        Write-Host "Vault GH_TOKEN length: $($vaultVal.Length)"
        Write-Host "Vault prefix: $($vaultVal.Substring(0, [Math]::Min(15, $vaultVal.Length)))..."
    } else {
        Write-Host "Vault: no existe ($vaultPath)"
    }
    return
}

if (-not $Token) {
    if ($Interactive -or -not $env:GH_TOKEN) {
        $Token = Read-TokenFromStdin
    } else {
        Write-Host "Leyendo token del vault (sincronizando HKCU <- vault)..." -ForegroundColor Cyan
        $Token = Read-TokenFromVault
    }
}

Write-Host ""
Write-Host "Validando token..." -ForegroundColor Cyan
Test-TokenShape -Value $Token

Write-Host ""
Write-Host "Escribiendo en HKCU\Environment..." -ForegroundColor Cyan
Write-TokenToHKCU -Value $Token
Write-Host "  OK" -ForegroundColor Green

Write-Host "Escribiendo en vault..." -ForegroundColor Cyan
Write-TokenToVault -Value $Token
Write-Host "  OK ($vaultPath)" -ForegroundColor Green

Write-Host ""
Write-Host "Verifico escritura..." -ForegroundColor Cyan
$verify = [Environment]::GetEnvironmentVariable("GH_TOKEN", "User")
if ($verify.Length -eq $Token.Length) {
    Write-Host "  HKCU length: $($verify.Length) - OK" -ForegroundColor Green
} else {
    Write-Host "  HKCU length: $($verify.Length) - esperado: $($Token.Length) - FAIL" -ForegroundColor Red
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "Token escrito en HKCU + vault." -ForegroundColor Green
Write-Host ""
Write-Host "PROXIMOS PASOS (vos):"
Write-Host "  1. Cerrá TODAS las terminales PowerShell (incluyendo la sesion Mavis actual)."
Write-Host "  2. Abrí una nueva sesion Mavis para que tome la nueva env var."
Write-Host ""
Write-Host "NOTAS:"
Write-Host "  - Para fine-grained PATs (github_pat_*): NO usan scope workflow clasico."
Write-Host "    Necesitan 'Repository permissions - Actions: Read+write' en la config del token."
Write-Host "  - Si usas gh CLI, corré 'gh auth logout' para limpiar el cache de credenciales."
Write-Host "  - El script set-gh-token-interactive.ps1 NUNCA loggea el valor del token."
Write-Host "==============================================" -ForegroundColor Green
