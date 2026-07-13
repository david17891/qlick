# URLs Canónicas de Qlick — Taxonomía Oficial

> **Fecha:** 2026-07-13 · **Branch:** main @ `788f96f` · **Status:** propuesta para revisión
> **Autor:** Mavis (sesión súper-auditoría + remediación)
> **Trigger:** súper-auditoría reveló que 4 URLs "core" del protocolo (`/admin/dashboard`, `/lms`, `/crm`, `/admin/bot`) no existen físicamente. La taxonomía canónica resuelve el smell de raíz.

---

## 📊 Inventario Actual (estado: 2026-07-13)

### A. Público / Marketing (no requiere auth)
| URL | Tipo | Comentario |
|---|---|---|
| `/` | landing | (asumida, no listada) |
| `/acerca` | estática | Acerca de Qlick |
| `/beneficios` | estática | Landing de beneficios |
| `/contacto` | lead form | Form de contacto |
| `/cursos` | catálogo | Catálogo de cursos (público) |
| `/cursos/[slug]` | detalle | Detalle de curso |
| `/eventos` | catálogo | Catálogo de eventos (público) |
| `/eventos/[slug]` | detalle | Detalle de evento + registro |
| `/faq` | estática | Preguntas frecuentes |
| `/filosofia` | estática | Filosofía de la marca |
| `/privacidad` | estática | LFPDPPP aviso de privacidad |

### B. LMS del Alumno (requiere auth)
| URL | Tipo | Comentario |
|---|---|---|
| `/dashboard` | panel | **Panel del alumno** (mi panel, mis cursos, próximas lecciones) |
| `/aprender/[courseSlug]` | curso | **LMS** — vista del curso adquirido |
| `/aprender/[courseSlug]/[lessonSlug]` | lección | **Lección específica** (video, contenido) |
| `/inscripcion/[courseSlug]` | funnel | Inscripción gratuita a curso |
| `/pagar/[courseSlug]` | checkout | **Checkout Stripe** para curso paid |
| `/pagar/[courseSlug]/exito` | post-pago | Confirmación post-pago |
| `/cert/[folio]` | certificado | **Certificado descargable** del alumno |

### C. Eventos (mixto público + auth)
| URL | Tipo | Comentario |
|---|---|---|
| `/check-in/[token]` | público (token) | Check-in por QR del asistente |
| `/encuesta/[token]` | público (token) | Encuesta post-evento |
| `/staff` | staff (auth) | Dashboard del staff del evento |
| `/staff/scan/[eventId]` | staff (auth) | Scanner QR del staff |

### D. Admin (requiere admin auth)
| URL | Tipo | Comentario |
|---|---|---|
| `/admin/login` | auth | Login admin (Google OAuth) |
| `/admin/eventos` | gestión | **Gestión de eventos** (catálogo admin) |
| `/admin/eventos/[id]` | detalle | Detalle admin del evento (config, métricas) |
| `/admin/eventos/[id]/import` | import | Importador Excel de asistentes |
| `/admin/handoffs` | CRM kanban | **Handoffs del bot** (kanban de leads) |
| `/admin/system` | sistema | Hub de sistema (estado de DB, env, etc.) |
| `/admin/system/audit-log` | auditoría | Log de auditoría |
| `/admin/system/bot-v2` | bot UI | **UI de la Torre de Control** del bot |
| `/admin/system/supabase` | debug | Status de Supabase |

### E. Auth (público, sin admin)
| URL | Tipo | Comentario |
|---|---|---|
| `/login` | público | Login del alumno (Google OAuth + magic link) |
| `/logout` | público | Logout |
| `/auth/callback` | callback | OAuth callback genérico |
| `/auth/callback-student` | callback | OAuth callback específico del alumno |
| `/dev/login` | dev only | Bypass dev (gated por `DEV_ADMIN_SECRET`) |

### F. API (server-side, agrupadas por dominio)
| Path | Comentario |
|---|---|
| `/api/admin/bot/*` | global-pause, mode, simulate, stats |
| `/api/admin/crm/*` | ai-suggestions, conversations, overview, tasks |
| `/api/admin/emails/recent` | listar emails recientes enviados |
| `/api/admin/events/*` | clone, confirmations, import, prefill-rules, send-qr-pass, send-survey-offers, status, survey-config, trigger-reminder |
| `/api/admin/leads/*` | bulk, export, [id], bot-pause, event-context, interactions, notes, tasks |
| `/api/admin/staff/tokens` | gestión de tokens de staff |
| `/api/admin/system-setting` | actualizar setting del sistema |
| `/api/check-in/[token]` | check-in por token (público) |
| `/api/cron/*` | cleanup-qr-tokens, event-reminders, survey-reminders |
| `/api/dev/*` | admin-session, check-schema, login, simulate-webhook (solo dev) |
| `/api/event-gate/[token]/click` | gate virtual "SÍ, VOY" |
| `/api/event-qr/[token]` | QR de evento |
| `/api/events/[id]` | GET evento |
| `/api/events/[id]/certificate/[attendeeId]` | generar/enviar cert |
| `/api/payments/create-checkout` | Stripe checkout session |
| `/api/qr/[courseSlug]` | generar QR de curso |
| `/api/staff/*` | check-in, register-walk-in, scan |
| `/api/submit-survey` | POST encuesta |
| `/api/webhooks/*` | conekta, mercadopago, stripe |
| `/api/whatsapp/webhook` | WhatsApp inbound |

---

## 🚨 Gaps Detectados (URLs mencionadas en docs/protocolos pero NO existen)

| URL del protocolo/propuesta | Existe como | Decisión propuesta |
|---|---|---|
| `/admin/dashboard` | NO | **CREAR** (`/admin/dashboard/page.tsx` que renderice overview admin con KPIs y accesos rápidos a /admin/eventos, /admin/handoffs, /admin/system) |
| `/admin/bot` | NO (está en `/admin/system/bot-v2`) | **MANTENER** `/admin/system/bot-v2` como oficial. Marcar `/admin/bot` como DEPRECATED en docs. |
| `/lms` | NO (está en `/aprender`) | **DECIDIR**: `/aprender` es la URL oficial. Crear `/lms` como alias que redirige a `/cursos` (marketing) o a `/dashboard` (LMS del alumno). |
| `/crm` | NO (está en `/admin/handoffs` + API) | **CREAR** `/admin/crm` que reúna overview (de `/api/admin/crm/overview`), kanban (de `/admin/handoffs`), leads, conversations, tasks. Migrar gradualmente. |

---

## ⚠️ Inconsistencias Detectadas

| Tipo | Detalle | Fix |
|---|---|---|
| **Singular vs plural** | Página: `/admin/eventos/[id]` (con "s"). API: `/api/admin/events/[id]` (sin "s"). | **DECIDIR** entre `evento` o `event`. Recomendación: `event` (sin "s") para consistencia con API. Cambiar `/admin/eventos/*` a `/admin/events/*`. |
| **Inconsistencia dashboard** | `/dashboard` (alumno) y NO existe `/admin/dashboard` | **CREAR** `/admin/dashboard` con redirección o layout diferenciado. |
| **LMS vs aprender** | "LMS" en docs y código, pero URL es `/aprender` | **DECIDIR**: `aprender` es el término oficial. Actualizar docs. |

---

## 🎯 Taxonomía Canónica Propuesta

### Principios
1. **URL en singular para recursos** (event, course, lead) — consistente con REST.
2. **Prefijo `/admin` para todo lo del admin** — sin `/admin/system` (usar `/admin/*` directo).
3. **LMS del alumno = `/aprender`** (no `/lms`). El término "LMS" se usa internamente en código (`src/lib/lms/`).
4. **CRM = `/admin/crm`** (no `/admin/handoffs` + API). El "handoffs" es solo una vista del CRM (kanban).
5. **Dashboard del alumno = `/dashboard`**, **Dashboard admin = `/admin/dashboard`**.

### Estructura Final

```
/                                     → Landing Qlick (marketing)

# Público (sin auth)
├── /acerca
├── /beneficios
├── /contacto
├── /cursos                       (catálogo)
│   └── /cursos/[slug]
├── /eventos                      (catálogo)
│   └── /eventos/[slug]
├── /faq
├── /filosofia
└── /privacidad

# LMS del alumno (auth)
├── /dashboard                    (panel: mis cursos, próximas lecciones)
├── /aprender                     (redirect → /dashboard)
│   ├── /aprender/[courseSlug]
│   │   └── /aprender/[courseSlug]/[lessonSlug]
├── /inscripcion                  (redirect → /inscripcion/[courseSlug])
│   └── /inscripcion/[courseSlug]
├── /pagar                        (redirect → /pagar/[courseSlug])
│   └── /pagar/[courseSlug]
│       └── /pagar/[courseSlug]/exito
└── /cert
    └── /cert/[folio]

# Eventos (mixto)
├── /check-in                     (redirect → /check-in/[token])
│   └── /check-in/[token]         (público, QR del asistente)
├── /encuesta                     (redirect → /encuesta/[token])
│   └── /encuesta/[token]         (público, post-evento)
└── /staff                        (auth, dashboard del staff)
    └── /staff/scan/[eventId]     (auth, scanner QR)

# Admin (auth admin)
├── /admin/dashboard              (overview admin con KPIs y accesos rápidos) ← CREAR
├── /admin/login                  (Google OAuth admin)
├── /admin/event                  (catálogo eventos)                    ← RENOMBRAR de /admin/eventos
│   ├── /admin/event/[id]
│   └── /admin/event/[id]/import
├── /admin/crm                    (CRM unificado)                      ← CREAR
│   ├── /admin/crm/overview       (métricas)
│   ├── /admin/crm/leads          (lista + filtros + bulk actions)
│   ├── /admin/crm/leads/[id]
│   ├── /admin/crm/conversations  (WhatsApp)
│   ├── /admin/crm/tasks          (tareas del CRM)
│   └── /admin/crm/notes          (notas por lead)
│   /admin/handoffs               (kanban del bot) → integrar en /admin/crm
│   /admin/bot                    (alias a /admin/crm + tab bot)         ← CREAR
├── /admin/system
│   ├── /admin/system/audit-log
│   ├── /admin/system/bot         (Torre de Control)                  ← RENOMBRAR de bot-v2
│   └── /admin/system/supabase    (debug)
└── /admin/staff                  (gestión de staff por evento)         ← MOVER de /staff (separar público de admin)
    └── /admin/staff/tokens

# Auth
├── /login
├── /logout
├── /auth/callback
├── /auth/callback-student
└── /dev/login                    (solo dev)
```

---

## 📋 Plan de Implementación (sprint dedicado, NO esta noche)

### Sprint 1 (1-2 horas): Crear las URLs que faltan
1. **`/admin/dashboard`** (NEW) — overview admin con KPIs y accesos a /admin/event, /admin/crm, /admin/system.
2. **`/lms`** (alias) — redirige a `/cursos` (marketing) o `/dashboard` (LMS). Decidir A/B.
3. **`/admin/crm`** (NEW, mínimo viable) — overview de CRM con links a /admin/handoffs y al API de overview.

### Sprint 2 (2-3 horas): Renombrar y unificar
1. **`/admin/eventos/*` → `/admin/event/*`** (sin "s"). Mantener `/admin/eventos/*` como redirect temporal.
2. **`/admin/system/bot-v2` → `/admin/system/bot`** (sin "-v2"). Mantener bot-v2 como redirect.
3. **`/admin/handoffs` → `/admin/crm/handoffs`** (mover dentro del CRM). Mantener /admin/handoffs como redirect.
4. **`/admin/system/bot` → link también desde `/admin/bot`** (alias de la Torre de Control).

### Sprint 3 (3-4 horas): Decisión sobre `/staff` y `/admin/staff`
- `/staff` (público del staff del evento) vs `/admin/staff` (admin que gestiona tokens de staff).
- Recomendación: separar claramente. `/staff/*` es la zona del staff del evento (auth staff role). `/admin/staff/*` es la zona admin (auth admin role).
- Actualizar middleware para diferenciar.

### Sprint 4 (1 hora): Actualizar docs
- `docs/URLS_CANONICAS.md` (este doc) queda como source of truth.
- Actualizar `AGENTS.md` con la taxonomía canónica.
- Actualizar `docs/ROADMAP.md` y `docs/STATUS.md` con las nuevas URLs.

---

## 🛑 Decisiones Pendientes para David

1. **`/lms`**: ¿Marketing (catálogo) o LMS (después de pagar)?
   - A) `/lms` = `/cursos` (marketing). `/aprender` = LMS post-compra.
   - B) `/lms` = `/aprender` (LMS post-compra). `/cursos` = marketing.

2. **`/admin/dashboard`**: ¿Crear o usar `/admin/system`?
   - A) Crear `/admin/dashboard` con overview admin. Dejar `/admin/system` para debug.
   - B) Renombrar `/admin/system` a `/admin/dashboard` (más user-friendly). Debug se mueve a `/admin/system/legacy` o algo similar.

3. **`/admin/crm`**: ¿Crear wrapper o usar `/admin/handoffs`?
   - A) Crear `/admin/crm` que reúna overview, leads, conversations, tasks, handoffs.
   - B) Dejar `/admin/handoffs` como "CRM" y seguir con la fragmentación.

4. **`/admin/eventos` (con "s") → `/admin/event` (sin "s")**:
   - A) Sí, unificar a singular.
   - B) No, mantener plural (más natural en español).

5. **Prioridad de los sprints 1-4**:
   - A) Hacer todos antes del próximo evento grande.
   - B) Solo Sprint 1 (URLs mínimas) ahora. El resto en Q4 2026.

---

## 📚 Cross-refs

- `docs/AUDIT_GAPS_PROD_2026-07-12.md` — audit comprehensivo que identificó el smell de URLs.
- `docs/SUPER_AUDIT_REPORT_2026.md` — súper-auditoría que lo confirmó (AUDIT-004+010 usaron rutas alternativas).
- `.harness/docs/SUPER_AUDIT_REMEDIATION_PROTOCOL.md` — protocolo ejecutado.
- `docs/OPEN_ITEMS.md` — gaps abiertos.
