> **📌 Snapshot histórico (sprint housekeeping 2026-07-12):** Este doc es un snapshot del estado del proyecto a la fecha de su creación (ver frontmatter o el commit al inicio del doc). El proyecto ha evolucionado — para el estado actual, ver [docs/STATUS.md](STATUS.md) y [docs/OPEN_ITEMS.md](OPEN_ITEMS.md) (resumen ejecutivo al inicio). Las menciones a Resend o qlick.marketing son del contexto histórico; el email transaccional actual usa **Brevo** (
oreply@qlick.digital).

# Reporte Técnico — Qlick Marketing Integral

> **Propósito:** Estado técnico real del repositorio para revisión externa (agentes AI, auditores, candidatos a contributor).
> **Fecha de snapshot:** 2026-06-28
> **Audiencia:** Revisores técnicos con conocimiento de Next.js / TypeScript / Supabase.
> **Stack:** Next.js 14.2.35 (App Router) + Supabase + TypeScript strict + Tailwind CSS.
> **Repo:** `david17891/video-semifinal-automation` (GitHub, rama principal `main`)
> **Versión:** v0.10.0 (Fase 4) + v0.11.0 (Fase 5) — release notes en `CHANGELOG.md`.

---

## 1. Resumen ejecutivo

| | |
|---|---|
| Líneas de código TS/TSX en `src/` | **33,568** |
| Líneas de tests (`tests/*.test.mjs`) | **1,351** |
| Ratio tests/código | **4.02%** |
| Archivos `.ts/.tsx` totales | **216** |
| Migrations SQL aplicadas | **14** |
| Tests automatizados pasando | **110/110** |
| Commits en `main` | **193** |
| Branches activas (no merged) | **0** (todas mergeadas) |
| Routes admin (páginas) | **9** |
| API endpoints | **17** (13 admin + 3 dev + 1 público) |
| Documentos `.md` | **40** |
| Scripts operativos | **20** |
| `console.log` en producción | **0** |
| `TODO/FIXME/HACK` en código | **6** (todos en comentarios, no en lógica) |

**Veredicto**: plataforma con funcionalidad core implementada (LMS, CRM, eventos, admin, audit log). Lista para deploy público con configuración de DNS + Resend + decisión de proveedor de pagos. Pago real y WhatsApp Business API son los principales huecos funcionales.

---

## 2. Estructura del repositorio

```
src/                                    33,568 LOC
├── app/                                App Router (rutas)
│   ├── admin/                          9 páginas admin
│   │   ├── eventos/                    CRUD eventos + tabs + import wizard
│   │   ├── masterclass/                CRUD masterclass
│   │   ├── system/audit-log/           log de acciones admin con diff view
│   │   ├── system/supabase/            diagnóstico de conexión
│   │   └── login/                      magic link login
│   ├── api/                            17 route handlers
│   │   ├── admin/                      13 endpoints protegidos
│   │   ├── dev/                        3 endpoints dev (login bypass, webhook)
│   │   └── qr/                         1 endpoint público
│   ├── auth/                           callbacks OAuth
│   ├── cursos/, eventos/, masterclass/, dashboard/, mi-panel/, …
│   ├── actions/                        server actions
│   ├── globals.css                     CSS base + variables de marca
│   ├── layout.tsx                      layout raíz
│   └── middleware.tsmatcher: /admin/* y /api/admin/* (defensa en profundidad)
├── components/
│   ├── admin/                          AdminView (tabs, métricas)
│   ├── course/, dashboard/, brand/, layout/, ui/, video/
│   ├── crm/                            CRMView (pipeline, calendario, agente)
│   ├── contact/, events/                EventDrawer (CRUD eventos)
│   └── auth/, payment/
├── lib/
│   ├── auth/                           mock auth + session helper
│   ├── crm/                            17 archivos · 2,707 LOC — leads, pipelines, intents IA
│   ├── events/                         11 archivos · 3,041 LOC — events funnel core
│   ├── email/                          Resend wrapper + templates
│   ├── payments/                       4 adapters (mock + 3 stubs)
│   ├── supabase/                       6 archivos — clients (browser/server/admin) + health
│   ├── video/                          VideoProvider abstraction
│   ├── whatsapp/                       8 archivos · 434 LOC — meta cloud + BSP stubs
│   ├── contact/, ai/, masterclasses/, data/, leads/, qr/, video/
│   └── utils.ts                        cn(), formatMXN(), formatDuration()
├── types/
│   ├── index.ts                        dominio principal
│   ├── events.ts                       tipos del funnel
│   ├── crm.ts, lms.ts, masterclass.ts
│   └── supabase.ts                     typegen (1,299 LOC, regenerable)
└── middleware.ts                       protección rutas admin

supabase/migrations/                    14 SQL files (esquema versionado)
scripts/                                20 scripts operativos (seed, checks, CLI)
tests/                                  9 archivos · 1,351 LOC · 110 tests
docs/                                   40 documentos (.md)
```

---

## 3. Métricas por módulo

| Carpeta | Archivos | Líneas | Función |
|---|---|---|---|
| `src/lib/events/` | 11 | **3,041** | Events funnel: CRUD, importer, surveys, promotion a lead |
| `src/lib/crm/` | 17 | **2,707** | Leads, pipelines, interactions, notes, tasks, WhatsApp follow-up |
| `src/lib/data/` | 8 | **2,270** | Mock data layer (interfaz que será reemplazada por queries Supabase reales) |
| `src/components/crm/` | 3 | **1,824** | CRMView con pipeline kanban + calendario + agente IA |
| `src/components/events/` | 3 | **1,494** | AdminEventosClient + EventDrawer + EventView |
| `src/lib/lms/` | 5 | **1,325** | LMS server libs (entitlements, enrollments, courses) |
| `src/types/supabase.ts` | 1 | **1,299** | Typegen — regenerable con `npx supabase gen types typescript` |
| `src/app/admin/` | 24 | **1,395** | Pages + loading + error + dynamic route handlers admin |

**Nota:** `src/lib/data/*` es mock data layer que matchea la interfaz final de Supabase. La migración a Supabase real es substitution, no rewrite (decisión D-001 en `docs/DECISIONS.md`).

---

## 4. Stack técnico detallado

### Runtime

| Paquete | Versión | Uso |
|---|---|---|
| `next` | 14.2.35 | Framework (App Router) — última patch de línea `next-14` estable |
| `react` / `react-dom` | 18.3.1 | UI library |
| `typescript` | strict | Tipado fuerte (sin `any` en código de aplicación) |
| `tailwindcss` | 3.x | Estilos utility-first (sin UI kit externo) |
| `node` | ≥18 | Runtime target |

### Backend / DB

| Servicio | Plan actual | Datos reales | Notas |
|---|---|---|---|
| **Supabase** | Free tier (URL + publishable + secret key configuradas en `.env.local`) | 5 cursos, 2 eventos, 0 leads, 0 surveys, 0 audit log entries | DB no se ha usado en producción real todavía |
| `@supabase/supabase-js` | ^2.108.2 | — | Cliente JS |
| `@supabase/ssr` | ^0.12.0 | — | Server-side rendering con cookies |

### Integraciones

| Servicio | Estado | Implementación |
|---|---|---|
| **Resend** (email transaccional) | Wrapper listo, **no configurado** | `src/lib/email/resend-client.ts` (177 LOC) — fail-safe + dev mode loggea en consola |
| **xlsx** | CLI import wizard | `^0.18.5` — ⚠️ 5 vulnerabilidades transitivas en `npm audit` (alto) |
| **Resend + email templates** | 1 template (`survey-with-consent.ts`, 175 LOC) | Listo para activar con API key |

### Auth

| Método | Estado | Notas |
|---|---|---|
| **Magic link** | ✅ Funciona | Default de Supabase Auth. Free tier incluido. |
| **Google OAuth** | ✅ Implementado (rama `feature/google-oauth` mergeada) | Configurar OAuth en Supabase + Google Cloud Console |
| **Password** | ❌ No implementado | Decisión: no password, solo passwordless |
| **Passkeys (WebAuthn)** | 🔜 Stub | No implementado. ~2-3 días de trabajo estimado |

### Pagos

| Provider | Estado | Archivo |
|---|---|---|
| **Mock** | ✅ Activo (`NEXT_PUBLIC_PAYMENT_PROVIDER="mock"`) | `src/lib/payments/mock-provider.ts` |
| **MercadoPago** | 🟡 Stub (interfaz lista, sin lógica) | `src/lib/payments/mercadopago-provider.ts` |
| **Stripe** | 🟡 Stub | `src/lib/payments/stripe-provider.ts` |
| **Conekta** | 🟡 Stub (con CFDI nativo) | `src/lib/payments/conekta-provider.ts` |

### WhatsApp

| Provider | Estado | Archivo |
|---|---|---|
| **Manual (wa.me)** | ✅ Activo — `manualWaProvider` con click-to-chat | — |
| **Meta Cloud API** | 🟡 Stub | `src/lib/whatsapp/metaCloudApiProvider.ts` |
| **BSP (360dialog, Twilio)** | 🟡 Stub | `src/lib/whatsapp/bspProvider.ts` |

### Hosting

| Aspecto | Estado |
|---|---|
| **Build local** | ✅ Verde — 55+ rutas SSG |
| **Vercel deploy** | ⚠️ **No verificado en este snapshot**. Hay rama `feature/privacy-and-production-deploy` mergeada con docs de setup (`docs/VERCEL_ENV_SETUP.md`) |
| **Dominio** | ⚠️ No verificado. Docs mencionan `qlick.mx`, `qlick.marketing`, `qlick-three.vercel.app` — no hay confirmación de cuál es el real |
| **DNS** | ❌ No configurado (sin acceso al registrar) |
| **CI/CD** | ❌ No hay — push directo a `main` después de review manual |

---

## 5. Funcionalidad implementada (verificada)

### 5.1 LMS (`/cursos`, `/dashboard`, `/aprender/*`)

| Feature | Estado | Path |
|---|---|---|
| Catálogo público de cursos | ✅ | `src/app/cursos/page.tsx` |
| Detalle de curso individual | ✅ | `src/app/cursos/[slug]/page.tsx` |
| Inscripción con QR | ✅ | `src/app/inscripcion/[courseSlug]/page.tsx` |
| Login con magic link | ✅ | `src/app/auth/callback/route.ts` |
| Login con Google OAuth | ✅ | Code mergeado, requiere config en Supabase |
| Dashboard del alumno | ✅ | `src/app/dashboard/page.tsx` |
| Reproductor de lecciones | ✅ (con YouTube no-listado) | `src/components/video/VideoPlayer.tsx` |
| Entitlements (paid vs free) | ✅ | `src/lib/lms/entitlements.ts` |
| Webhook simulator (dev) | ✅ | `src/app/api/dev/simulate-webhook/route.ts` |

**Limitación conocida:** Videos son placeholders de YouTube. DRM real requiere migración a Cloudflare Stream o Mux (stubs preparados).

### 5.2 Admin de eventos (`/admin/eventos/*`)

| Feature | Estado | Path |
|---|---|---|
| Lista de eventos con cards | ✅ | `src/app/admin/eventos/page.tsx` |
| Detalle con 4 tabs (Confirmados/Asistentes/Encuestas/Leads) | ✅ | `src/app/admin/eventos/[id]/page.tsx` (1,164 LOC) |
| Vista Pipeline kanban 5 columnas | ✅ | `src/components/events/PipelineColumn.tsx` |
| Import wizard (.xlsx con detección de headers) | ✅ | `src/app/admin/eventos/[id]/import/page.tsx` |
| EventDrawer (CRUD con validación inline) | ✅ | `src/components/events/EventDrawer.tsx` (585 LOC) |
| Clonar evento (slug único con sufijo `-copia` / `-copia-N`) | ✅ | `src/app/api/admin/events/[id]/clone/route.ts` + `src/lib/events/events-server.ts:cloneEvent()` |
| Undo archivar (toast con auto-dismiss 5s) | ✅ | `src/components/events/AdminEventosClient.tsx:handleArchived()` |
| Métricas de funnel (4 ratios) | ✅ | `src/lib/events/event-metrics.ts` |
| Audit log con diff before/after | ✅ | `src/app/admin/system/audit-log/page.tsx` (380 LOC) |
| Marcar encuestas como revisadas | ✅ | `src/lib/events/surveys-server.ts` |
| Match manual attendee ↔ confirmation | ✅ | `src/lib/events/attendees-server.ts` |
| Promover survey con consent → lead | ✅ | `src/lib/events/promotion.ts` |

### 5.3 CRM (`/admin?tab=crm`)

| Feature | Estado | Path |
|---|---|---|
| Pipeline kanban 4 columnas (Nuevo/Contactado/Interesado/Ganado) | ✅ | `src/components/crm/CRMView.tsx` |
| Drawer del lead con badge de evento origen | ✅ | `src/components/crm/LeadDetailDrawer.tsx` |
| Calendario (próximas citas + tareas pendientes) | ✅ | `src/components/crm/CRMView.tsx:Calendar` |
| **10 intents del agente IA** (clasificador de leads) | ✅ | `src/lib/ai/intents/` |
| WhatsApp follow-up manual (4 estados) | ✅ | `src/lib/leads/whatsapp-status.ts` |
| Notas internas del lead | ✅ | `src/lib/crm/notes-server.ts` |
| Tareas de seguimiento | ✅ | `src/lib/crm/tasks-server.ts` |
| Historial de interacciones | ✅ | `src/lib/crm/interactions-server.ts` |
| Audit log de WhatsApp (`lead_whatsapp_log`) | ✅ | `src/lib/crm/whatsapp-followup.ts` |

### 5.4 Sistema / Dev

| Feature | Estado | Path |
|---|---|---|
| Dev login bypass (`/api/dev/login`) | ✅ | Solo activo si `NODE_ENV !== 'production'` |
| Diagnóstico de Supabase (`/admin/system/supabase`) | ✅ | `src/app/admin/system/supabase/page.tsx` |
| Audit log unificado (`/admin/system/audit-log`) | ✅ | `src/lib/crm/audit-server.ts` (188 LOC) + `src/lib/events/events-server.ts` snapshots |
| Validación local de env (`npm run check:supabase`) | ✅ | `scripts/check-supabase-env.mjs` |
| Audit de links rotos (`npm run audit:links`) | ✅ | `scripts/audit-links.mjs` |

---

## 6. Seguridad

### Defensa en profundidad (2 capas)

| Capa | Mecanismo | Cubre |
|---|---|---|
| **Middleware** (`src/middleware.ts`) | Matcher `/admin/:path*` + `/api/admin/:path*`. Verifica sesión Supabase + email en `ADMIN_EMAIL_ALLOWLIST` (env var). | Todas las rutas admin. Modo demo: si Supabase no configurado, deja pasar. |
| **Route handler** (`requireAdmin()` en server-side) | Doble verificación en endpoints sensibles. | Defensa adicional si alguien bypasea el middleware. |

### RLS (Row-Level Security) en Supabase

✅ **Habilitado en todas las tablas del funnel de eventos** (verificado en migration `20260627000000_events_funnel.sql`):

| Tabla | RLS | Política |
|---|---|---|
| `events` | ✅ | SELECT público si `status='published'`. Default-deny INSERT/UPDATE/DELETE. |
| `event_confirmations` | ✅ | Default-deny (solo service role). |
| `event_attendees` | ✅ | Default-deny. |
| `event_surveys` | ✅ | Default-deny. |
| `event_survey_unmatched` | ✅ | Default-deny. |
| `lead_event_links` | ✅ | Default-deny. |

⚠️ **Tablas sin RLS explícito verificado** (requieren audit): `leads`, `course_access`, `payments`, `enrollments`, `admin_audit_log`. Las migraciones sugieren RLS pero no lo confirmé en este snapshot.

### Service Role separation

- `src/lib/supabase/admin.ts` valida `typeof window === 'undefined'` (lanza si se importa en cliente).
- `SUPABASE_SECRET_KEY` nunca tiene prefijo `NEXT_PUBLIC_*`.

### Auditorías previas documentadas

- `docs/AUDIT_REPORT.md` — auditoría externa 2026-06-27 (race conditions, PII en logs, link_event_unique mal definida) — cerrada en `cd86f45`.
- `docs/DEPENDENCY_AUDIT.md` — `npm audit` post-actualización Next.js: 0 críticos, 4 altos, 1 moderado (residual, requiere Next 16 breaking para fix).

---

## 7. Lo que NO está implementado (deuda funcional)

### 7.1 Pagos reales

| Provider | Lo que falta | Estimación |
|---|---|---|
| MercadoPago | Implementar `createCheckout`, `getStatus`, `parseWebhook` en `mercadopago-provider.ts`. Configurar webhooks con verificación de firma. | 2-3 días |
| Stripe | Igual que MercadoPago + MSI si se requiere. | 2-3 días |
| Conekta | Igual + integración CFDI nativa. | 3-4 días |

### 7.2 WhatsApp Business API

| Componente | Estado | Estimación |
|---|---|---|
| Meta Cloud API | Stub (no funcional). Requiere: Meta Business App, verificación de negocio, display name aprobado, templates aprobadas. | 2 semanas de aprobación Meta + 2-3 días código |
| Webhook handler | Placeholder en `src/lib/whatsapp/webhooks/handler.ts`. No crea conversaciones reales. | 1 día |
| Templates | 0 templates aprobadas (meta define ~5-10 templates según uso). | 1-2 días redacción + 1-2 semanas aprobación |

### 7.3 Email transaccional

| Componente | Estado | Estimación |
|---|---|---|
| Resend API key | ❌ No configurado. Sin esto, emails loggean en consola. | 30 min setup |
| Dominio verificado en Resend | ❌ No configurado. Requiere 3 DNS records (TXT para SPF, DKIM, DMARC). | 30 min setup + 5-48h propagación |
| Templates adicionales | Solo 1 (`survey-with-consent`). Faltan: welcome, password reset, payment receipt, certificate. | 1 día por template |

### 7.4 Video

| Componente | Estado | Estimación |
|---|---|---|
| Cloudflare Stream / Mux | Stubs. Requiere: signed URL endpoint, upload UI, asset management. | 3-5 días |
| Videos reales | 0%. Solo placeholders de YouTube no-listado. | Producción externa |

### 7.5 CFDI / Facturación

| Componente | Estado | Estimación |
|---|---|---|
| CFDI nativa | Solo con Conekta (que tiene integración directa). Otros proveedores requieren PAC externo. | Depende de elección |
| Aviso de privacidad validado legalmente | ⚠️ Documento publicado pero **con disclaimer explícito** de no ser asesoría legal definitiva. | Sesión con abogado |

### 7.6 Deploy / Producción

| Componente | Estado | Estimación |
|---|---|---|
| Vercel deploy | ❌ **No verificado**. Posiblemente existe, requiere confirmación. | 30 min si no existe |
| Dominio custom | ❌ **No verificado**. | Compra dominio + DNS |
| CI/CD | ❌ No hay. Push directo a main con review manual. | 1 día setup GitHub Actions |
| Monitoring (Sentry) | ❌ No implementado | 1 día |
| Backups automatizados DB | ⚠️ Free tier de Supabase tiene backups diarios retenidos 7 días. Pro tier tiene Point-in-Time Recovery. | Upgrade a Pro si se requiere >7 días |

---

## 8. Deuda técnica y riesgos

### 8.1 TODOs en código

```
src/lib/brand-manifest.ts:1   comentario header (no acción)
src/types/crm.ts:2            type narrowing para discriminated unions
src/types/events.ts:1         tipo deprecado
src/app/page.tsx:2            ejemplos en copy
```

Todos son menores (no bloquean funcionalidad). Los tipos deprecated están documentados en `docs/OPEN_ITEMS.md`.

### 8.2 `xlsx` vulnerabilities

`npm audit` reporta 5 vulnerabilidades transitivas (1 moderate + 4 high). Scope: solo el CLI import wizard (no expuesto a clientes). Mitigación: cambiar a `exceljs` cuando CI/CD esté activo. Riesgo operativo: bajo.

### 8.3 Modo Auth

`NEXT_PUBLIC_AUTH_MODE="mock"` en `.env.local`. **No se está usando Supabase Auth actualmente**, aunque el cliente está configurado. Esto significa:

- Los leads se insertan con `service_role` key (bypass RLS, server-side).
- La auth de admin es por middleware + email allowlist (no magic link activo).
- Las sesiones de alumno aún funcionan con mock.

Para producción real: cambiar a `NEXT_PUBLIC_AUTH_MODE="supabase"` y verificar que `requireAdmin()` esté activo en todos los routes sensibles (hoy depende del middleware).

### 8.4 Magic link UX

Magic link tiene fricción real (5-10 segundos, abrir correo, etc.). Google OAuth mergeado en `feature/google-oauth` pero requiere config externa. **Recomendación**: priorizar Google OAuth en login, magic link como fallback.

### 8.5 Branches activas

**0 branches ahead de main.** Históricamente había 8 ramas feature/* que ya están todas mergeadas. Esto es bueno para auditabilidad pero significa que cada feature nueva se mergea con rebase o merge commit directo.

### 8.6 Tests coverage

- 110 tests automatizados (4% de líneas).
- Cobertura real estimada: **15-25%** (solo libs puras testeadas, no hay tests de componentes React ni de routes).
- No hay tests E2E con `@playwright/test` (solo scripts ad-hoc).
- CI/CD no ejecuta tests automáticamente.

### 8.7 Datos reales en DB

**0 leads, 0 surveys, 0 attendees, 0 confirmations, 0 payments, 0 enrollments**. La DB tiene 5 cursos y 2 eventos (de seed), pero el flujo end-to-end no se ha probado con datos reales. Esto es esperado (estado pre-producción) pero es un gap crítico antes de salir al público.

---

## 9. Decisiones arquitectónicas documentadas

| ID | Decisión | Documento |
|---|---|---|
| D-001 | Mock data con misma forma que DB real | `docs/DECISIONS.md` |
| D-003 | Sin ORM (Prisma/Drizzle) en MVP | `docs/ARCHITECTURE.md` §2 |
| D-004 | Auth mock client-side con magic link real opcional | `docs/ARCHITECTURE.md` §5 |
| D-014 | CRM en demo mode inicialmente | `docs/SUPABASE_CONNECTION_BOOTSTRAP.md` |
| D-015 | Abstracción `WhatsAppProvider` (manual → cloud API → BSP) | `docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md` |
| D-018 | RLS obligatorio desde día 1 | `docs/PRIVACY_AND_DEPLOY_CHECKLIST.md` |

Decisiones bien documentadas. Si una futura refactorización contradice alguna, hay registro del motivo original.

---

## 10. Cómo empezar la revisión

### 10.1 Orden sugerido (de más a menos crítico)

1. **Seguridad** — leer `src/middleware.ts` (158 LOC) y `src/lib/auth/session.ts`. Verificar que el matcher cubre todas las rutas sensibles.
2. **Schema** — revisar las 14 migrations en `supabase/migrations/` (ordenadas por timestamp). Buscar políticas RLS, default-deny, índices.
3. **API endpoints** — leer los 13 admin endpoints. Verificar que todos validan input (no Zod formal — validación manual por lo que vi).
4. **Server libs** — `src/lib/events/events-server.ts` (609 LOC) y `src/lib/crm/` son los más críticos. Verificar manejo de errores, race conditions, consistencia con RLS.
5. **Componentes admin** — `src/app/admin/eventos/[id]/page.tsx` (1,164 LOC) es el más grande. Buscar dead code, complejidad innecesaria.
6. **Tests** — ejecutar `npm test`. 110/110 pasan. Leer `tests/event-importer.test.mjs` y `tests/whatsapp-broadcast.test.mjs` para entender qué se considera crítico.

### 10.2 Comandos útiles

```bash
# Setup local
npm install
npm run dev                 # http://localhost:3000

# Validación
npm run type-check          # tsc --noEmit
npm run lint                # next lint
npm test                    # 110 tests
npm run build               # production build
npm run check:supabase      # valida env vars sin abrir conexión
npm run audit:links         # busca links rotos en el código

# DB
npx supabase gen types typescript   # regenera src/types/supabase.ts
npx supabase db diff                # muestra diff de schema
```

### 10.3 Archivos clave para entender la arquitectura

| Archivo | Qué entender |
|---|---|
| `src/middleware.ts` | Defensa en profundidad de admin |
| `src/lib/supabase/admin.ts` | Service role separation |
| `src/lib/events/events-server.ts` | Patrón de server lib + audit log |
| `src/lib/crm/audit-server.ts` | `logAdminAction` + `listAuditLogs` |
| `supabase/migrations/20260627000000_events_funnel.sql` | Schema principal del funnel |

### 10.4 Lo que NO debe esperar el revisor

- ❌ Deploy en producción real (no verificado).
- ❌ Pagos reales procesados.
- ❌ WhatsApp Business API activo (solo manual).
- ❌ Email transaccional enviado (solo logs en consola).
- ❌ Tests E2E automatizados.
- ❌ CI/CD ejecutándose.
- ❌ Monitoring de errores.
- ❌ Datos reales en DB (0 leads, 0 surveys).

---

## 11. Veredicto para revisores externos

**A favor**:
- ✅ Funcionalidad core implementada y testeada.
- ✅ Seguridad con defensa en profundidad (middleware + handler).
- ✅ RLS habilitado en tablas críticas.
- ✅ TypeScript strict sin `any` ni `console.log` en producción.
- ✅ Documentación viva (40 docs actualizados regularmente).
- ✅ Arquitectura preparada para escalar sin reescritura (abstracciones, RLS desde día 1).
- ✅ Decisiones técnicas documentadas con razones.
- ✅ Auditorías externas previas cerradas (race conditions, PII).

**En contra**:
- ❌ Pagos y WhatsApp automatizado son stubs — los caminos críticos para monetización requieren implementación.
- ❌ Email transaccional no configurado (necesita Resend + DNS).
- ❌ Cobertura de tests baja (4% de LOC, ~15-25% real).
- ❌ Sin CI/CD, push directo a main.
- ❌ Magic link como única auth UX (Google OAuth mergeado pero no prominente).
- ❌ DB sin datos reales (0 leads, 0 surveys) — flujo end-to-end no probado a escala.
- ❌ Videos placeholder (YouTube no-listado, no son contenido propio).

**Recomendación**: el repositorio está listo para review técnico de seguridad, arquitectura, y deuda. **NO está listo para review de "go-to-market"** sin antes cerrar: deploy + dominio + email + decisión de pagos.

---

## 12. Próximos pasos sugeridos (orden)

1. **Deploy público** — conectar Vercel, configurar DNS, deploy de `main`. (1 día)
2. **Setup Resend** — crear cuenta, verificar dominio, API key. (30 min + DNS propagation)
3. **Cambiar `NEXT_PUBLIC_AUTH_MODE="supabase"`** + verificar que magic link funciona end-to-end. (1 día)
4. **Google OAuth prominence** — UI del login con botón "Entrar con Google" primero. (medio día)
5. **Decidir proveedor de pagos** (MercadoPago recomendado para MX). (negocio, 1 día)
6. **Implementar adapter de pago elegido**. (2-3 días)
7. **Aplicar la migration `20260629000000_admin_audit_log_diff.sql`** en Supabase. (5 min)
8. **Privacidad legalmente validada**. (negocio, sesión con abogado)
9. **Seed script con datos demo** para mostrar a clientes. (medio día)
10. **Capturar primer lead real** como test de fuego.

---

**Snapshot generado el:** 2026-06-28
**Generado por:** Mavis (agente AI) — comando del usuario David
**Versión del repo:** `main` @ `e058b20`
**Próxima snapshot sugerida:** post-deploy Vercel + post-Setup Resend (~1 semana)