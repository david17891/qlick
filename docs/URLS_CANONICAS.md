# URLs Canónicas de Qlick — Estado Actual

> **Fecha:** 2026-07-13 · **Branch:** main · **Status:** snapshot del estado real (NO propuesta)
> **Autor:** Mavis (sprint de súper-auditoría + remediación + cleanup)
> **Principio rector (David 2026-07-13 00:51):** "Lo importante y más usado se mantiene. Lo pendiente como cursos se pospone."

---

## 🚦 Estado por área (2026-07-13)

### ✅ **ACTIVO** — Rutas en uso real, mantener tal cual

#### A. Público / Marketing
| URL | Comentario |
|---|---|
| `/` | Landing principal |
| `/acerca` | Acerca de Qlick |
| `/beneficios` | Landing de beneficios |
| `/contacto` | Form de contacto (lead) |
| `/cursos` | **Catálogo público de cursos** (marketing) |
| `/cursos/[slug]` | Detalle público de curso |
| `/eventos` | **Catálogo público de eventos** |
| `/eventos/[slug]` | Detalle público de evento + registro |
| `/faq` | Preguntas frecuentes |
| `/filosofia` | Filosofía de marca |
| `/privacidad` | LFPDPPP aviso de privacidad |

#### B. Eventos (mixto público + auth staff)
| URL | Comentario |
|---|---|
| `/check-in/[token]` | Check-in por QR (público, vía token) |
| `/encuesta/[token]` | Encuesta post-evento (público, vía token) |
| `/staff` | Dashboard del staff (auth staff) |
| `/staff/scan/[eventId]` | Scanner QR del staff |

#### D. Admin (en uso)
| URL | Comentario |
|---|---|
| `/admin/login` | Login admin (Google OAuth) |
| `/admin/eventos` | **Gestión administrativa de eventos** (catálogo admin) |
| `/admin/eventos/[id]` | Detalle admin de un evento |
| `/admin/eventos/[id]/import` | Importador Excel de asistentes |
| `/admin/system` | Hub de sistema (status, debug) |
| `/admin/system/audit-log` | Log de auditoría |
| `/admin/system/supabase` | Status de Supabase (debug) |

#### E. Auth
| URL | Comentario |
|---|---|
| `/login` | Login del alumno (Google OAuth + magic link) |
| `/logout` | Logout |
| `/auth/callback` | OAuth callback genérico |
| `/auth/callback-student` | OAuth callback del alumno |
| `/dev/login` | Dev bypass (gated por `DEV_ADMIN_SECRET`) |

#### F. API (en uso)
- `/api/admin/*` — bot, crm, emails, events, leads, staff, system-setting
- `/api/check-in/[token]`, `/api/event-gate/[token]/click`, `/api/event-qr/[token]`
- `/api/cron/*` — cleanup-qr-tokens, event-reminders, survey-reminders
- `/api/dev/*` — admin-session, check-schema, login, simulate-webhook
- `/api/events/*`, `/api/payments/create-checkout`, `/api/qr/[courseSlug]`
- `/api/staff/*`, `/api/submit-survey`, `/api/webhooks/*` (conekta, mercadopago, stripe)
- `/api/whatsapp/webhook`

---

### 🟡 **POSPUESTO** — Rutas construidas pero no usadas (diseño de LMS pendiente)

David confirmó 2026-07-13 00:51 que **"toda la parte de los cursos todavía no está bien diseñada e implementada, podemos irlo posponiendo"**. Las siguientes rutas existen en el filesystem pero NO están en uso real (0 `lesson_progress` rows en prod, sin alumnos reales):

| URL | Estado | Decisión |
|---|---|---|
| `/dashboard` | Construida | **Posponer** (LMS del alumno, sin uso) |
| `/aprender` | Construida | **Posponer** (LMS del alumno) |
| `/aprender/[courseSlug]` | Construida | **Posponer** |
| `/aprender/[courseSlug]/[lessonSlug]` | Construida | **Posponer** |
| `/inscripcion/[courseSlug]` | Construida | **Posponer** (funnel de inscripción) |
| `/pagar/[courseSlug]` | Construida | **Posponer** (checkout, sin cursos reales) |
| `/pagar/[courseSlug]/exito` | Construida | **Posponer** |
| `/cert/[folio]` | Construida | **Posponer** (cert sin alumnos) |

**Por qué posponer:**
- Sin uso real (0 `lesson_progress`, 0 alumnos activos).
- El diseño del LMS no está cerrado (David todavía no ha decidido cursos ni contenido).
- Invertir tiempo en estos endpoints sin producto listo es scope creep.
- Cuando David defina el catálogo de cursos, reactiva este bloque.

**Acciones inmediatas:** NINGUNA. Las rutas se mantienen en el filesystem (costo de borrarlas ahora = re-implementar cuando se reactive). Si David decide reactivar este bloque, NO se necesita reescribir código, solo conectar el LMS a cursos reales.

---

### 🟡 **POSPUESTO** — Rutas de la API del LMS

Mismo principio. Las siguientes APIs del LMS están implementadas pero sin uso real:

| Endpoint | Estado |
|---|---|
| `/api/qr/[courseSlug]` | Construido, sin uso |
| `/api/payments/create-checkout` | Construido, sin cursos reales |
| `/api/events/[id]/certificate/[attendeeId]` | Construido, sin certificados emitidos |

**Decisión:** MANTENER en código. NO son deprecated. Se reactivan cuando el LMS tenga cursos reales.

---

## 🗑️ **ELIMINADAS** (cleanup 2026-07-13)

Por instrucción de David ("los que no se usan y no tienen idea, probablemente también es mejor quitarlos"):

| URL | Archivos eliminados | Razón |
|---|---|---|
| `/admin/handoffs/*` | 4 archivos (page, HandoffsClient, loading, _actions) | "No tenía idea de la existencia de handoffs" |
| `/admin/system/bot-v2/*` | 3 archivos (page, _actions, BotV2Toggle) | "Ahora está implementado directamente en la pantalla de admin" + ya marcado LEGACY en el código |

**Total:** 7 archivos eliminados. **3 referencias** actualizadas (en `admin/not-found.tsx`, `admin/loading.tsx`, `admin/eventos/not-found.tsx`).

**Commit:** `chore(cleanup): elimina /admin/handoffs y /admin/system/bot-v2 (David no los reconocía)` en branch `chore/cleanup-unused-routes-2026-07-12`.

---

## 🚫 **NO crear** (decisión vigente)

URLs mencionadas en protocolos o docs que **NO se van a crear**:

| URL | Razón |
|---|---|
| `/admin/dashboard` | No existe. David no la pidió. Se queda sin existir. |
| `/admin/crm` | No existe. CRM fragmentado entre `/admin/handoffs` (legacy, eliminado) y APIs. Se queda sin existir hasta que David defina si quiere unificar. |
| `/admin/bot` | No existe. La funcionalidad está en `/admin/system` directamente. No se crea. |
| `/lms` | No existe. El LMS está en `/aprender` (que a su vez está pospuesto). No se crea. |

**Decisión:** Los protocolos pueden mencionar URLs que no existen. Se documenta el estado real, no se ajusta el código al protocolo.

---

## 📊 Resumen

| Categoría | Cantidad |
|---|---|
| **Rutas activas (público + admin + eventos + auth + API)** | ~80 |
| **Rutas pospuestas (LMS / cursos)** | 8 |
| **Rutas APIs pospuestas (LMS)** | 3 |
| **Rutas eliminadas (cleanup 2026-07-13)** | 2 (con 7 archivos) |
| **Rutas que NO se crearán** | 4 |

---

## 📚 Cross-refs

- `docs/OPEN_ITEMS.md` — gaps abiertos.
- `docs/SUPER_AUDIT_REPORT_2026.md` — súper-auditoría con 10 hallazgos [RESOLVED].
- `docs/AUDIT_GAPS_PROD_2026-07-12.md` — audit comprehensivo previo.
- Sprint commit: ver git log.
