# E2E Tour con Playwright MCP — 2026-06-25

Tour visual de los flujos críticos del LMS. Sin framework de tests — solo navegación + screenshots como evidencia.

**Fecha de ejecución**: 2026-06-25
**Branch**: `feature/lms-real-foundation`
**Viewport**: 1440 × 900 (desktop)
**Modo Supabase**: real (seed cargado en la sesión anterior)

---

## Tabla de screenshots

| # | Archivo | URL | Qué valida | Resultado |
|---|---|---|---|---|
| 01 | `01-home.png` | `/` | Landing público con hero y CTAs | ✅ |
| 02 | `02-cursos-grid.png` | `/cursos` | Catálogo con los 4 cursos desde DB | ✅ |
| 03 | `03-curso-detalle.png` | `/cursos/fundamentos-marketing-digital` | Detalle con módulos y lecciones desde DB | ✅ |
| 04 | `04-qr-endpoint.png` | `/api/qr/fundamentos-marketing-digital` | Endpoint devuelve PNG (512×512) | ✅ |
| 05 | `05-inscripcion-qr.png` | `/inscripcion/fundamentos-marketing-digital?ref=qr` | Landing de inscripción con preview + badge "vía QR" | ✅ |
| 06 | `06-login.png` | `/login` | Botón "Continuar con Google" | ✅ |
| 07 | `07-dashboard-redirect.png` | `/dashboard` (sin sesión) | **Redirige a `/login`** (mismo screenshot que #06, evidencia del redirect) | ✅ |

---

## Validaciones cruzadas con la DB real

Más allá del HTML renderizado, validé **directamente contra Supabase** con un script temporal (borrado después del check) usando el service role key:

```
=== courses (4) ===
  1. [published★] fundamentos-marketing-digital     (85775a71-9dde-4998-98fc-5dc554e0d3be)
  2. [published★] publicidad-facebook-instagram-ads (30edc07a-9149-4b27-9da3-5436b1770719)
  3. [published]    automatizacion-ventas-whatsapp-crm     (ca80312b-daa7-4754-ad45-c85cfe169ce5)
  4. [published]    creacion-contenido-redes-sociales      (f9fdca80-2a8d-4212-a85d-aa4acb5dbf74)
=== modules: 12 | lessons: 36 ===
=== módulos de fundamentos-marketing-digital (3) ===
  M1: Módulo 1 · Mentalidad estratégica  (3 lecciones)
  M2: Módulo 2 · Canales y mensajes      (3 lecciones)
  M3: Módulo 3 · Medición y plan de 90 días  (3 lecciones)
```

**Cross-check con `/cursos`**: los 4 slugs renderizados en el HTML del catálogo coinciden 1:1 con los slugs reales de la DB. Mock y seed comparten títulos por diseño (deuda #3 documentada), pero el contenido del HTML viene de Supabase.

---

## Lo que NO se cubre (limitaciones conocidas)

1. **OAuth con Google real** — el tour llega a `/login` y al botón "Continuar con Google" pero **no hace clic**. Google bloquea bots en el consent screen. Para validar el flujo post-OAuth (inscripción real con `source=qr`, dashboard con sesión) hace falta `NEXT_PUBLIC_AUTH_MODE=mock` o `@playwright/test` con Supabase mockeado.
2. **Pantallas mobile** — el tour es solo desktop (1440×900). Para validar responsive habría que cambiar viewport explícitamente.
3. **Estados de error** — no probé 404, 500, ni rate-limit. Para esos casos hace falta framework.

---

## Cómo se generaron

```powershell
# Pre-requisitos
npm run dev   # dev server en :3000

# Por cada URL:
mavis mcp call playwright browser_navigate --stdin   # stdin = '{"url":"..."}'
mavis mcp call playwright browser_take_screenshot --stdin   # stdin = '{"type":"png","filename":"...","fullPage":true}'
```

Truco: usar `--stdin` con `echo '{...}' |` es más confiable que `--args` con quotes anidadas (PowerShell las rompe).

---

## Próximo paso

**Fase 2 (cuando haya CI real)**: instalar `@playwright/test` con fixtures que mockean Supabase + un test que cubre el happy path de inscripción con `source=qr`. Esto requiere:

- Setup del framework (~30 min)
- Mockear Supabase en tests (~20 min)
- Configurar CI workflow (~20 min)

**No urge** hasta que tengamos CI en GitHub Actions. Por ahora, las screenshots de este tour son evidencia suficiente para validar visualmente cada cambio de UI.

Mientras tanto, opciones para la **próxima pieza del roadmap**:

- **#6 — Onboarding del alumno** (post-inscripción, guiar a la primera lección)
- **#5 — Pagos** (decisión de adaptador: MercadoPago / Stripe / Conekta)