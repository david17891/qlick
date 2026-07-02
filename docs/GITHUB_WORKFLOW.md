# Git & GitHub Workflow — Qlick Marketing Integral

> **Fuente canónica.** Este doc es la fuente de verdad para branching,
> commits y PRs en Qlick. El índice cross-cutting para AI agents vive en
> `.harness/docs/project-standards.md` (§5 Branching + commits + PRs), y
> el scope del rein que opera código de producto en `.harness/reins/developer/agent.md`.
> Si hay conflicto, gana este doc.

Convenciones para trabajar con Git y GitHub de forma ordenada y colaborativa.

## Configuración inicial

```bash
git init
git add .
git commit -m "chore: bootstrap Qlick LMS (MVP fase 0)"
git branch -M main
git remote add origin <tu-repo-en-github>
git push -u origin main
```

## Modelo de ramas

| Rama          | Uso                                         |
| ------------- | ------------------------------------------- |
| `main`        | Producción. Siempre estable y desplegable.   |
| `develop`     | Integración de features para la próxima release. |
| `feature/*`   | Nueva funcionalidad. Ej: `feature/checkout`. |
| `fix/*`       | Corrección de bug. Ej: `fix/login-redirect`. |
| `docs/*`      | Solo documentación. Ej: `docs/roadmap-fase-2`. |
| `refactor/*`  | Refactor sin cambio de comportamiento.      |
| `chore/*`     | Tareas de mantenimiento (deps, config).     |

### Flujo recomendado

1. Partir de `develop` (o `main` si aún no hay `develop`):
   ```bash
   git checkout develop
   git pull
   git checkout -b feature/mi-funcionalidad
   ```
2. Commits atómicos y frecuentes.
3. Push de la rama y abrir PR contra `develop`.
4. Revisión + CI verde → merge.
5. Periódicamente, `develop` → `main` mediante PR de release.

## Convención de commits

Formato **Conventional Commits**, en español o inglés (mantener consistencia
dentro del repo). Áreas sugeridas:

```
<tipo>(<área>): <descripción corta>
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `chore`, `style`, `test`, `perf`.

### Ejemplos

```
feat(cursos): agregar página de detalle con SSG
fix(login): redirigir a dashboard tras auth mock
docs(payments): documentar flujo de webhook
refactor(video): extraer interfaz VideoProvider
chore(deps): actualizar next a 14.2.5
style(brand): ajustar altura del logo en navbar
```

### Reglas para commits atómicos

- Un commit = un cambio lógico.
- No mezclar refactor con feature.
- Si un cambio toca muchas áreas, probablemente son varios commits.
- Mensaje en imperativo: "agregar" no "agregado".
- Línea 1 ≤ 72 caracteres. Cuerpo opcional tras línea en blanco.

## Pull Requests

- Título descriptivo, siguiendo la convención de commits.
- Descripción con: qué cambia, por qué, cómo probarlo.
- Adjuntar capturas si hay cambio visual.
- Asignar al menos 1 revisor.
- Esperar CI verde antes de merge.

### Template sugerido (`.github/pull_request_template.md`)

```markdown
## ¿Qué cambia?
<!-- resumen breve -->

## ¿Por qué?
<!-- contexto y motivación -->

## ¿Cómo probarlo?
1. ...
2. ...

## Checklist
- [ ] `npm run lint` pasa
- [ ] `npm run build` pasa
- [ ] Tipos cubiertos / sin `any` nuevo
- [ ] Documentación actualizada si aplica
```

## Issues

Usar labels para clasificar:

- `bug` · `feature` · `enhancement` · `docs` · `question`
- `fase-1` · `fase-2` · `fase-3` · `fase-4` (según roadmap)
- `prioridad:alta` · `prioridad:media` · `prioridad:baja`
- `buen-primer-issue` para tareas onboarding

## CI (recomendado para Fase 1)

Crear `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run build
```

## Despliegue en Vercel

1. Conectar el repo en vercel.com.
2. Framework preset: **Next.js** (autodetectado).
3. Variables de entorno: copiar de `.env.example` las necesarias.
4. Rama de producción: `main`.
5. Preview deployments automáticos por PR (rama `develop` / features).

El build de Vercel corre automáticamente `next build`, que ya pasa en local.

## Secretos y variables

- **Nunca** commitear `.env.local` (ya está en `.gitignore`).
- Usar GitHub Secrets para CI y Vercel env vars para producción.
- Variables públicas (prefijo `NEXT_PUBLIC_`) se exponen al cliente: no poner
  secretos ahí.
