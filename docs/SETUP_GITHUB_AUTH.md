# Setup GitHub Auth — Qlick

> Estado: configurado el 2026-06-30. Persistente entre sesiones Mavis y reinicios de PC.

## Cómo verificar

Tres condiciones tienen que ser verdaderas para que `git push` funcione sin pedir credenciales:

```powershell
[System.Environment]::GetEnvironmentVariable('GH_TOKEN', 'User')  # debe empezar con github_pat_ o ghp_
git config --global credential.helper                                # debe devolver "store"
Test-Path "$env:USERPROFILE\.git-credentials"                       # debe ser True
```

Si alguna falla, ver **Recrear setup** abajo.

## Estado actual del setup

| Capa | Dónde | Qué contiene |
|---|---|---|
| **Windows env var (User scope)** | `HKCU\Environment\GH_TOKEN` | Fine-grained PAT de David |
| **Sesión actual** | `$env:GH_TOKEN` | Heredado del User scope al abrir proceso |
| **Git credential helper** | `git config --global credential.helper = store` | Git usa `~/.git-credentials` |
| **Archivo plano** | `~/.git-credentials` | URL con token para `https://github.com` |

## Por qué este setup

1. **Windows env var (User scope):** sobrevive reinicio de PC, cierre de apps, lo ven todos los procesos. Es la capa más fuerte.
2. **Git credential store:** funciona aunque la env var se borre. Es la capa de fallback.
3. **`~/.git-credentials`:** archivo en texto plano en home del usuario — git lo lee solo para URLs de github.com. NUNCA commitear (`.gitignore` lo excluye por default).

## Recrear setup (si algo se rompió)

Correr este script UNA vez:

```powershell
& "C:\Users\User\.mavis\scratchpads\mvs_9831e64ee9d4477d8632f5b78d4bf951\gh-setup-persistent.ps1"
```

Pega el token cuando te lo pida. El script:
- Setea `GH_TOKEN` como env var Windows User scope (persistente).
- Configura `git config --global credential.helper store`.
- Escribe `~/.git-credentials` con el token.
- Hace `git push origin feat/fase-6-hitos` para validar.
- Limpia la variable local.

## Fine-grained vs Classic

David usa **fine-grained PAT**. Diferencias importantes:

- Fine-grained: scope por repo, permisos granulares, expiración corta. Empieza con `github_pat_`.
- Classic: scopes amplios (`repo`, `workflow`, etc.), expiración hasta 1 año. Empieza con `ghp_`.

`gh auth login --with-token` **NO funciona con fine-grained** (fallo silencioso según la doc oficial). Usar siempre `$env:GH_TOKEN` o git credential helper.

## Permisos requeridos para el PAT

En `https://github.com/settings/personal-access-tokens/new`:

- **Repository access:** Only select repositories → `david17891/qlick`
- **Permissions:**
  - **Contents: Read and write** (necesario para `git push`)
  - **Metadata: Read-only** (default)
  - **Pull requests: Read and write** (opcional, para abrir PR desde gh)

Expiration: 90 días.

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `git push` pide user/pass | `.git-credentials` no existe | Correr el script |
| `fatal: could not read Username` | Ningún método configurado | Correr el script |
| `403 Permission denied` | Fine-grained PAT no tiene acceso al repo | Regenerar PAT con scope sobre david17891/qlick |
| `403 Resource not accessible by integration` | Token válido pero sin Contents: Read+write | Agregar permiso en GitHub UI |
| `gh auth status` no devuelve nada (silencio) | Normal cuando ya hay token — `gh` no siempre lo reporta | Verificar con el primer bloque de "Cómo verificar" arriba |
