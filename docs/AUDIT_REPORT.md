# Auditoría técnica y de estabilidad — Qlick Marketing Integral (MVP Fase 0)

**Fecha:** 2026-06-23
**Commit base:** `243a499` (rama `main`)
**Alcance:** revisión técnica, de marca y de estabilidad del MVP. No incluye
conexión de Supabase, pagos reales ni video pro (fuera de alcance por decisión).

---

## Resumen ejecutivo

El MVP es **sólido y navegable de punta a punta**. Esta auditoría cerró tres tipos
de deudas que el bootstrap inicial arrastraba: (1) inconsistencias de naming de
marca, (2) elementos interactivos que parecían funcionar pero no hacían nada, y
(3) un problema de marca potencialmente visible (PNGs blancos opacos sobre fondos
oscuros). Tras las correcciones, el build pasa, no quedan links muertos y la
marca se renderiza de forma segura en todos los contextos.

| Métrica | Antes | Después |
| ------- | ----- | ------- |
| `variant="white"` sobre fondos oscuros | 2 usos | 0 |
| `href="#"` / `action="#"` residuales | varios | 0 (`audit:links` limpio) |
| Botones admin sin handler | 3 | 3 marcados `disabled (demo)` |
| Recursos con `url:"#"` sin distinguir | 4 | 4 con badge demo/próximamente |
| Emails con dominio `@click.com` | 3 | 0 (ahora `@qlick.com`) |
| Capa de contacto | inexistente | `src/lib/contact/` + 2 componentes |

---

## Hallazgos

### Críticos

**C-1 · Assets blancos opacos sobre fondos oscuros.**
Los PNG `white/*` no tienen canal alfa (`colorType: 2`, RGB opaco). Usarlos sobre
fondos oscuros (`bg-brand-gradient`) producía un "rectángulo opaco" visible en
footer y CTA del home.
**Mitigación:** nuevo componente `<BrandLockup variant="dark">` (isotipo morado
transparente + texto "Qlick" tipográfico blanco). Footer y CTA migrados. Ver
`BRAND_ASSET_AUDIT.md`.

### Medios

**M-1 · Naming de marca inconsistente.**
Los emails demo usaban `@click.com` pese a la marca ser "Qlick" (D-001).
Corregido a `@qlick.com` en `users.ts`, `login/page.tsx`, `mock-auth.ts`.

**M-2 · Formulario de contacto sin backend.**
`action="#"` → componente `<ContactForm/>` con proveedor `mock` activo. Ver
`CONTACT_AND_WHATSAPP_STRATEGY.md`.

**M-3 · Botones/elementos "fantasma".**
Botones admin sin `onClick`, recursos con `url:"#"`, WhatsApp sin configurar.
Todos marcados explícitamente como demo/pendiente. Ver `FUNCTIONAL_QA_REPORT.md`.

### Menores

**m-1 · Next.js 14.2.5 tiene advisory de seguridad.**
Recomendado bump a `14.2.x` parcheada más reciente. No bloqueante para el MVP
(sin datos sensibles ni SSR con input externo). Documentado para la próxima
sesión de mantenimiento.

**m-2 · Assets `white/*` pesan 850–970 KB sin optimizar.**
No se usan directo en producción, pero conviene optimizarlos o pedir SVGs. Ver
`BRAND_ASSET_AUDIT.md`.

---

## Cambios aplicados

### Marca y estabilidad

- `src/lib/brand-manifest.ts`: estructura enriquecida (cada asset = objeto con
  `background`, dimensiones, usos recomendados/evitados, notas + bloque `audit`).
- `src/components/brand/Logo.tsx`: `resolveAssetSrc()` adaptado; añadido
  `BrandLockup` (uso seguro sobre fondos oscuros) y `Isotipo`.
- `src/components/brand/index.ts`: exporta `BrandLockup`.
- `src/components/layout/Footer.tsx`: usa `BrandLockup variant="dark"`.
- `src/app/page.tsx`: CTA final usa `<Isotipo>` (morado transparente).

### Naming

- `src/lib/data/users.ts`, `src/app/login/page.tsx`, `src/lib/auth/mock-auth.ts`:
  emails `@qlick.com`.

### Contacto

- Nuevo `src/lib/contact/` (6 archivos): `ContactProvider` + `mock` activo +
  `resend`/`crm` stubs + `whatsapp.ts` + `index.ts`.
- Nuevo `src/components/contact/`: `ContactForm.tsx`, `WhatsAppButton.tsx`.
- WhatsApp integrado en Home, Contacto, Curso detalle, Dashboard, LessonView (×2).
- `.env.example`: vars de contacto y WhatsApp añadidas.

### Transparencia funcional

- `src/components/admin/AdminView.tsx`: 3 botones → `disabled (demo)`.
- `src/components/course/LessonView.tsx`: recursos distinguen real vs demo.
- `src/app/contacto/page.tsx`: `<ContactForm/>` reemplaza `action="#"`; `tel:`/
  `mailto:` reales.

### Tooling

- `scripts/audit-links.mjs`: escáner de links/botones sin dependencias.
- `package.json`: `"audit:links": "node scripts/audit-links.mjs"`.

---

## Pendientes (no bloqueantes)

| ID | Pendiente | Esfuerzo |
| -- | --------- | -------- |
| P-1 | Bump Next.js a `14.2.x` parcheada (advisory de seguridad) | ~10 min |
| P-2 | Optimizar PNGs de marca o pedir SVGs a diseño | externo |
| P-3 | (Opcional) Auditoría Playwright sobre DOM renderizado | ~3 h |
| P-4 | Completar `resendContactProvider` cuando se active email | Fase posterior |

Ninguno impide usar el MVP. P-1 es el único con componente de seguridad (menor,
dado el alcance actual).

---

## Estado del build

```
npm run lint        ✅
npm run type-check  ✅
npm run build       ✅ 55 páginas SSG
npm run audit:links ✅ 0 hallazgos
```

> **Nota de migración:** `brand-manifest.ts` cambió de `string` a objeto. `Logo.tsx`
> está adaptado. El `Tagline` y `AccentDot` usan `as unknown as` para leer assets
> con forma distinta; compila y se renderiza correctamente.

---

## Documentación generada en esta auditoría

- `docs/AUDIT_REPORT.md` — este documento (resumen ejecutivo técnico).
- `docs/FUNCTIONAL_QA_REPORT.md` — links/botones/formularios.
- `docs/BRAND_ASSET_AUDIT.md` — tabla de 16 assets + reglas de marca.
- `docs/CONTACT_AND_WHATSAPP_STRATEGY.md` — capa de contacto y WhatsApp.
- `docs/DECISIONS.md` — añadidas D-011, D-012, D-013.
