#!/usr/bin/env pwsh
# scripts/set-gh-token.ps1
#
# Sincroniza GH_TOKEN entre Windows env var (HKCU\Environment) y el vault
# (~/.mavis/api-box.env). El vault es la fuente de verdad canonica; HKCU
# es lo que git + gh leen en runtime.
#
# Uso:
#   .\scripts\set-gh-token.ps1                  # Lee token del vault y lo escribe en HKCU
#   .\scripts\set-gh-token.ps1 -Token "ghp_..."  # Escribe el token nuevo en AMBOS
#   .\scripts\set-gh-token.ps1 -Show            # Muestra el length sin exponer el valor
#
# Por que existe:
#   - Los fine-grained PATs de GitHub NO usan el scope clasico workflow.
#     Requieren "Repository permissions → Actions: Read+write" en la config.
#   - El credential helper de `gh` cachea credenciales en disco y tiene
#     prioridad sobre las env vars. Para pushear con un token nuevo, hay
#     que limpiar el cache: `gh auth logout` o pasar el token en la URL
#     (`git push https://x-access-token:$GH_TOKEN@github.com/...`).
#   - HKCU\Environment se cachea por proceso. Para que una sesion Mavis
#     vea el token nuevo, hay que relanzarla.

[CmdletBinding()]
param(
    [Parameter()]
    [string]$Token,

    [Parameter()]
    [switch]$Show
)

$ErrorActionPreference = "Stop"
$vaultPath = Join-Path $env:USERPROFILE ".mavis/api-box.env"

function Get-TokenFromVault {
    if (-not (Test-Path $vaultPath)) {
        throw "Vault no encontrado: $vaultPath"
    }
    $line = Select-String -Path $vaultPath -Pattern "^GH_TOKEN=" | Select-Object -First 1
    if (-not $line) {
        throw "Vault no contiene GH_TOKEN"
    }
    return ($line.Line -replace '^GH_TOKEN=', '')
}

function Test-TokenShape {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Token vacio"
    }
    if ($Value.Length -lt 30) {
        throw "Token demasiado corto ($($Value.Length) chars). Esperado: 90+ para fine-grained PAT."
    }
    if ($Value -notlike "ghp_*" -and $Value -notlike "github_pat_*") {
        throw "Token no parece valido (no empieza con ghp_ o github_pat_). Prefijo: $($Value.Substring(0, [Math]::Min(15, $Value.Length)))"
    }
}

if ($Show) {
    $hkcu = [Environment]::GetEnvironmentVariable("GH_TOKEN", "User")
    $vault = if (Test-Path $vaultPath) { (Get-TokenFromVault) } else { "<no vault>" }
    Write-Host "HKCU\Environment\GH_TOKEN length: $($hkcu.Length)"
    Write-Host "Vault GH_TOKEN length: $($vault.Length)"
    if ($hkcu.Length -eq $vault.Length) {
        Write-Host "HKCU y vault en sincronia." -ForegroundColor Green
    } else {
        Write-Host "HKCU y vault DIFERENTES - corre el script sin flags para sincronizar." -ForegroundColor Yellow
    }
    return
}

if (-not $Token) {
    Write-Host "Leyendo token del vault: $vaultPath"
    $Token = Get-TokenFromVault
}

Test-TokenShape -Value $Token

# Escribir en HKCU\Environment (persistente, lo que git + gh leen en runtime)
[Environment]::SetEnvironmentVariable("GH_TOKEN", $Token, "User")
Write-Host "HKCU\Environment\GH_TOKEN actualizado: $($Token.Length) chars"

# Escribir/actualizar en el vault
if (Test-Path $vaultPath) {
    $content = Get-Content $vaultPath
    $newContent = $content | ForEach-Object {
        if ($_ -match "^GH_TOKEN=") { "GH_TOKEN=$Token" } else { $_ }
    }
    Set-Content -Path $vaultPath -Value $newContent
    Write-Host "Vault $vaultPath actualizado"
} else {
    Write-Warning "Vault no existe ($vaultPath). Solo se actualizo HKCU."
}

Write-Host ""
Write-Host "IMPORTANTE:"
Write-Host "  1. Cerrá TODAS las terminales PowerShell (incluyendo Mavis)"
Write-Host "     para que la nueva env var tome efecto en procesos nuevos."
Write-Host "  2. Si usas `gh` con credential helper, hace `gh auth logout` para"
Write-Host "     limpiar el cache (sino git ignora la nueva env var)."
Write-Host "  3. Para fine-grained PATs (github_pat_*), recorda:"
Write-Host "     - NO usan scope 'workflow' clasico."
Write-Host "     - Necesitan 'Repository permissions → Actions: Read+write'."
Write-Host "     - Sin eso, push a .github/workflows/ falla con 'without workflow scope'."
