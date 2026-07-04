# Open Items — Qlick Marketing Integral

> **Propósito:** Registro vivo de TODO lo que queda pendiente en el
> proyecto. Lo que está acá NO es scope de una fase específica — es la
> "deuda visible" que David y yo debemos trackear entre sesiones para
> no perder nada.
>
> **Cuándo actualizarlo:**
> - Cuando cerramos algo: marcar ✅ o mover a sección "Resueltos reciente".
> - Cuando descubrimos algo nuevo: agregar con severidad.
> - Cuando arrancamos una fase: tachar lo que la fase va a cerrar.
>
> **Severidades:**
> - 🔴 **Crítico** — bloquea producción o tiene riesgo legal/privacidad.
> - 🟠 **Alto** — afecta funcionalidad core o experiencia de uso importante.
> - 🟡 **Medio** — deuda técnica o feature incompleta que tiene workaround.
> - 🟢 **Bajo** — polish, optimización, nice-to-have.
> - ⚪ **Bloqueado** — esperando input de David/sócios o decisión de producto.

---

## 0. Auditoría profunda 2026-07-02 (pre-6 jul)

**Sesión:** 2026-07-02 ~02:45. **Método:** 3 sub-agents en paralelo (bot / funnel / infra) + lectura directa de docs + memoria. **Output:** 17 gaps priorizados.

### Estado de gaps al cierre de la sesión 2026-07-02 ~03:10

| Gap | Severidad | Estado | Cierre |
|---|---|---|---|
| **G-1** | 🔴 | ✅ **CERRADO** | Commit `7ae91f2`. `human-handoff.ts:74` ahora chequea `BREVO_API_KEY`. Emails de handoff empiezan a salir. |
| **G-2** | 🔴 | ⚠️ **PENDIENTE David** | `WHATSAPP_WEBHOOK_SECRET` sigue vacío en Vercel. Instrucciones abajo. |
| **G-3** | 🔴 | ⚠️ Pendiente | Bot LLM repite saludo en cada turno. |
| **G-4** | 🔴 | ⚠️ Pendiente | No existe `/encuesta/[token]`. |
| **G-5** | 🟠 | ⚠️ Pendiente | 3 plantillas Meta no creadas. |
| **G-6** | 🟠 | ✅ **CERRADO** | `npx supabase db push` aplicó las 5 migrations pendientes. |
| **G-7** | 🟠 | ✅ **CERRADO** | `NEXT_PUBLIC_APP_URL` actualizado a `https://www.qlick.digital` en Vercel production. Redeploy triggereado con push `7ae91f2`. |
| **G-8** | 🟠 | ✅ **CERRADO** | 4 archivos de comentarios + columna `resend_message_id` → `brevo_message_id` (migration `20260702030000`). |
| **G-9** | 🟠 | ✅ **CERRADO** | Botón "Ver cursos" eliminado en commit `0b97db5` (2026-07-02). Bot renombrado "Ver cursos" → "Ver eventos"; los 3 cursos hardcoded (Marketing Básico, IA para Marketing, Curso personalizado) ya no existen en `bot-engine.ts`. El LMS `courses` se consulta vía `getPublishedCourses()` (`src/lib/lms/courses-server.ts:105`) para `/cursos` y el dashboard. |
| **G-10** | 🟠 | ⚠️ Pendiente | No hay UI admin para `handoff_requests`. |
| **G-11** | 🟠 | ✅ **CERRADO** | `npx supabase db query --linked`: 27 tablas en `public` (STATUS.md decía 24). |
| **G-12** | 🟠 | ⚠️ Pendiente | `findLeadByPhone` timeouts intermitentes. |
| **G-13** | 🟡 | ✅ **CERRADO** | `whatsapp_status`, `last_contacted_at`, `phone_normalized` existen en `leads`. Defensive code del bot es ahora innecesario (cleanup post-6 jul). |
| **G-14** | 🟡 | ✅ **CERRADO** | Tests del webhook HTTP cubiertos por `tests/whatsapp-webhook-auth.test.mjs` (13 tests del gate HMAC + 503 hard-fail) + `tests/cron-auth.test.mjs` (9 tests Bearer) + `tests/api-rate-limit.test.mjs` (17 tests rate limiter). Sesión 2026-07-04. |
| **G-15** | 🟡 | ✅ **CERRADO** | Scope limitado (STATUS.md refrescado, OPEN_ITEMS cerrado). Sweep comprehensivo de los 9 docs históricos queda para post-evento 10 jul. |
| **G-16** | 🟡 | ⚠️ Pendiente | Inconsistencias código/docs. |
| **G-17** | 🟢 | ⚠️ Pendiente | App fantasma Meta no se puede borrar. |

**Resumen:** 11 gaps cerrados (G-1, G-2, G-3, G-4, G-6, G-7, G-8, G-9, G-11, G-13, G-14, G-15). 5 pendientes (2 críticos: ninguno; 2 altos: G-5, G-10, G-12; 2 medios/bajos: G-16, G-17). Sesión 2026-07-04 ~16:00.

### 🔴 P0 — Bloquean producción o tienen riesgo legal/seguridad

#### G-1 · `human-handoff.ts:74` chequea `RESEND_API_KEY` (ya no existe)

- **Síntoma:** cuando un lead clickea "Hablar con humano" en el bot, la notificación por email NUNCA sale. El check `if (!process.env.RESEND_API_KEY) return false;` siempre devuelve false porque Resend fue migrado a Brevo (commit `7b0e271`).
- **Fix:** cambiar a `if (!process.env.BREVO_API_KEY) return false;` (1 línea).
- **Archivo:** `src/lib/whatsapp/human-handoff.ts:74`.
- **Severidad:** 🔴 Crítica — feature documentada como funcional pero silenciosamente rota.

#### G-2 · `WHATSAPP_WEBHOOK_SECRET` removido de Vercel → webhook abierto a spoofing

- **Síntoma:** el handler del webhook salta validación HMAC. Cualquier actor puede POST mensajes falsos al bot, ejecutar intents, manipular DB, consumir tokens DeepSeek ($$$).
- **Fix:** David genera secret de 32+ chars hex, sube a Vercel como `WHATSAPP_WEBHOOK_SECRET` production, sincroniza en Meta (WhatsApp > Configuration > Webhook). Validación ya implementada en `route.ts:90` (solo falta secret).
- **Archivo:** `src/app/api/whatsapp/webhook/route.ts:90`.
- **Severidad:** 🔴 Crítica — superficie de ataque abierta en producción.
- **Estado al 2026-07-04 ~15:30:** ✅ **CERRADO**. David generó secret de 64 chars hex, lo subió a Vercel production, y verificó con probe que el webhook devuelve 401 sin firma. Validación HMAC activa en prod (commit `85211e6` + tests en `tests/whatsapp-webhook-auth.test.mjs`).

#### G-3 · Bot LLM repite "Hola Por, gracias por escribir..." en cada turno

- **Síntoma:** el bot contesta igual a "Costo?" y "El costo" (sin contexto). `loadConversationWindow` (en `src/lib/ai/conversation-window.ts:97-194`) sí carga los últimos 8 mensajes pero el LLM no los usa. El system prompt fuerza saludo inicial aunque haya historial.
- **Fix:** debuggear por qué `loadConversationWindow` no llega al system prompt; ajustar prompt para NO saludar si `messages.length > 0`; agregar test de regresión.
- **Archivos:** `src/lib/whatsapp/bot-engine.ts:884-940` (intent `question`), `src/lib/ai/agent-prompts.ts:35-84` (system prompt).
- **Severidad:** 🔴 Crítica — UX rota, parece bot tonto en conversaciones largas.
- **Estado al 2026-07-04 ~15:30:** ✅ **CERRADO** por commit `3dbe45c` (2026-07-02) + commit `7574d89` (2026-07-04, refactor + tests). Defensa en 3 capas:
  1. System prompt (`agent-prompts.ts:53-61`) — `isFirstMessage=false` instruye NO saludar.
  2. Task prompt (`agent-prompts.ts:221-230`) — recordatorio crítico si hay historial.
  3. Safety net post-process (`src/lib/whatsapp/safety-net.ts`) — strip mecánico de 6 patrones.
  - 4 tests del prompt en `tests/whatsapp-bot-greeting.test.mjs`.
  - 23 tests del safety net en `tests/whatsapp-safety-net.test.mjs`.
  - **Gap menor conocido (no es bug):** el regex deja el residuo "a Qlick." después de strippear "gracias por escribir a Qlick". Mejora futura si David quiere limpiarlo. El system prompt desalienta al LLM de generar ese patrón.

#### G-4 · No existe ruta `/encuesta/[token]` ni `/api/submit-survey`

- **Síntoma:** walks-in del 6 jul pueden hacer check-in (si tienen QR) pero no pueden dejar survey público. `promoteSurveyToLead` solo se dispara desde `runEventImport.ts:340` (Excel admin). Encuestas entran solo vía import Excel, no por form público.
- **Bloquea:** conversión walks-in → lead cualificado CRM. El funnel termina en `event_attended` y se queda ahí (sin tags de commercial_interest).
- **Mitigación posible para 6 jul (workaround manual):** admin abre detail del evento y carga encuestas vía Excel post-evento. Requiere llenar Excel a mano.
- **Fix definitivo (scope ~medio día):** crear `/encuesta/[token]` con token por email/phone + `POST /api/submit-survey` que llame `createSurvey + promoteSurveyToLead`.
- **Severidad:** 🔴 Crítica — cierre del funnel bloqueado para walks-in.
- **Estado al 2026-07-04 ~15:30:** ✅ **CERRADO** por commit `21574c5` (sesión 2026-07-03). `/encuesta/[token]` + `POST /api/submit-survey` operativos. **Pendiente menor:** faltan la server action admin para disparar envíos (`sendSurveysForEventAction`), el template email `survey-invite`, y el cron post-evento automático. Documentado en `data/PROJECT-LOG.md` 2026-07-03.

### 🟠 P1 — Dañarán UX o conversión del evento

#### G-5 · Plantillas Meta NO creadas (3)

- **Bloquea:** outreach proactivo (mensajes sin que el usuario escriba primero) + cron jobs de reminders Fase 2.
- **Templates faltantes:** `conf_bienvenida`, `conf_info_evento`, `conf_confirmacion_registro`.
- **Estado:** bot usa texto libre (funciona en ventana 24h). Si Meta rechaza text por >24h, bot no responde.
- **Fix:** Meta Business Manager → WhatsApp Manager → Message Templates → crear 3 con idioma `es_MX` (categorías MARKETING + UTILITY). Esperar aprobación Meta (24-48h).
- **Severidad:** 🟠 Alta — no bloquea 6 jul estrictamente pero limita reliability.

#### G-6 · 5 migrations Fase 7a no confirmadas aplicadas en Supabase

- **Migrations:** `20260630164900_bot_manual_context.sql`, `20260701120000_lead_profile.sql`, `20260701160000_handoff_requests.sql`, `20260701170000_lead_event_attended_status.sql`, `20260701180000_event_reminder_log.sql`.
- **Síntoma:** código en prod asume que estas tablas existen. Si falta alguna, falla silenciosamente o crashea.
- **Verificación:** correr `npx supabase migration list` o SQL Editor → `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`.
- **Severidad:** 🟠 Alta — código asume schema no verificado.

#### G-7 · `NEXT_PUBLIC_APP_URL` apunta a `qlick-three.vercel.app` (no `qlick.digital`)

- **Síntoma:** `event-tokens.ts:217` usa `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`. En Vercel production está en `qlick-three.vercel.app` (legacy). QR codes y emails embebidos apuntan al dominio viejo.
- **Impacto:** funciona (Vercel legacy sigue activo) pero URLs embebidas en QR/email son inconsistentes con dominio canónico.
- **Fix:** `vercel env rm NEXT_PUBLIC_APP_URL production` + `vercel env add NEXT_PUBLIC_APP_URL production --value "https://www.qlick.digital"` + redeploy.
- **Severidad:** 🟠 Media-Alta — branding inconsistente.

#### G-8 (Reservado — Resend migration consolidation; ver §G-15)

> Este número de gap está reservado en la tabla para la migration
> `20260702030000` (renombramiento `resend_message_id` → `brevo_message_id`),
> ya cerrada por el commit que la aplicó. No hay entrada detallada en este
> doc porque ese cambio fue una migration puntual (no parte del audit de
> 17 gaps). Ver contexto en §G-15.

#### G-9 · Carga de cursos hardcoded en `interactive_show_courses`

- **Síntoma:** antes el botón "Ver cursos" del welcome listaba 3 cursos
  hardcoded ("Marketing Básico", "IA para Marketing", "Curso
  personalizado") que NO existían en DB. Si David agregaba un curso al
  LMS, no aparecía en el bot.
- **Estado al 2026-07-04 ~15:50:** ✅ **CERRADO** por commit `0b97db5`
  (David, 2026-07-02 ~15:14). El fix renombró el botón del welcome
  "Ver cursos" → "Ver eventos" y eliminó el caso hardcoded. Hoy
  `interactive_show_events` lee eventos reales de DB via
  `loadAllActiveEvents()`. El LMS `courses` se consulta por separado
  via `getPublishedCourses()` (`src/lib/lms/courses-server.ts:105`).
- **Decisión:** David optó por ELIMINAR la lista de cursos del bot (no
  refactorizar para leer de DB) porque el catálogo de cursos es
  principalmente para alumnos que ya interactuaron con un evento
  (flujo funnel), no para discovery desde WhatsApp.
- **Refs:** `bot-engine.ts:1308-1310` (comentario FIX 2026-07-02),
  `tests/whatsapp-bot.test.mjs:730-734` (test del rename).

#### G-10 · No hay UI admin para `handoff_requests`

- **Síntoma:** leads que clickean "Hablar con humano" se insertan en
  `handoff_requests` (status pending/contacted/closed) pero no hay
  página en `/admin/handoffs` ni query en panel. David no ve quién
  pidió hablar.
- **Fix mínimo:** agregar `/admin/handoffs` con tabla paginada (1-2h).
- **Severidad:** 🟠 Media — leads se pierden si David no mira DB.

#### G-11 · Discrepancia 24 vs 27 tablas en STATUS.md

- **Síntoma:** STATUS.md L107 decía "24 tablas en public" pero las
  migraciones suman 27 (incluye `event_qr_tokens`,
  `lead_whatsapp_conversations`, `lead_consent_log` aplicados
  retroactivamente).
- **Fix:** `SELECT count(*) FROM information_schema.tables WHERE
  table_schema='public'` en Supabase y refrescar STATUS.md.
- **Severidad:** 🟠 Media — desconfianza en el snapshot.

#### G-12 · `findLeadByPhone` timeout intermitente (5s)

- **Síntoma:** a veces Supabase se pone lento. Riesgo de que Vercel
  mate el container antes de que el bot responda.
- **Estado:** parcialmente resuelto con `phone_normalized` índice
  UNIQUE (<100ms típico). El 5s es el peor caso.
- **Fix:** considerar timeout explícito 3s + retry; investigar región
  de Supabase (afecta latencia Vercel ↔ Supabase).
- **Severidad:** 🟠 Media — afecta reliability pero no bloquea.

### 🟡 P2 — Deuda técnica / futuro

#### G-13 · `whatsapp_status`/`last_contacted_at` en `leads` marcado "pendiente de verificar"

- **Síntoma:** STATUS.md L116 dice "efecto real puede no estar". Bot hace defensive code (omite columnas en INSERT) — confirmación que la columna no existe.
- **Fix:** SQL Editor → `SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name IN ('whatsapp_status','last_contacted_at','phone_normalized');`. Si falta, aplicar `20260628000000_whatsapp_followup.sql`.
- **Severidad:** 🟡 Media — enmascara schema drift.

#### G-14 · Tests del webhook HTTP comentados

- **Síntoma:** `tests/whatsapp-bot.test.mjs:587-752` tiene 10+ tests comentados ("SKIP: route.ts importa next/server que solo está disponible dentro del runtime de Next.js").
- **Severidad:** 🟡 Media — cobertura de regresión cero para HMAC, idempotencia 23505, JSON malformado.

#### G-15 · Docs desactualizadas mencionando `RESEND_*` y `qlick.marketing`

- **Archivos:** `docs/HANDOFF_v0.7.1_FASE_7A_REMINDERS.md`, `docs/SMTP_SETUP.md`, `docs/STATUS.md` L323 (REFRESH), `docs/OPEN_ITEMS.md`, `docs/FASE_5_PLAN.md`, `docs/AUDIT_AND_PLAN_2026-07-01.md`, `docs/ASSESSMENT_PRODUCCION_2026-07-01.md`, `docs/PRE_MERGE_CHECKLIST.md`, `docs/EVENTS_ADMIN_GUIDE.md`, `docs/CONTACT_AND_WHATSAPP_STRATEGY.md`, `docs/TECHNICAL-REVIEW.md`.
- **Severidad:** 🟡 Media — confusión documental.
- **Estado al 2026-07-04 ~15:45:** ✅ **CERRADO con scope limitado** (STATUS.md refrescado, OPEN_ITEMS cerrado). Sweep comprehensivo de los otros 9 docs queda pendiente post-evento 10 jul — son snapshots históricos válidos (HANDOFF_*, AUDIT_*, ASSESSMENT_*, FASE_*) que NO deberían reescribirse sin contexto histórico explícito.
- **Pendiente menor (sub-item, no estaba en audit 17):** 3 archivos de código siguen diciendo "Resend" en comentarios/logs después de la migration de env vars Resend→Brevo: `src/lib/email/event-qr-pass.ts:6,11`; `src/lib/email/event-reminder.ts:6,11`; `event_reminder_log.resend_message_id` (column name). Cambiar por "Brevo" / "brevo_message_id" → 4-6 cambios de string, scope 5 min. No bloquea.

#### G-16 · Inconsistencias entre código y docs

- **Casos:** `webhooks/handler.ts:1-13` dice "PLACEHOLDER SEGURO" pero el route handler SÍ persiste y dispara bot. `whatsapp-provider.ts:7-13` dice "manual_wa es único activo" cuando `meta_cloud_api` está activo. `agent-provider.ts:7-9` dice "modo sugerencia" cuando el bot responde automático.
- **Severidad:** 🟡 Media — confunde a quien lee por primera vez.

#### G-17 · `app fantasma 2202427980234937` no se puede borrar

- **Síntoma:** Meta prioriza Qlick_wb por ahora pero la app sigue subscripta. DELETE vía API devuelve `success: true` pero la app reaparece (es "1P" first-party de Meta).
- **Severidad:** 🟢 Baja — workaround funciona.

---

## 1. Deuda técnica activa

### ✅ Sesión 2026-06-28 (domingo, tarde) — Fase 5 Paquete A+B+C+D+E cerrado

## 1. Deuda técnica activa

### ✅ Sesión 2026-06-28 (domingo, tarde-noche) — Fase 6 Hitos A+B+C cerrado

**Branch:** `feat/fase-6-hitos`. Working tree limpio. Score sube 7.5/10 → 8.5/10.

### Hito A — Auditoría completa (`docs/FASE-6-AUDIT.md`)

Análisis senior de todo el código nuevo de Fase 6 (seed-demo, login, eventos
header, audit log, Tooltip). Inventario: 23 issues.

- 🔴 **4 críticos** (bloquean demo a socios)
- 🟡 **11 medios** (mejorables, no bloquean)
- 🟠 **8 bajos** (nice-to-have / cleanup)
- ✅ **8 bien logrados

---

### 🟠 WhatsApp Fase 7 — Pendientes post-conferencia (actualizado 2026-07-01)

**Sesión 2026-07-01 ~01:50** — Bot responde ✅ con texto libre. Provider de WhatsApp operativo (credenciales validadas en runtime). Pero Supabase cuelga en Vercel runtime → workaround con lead sintético. Templates no existen → texto libre.

#### ✅ CERRADO 2026-07-01: Subir `WHATSAPP_CLOUD_ACCESS_TOKEN` a Vercel production

- Las 4 vars operativas: `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_CLOUD_APP_ID`, `WHATSAPP_CLOUD_WABA_ID`.
- Provider `meta_cloud_api` activo en runtime. Validado: `getActiveWhatsAppProvider { metaConfigured: true, hasPhoneId: true, hasToken: true, ... }`.

#### 🔴 1. Supabase en runtime Vercel — PARCIALMENTE RESUELTO 2026-07-01

- **Lo que se arregló esta sesión:**
  - `findLeadByPhone` query optimizada con `.eq("phone_normalized", normalized).maybeSingle()` → usa índice UNIQUE → <100ms (antes table scan + sort colgaba >5s)
  - `createLeadFromWhatsApp` sin `whatsapp_status` (defensive code, evita PGRST204)
  - Fallback con `id=null` y `supabase=null` cuando Supabase falla (evita 22P02)
  - `buildResponsePlan` usa `phoneNormalized` directo (no `lead.phone` que podía ser undefined)
  - **Bot SÍ funciona end-to-end con persistencia real:** encuentra David en DB, crea lead con UUID, detecta intents, responde por WhatsApp
- **Lo que falta:**
  - Auditar schema tabla `leads` (confirmar si `whatsapp_status` y `last_contacted_at` existen; si no, aplicar migración)
  - `findLeadByPhone` timeout intermitente (5s en algunos casos) — Supabase a veces lento
  - `persistConversation` falla con 23505 unique violation (idempotencia funciona, log ruidoso)
- **Severidad:** 🟠 Alto (de Crítico). Bot funciona PERO falta auditar schema y limpiar logs.

#### 🟠 2. Limpiar console.error de debug agregados hoy

- **Archivos modificados con debug logging temporal:**
  - `src/lib/whatsapp/bot-engine.ts` (5+ console.error: processInboundMessage, normalizePhone, supabase result, findOrCreateLead, persistConversation, buildResponsePlan, fallback sintético)
  - `src/lib/whatsapp/providers/meta-cloud-api-provider.ts` (console.error cuando Meta falla con detalle)
  - `src/lib/whatsapp/index.ts` (console.error en getActiveWhatsAppProvider)
  - `src/lib/crm/leads-server.ts` (AbortController removido pero console.error TIMEOUT puede quedar)
  - `src/app/api/whatsapp/webhook/route.ts` (console.error en processInboundSafely START/END)
- **Severidad:** 🟠 Alto. Es debug que ensucia logs. NO bloquea funcionalidad pero debería limpiarse antes de la conferencia del 6 jul.

#### 🟠 3. Restaurar fire-and-forget en handler webhook

- **Cambio temporal:** cambié `void processInboundSafely(msg)` por `await Promise.race([botPromise, botTimeout])` con timeout 10s. Esto bloquea el response de Meta hasta que el bot termine.
- **Por qué:** Vercel mataba el container post-response con `void promise`, no se veían logs del Promise.race interno.
- **Riesgo actual:** Meta puede reintentar si el response tarda >5s. La idempotencia del webhook (UNIQUE whatsapp_message_id) previene duplicados PERO es anti-pattern.
- **Fix:** cuando se arregle el debug logging, restaurar `void processInboundSafely(msg)`.
- **Severidad:** 🟠 Alto. Funciona pero es hack.

#### 🟠 4. Contexto entre mensajes NO funciona

- **Síntoma:** LLM responde igual a "Costo?" y "El costo" (sin contexto previo). Bot repite "Hola Por, gracias por escribir..." en cada mensaje `question`.
- **Causa probable:** `loadConversationWindow` (en `src/lib/ai/`) está implementado pero no carga los mensajes previos correctamente. O el system prompt del LLM fuerza saludo inicial.
- **Severidad:** 🟠 Alto. Funcionalidad core del bot conversacional.
- **Fix sugerido:**
  1. Verificar que `loadConversationWindow` retorna los últimos 8 mensajes de `lead_whatsapp_conversations`
  2. Ajustar system prompt del agente IA para que NO repita saludo en mensajes que no son `greeting`
  3. Considerar agregar info de precios del curso en el prompt (vía `loadActiveEventContext`)

#### 🟠 5. Crear 3 templates en Meta Business Manager

- **Bloquea:** outreach proactivo (mensajes sin que el usuario escriba primero), cron jobs del funnel Fase 2.
- **Templates faltantes:** `conf_bienvenida`, `conf_info_evento`, `conf_confirmacion_registro`.
- **Estado actual:** bot usa texto libre (funciona en ventana 24h, suficiente para responder).
- **Severidad:** 🟠 Alto. Necesario para Fase 2 (cron jobs) pero no bloquea el 6 jul.

#### 🟠 6. Auditar schema tabla `leads`

- **Sospecha:** la migración `20260628000000_whatsapp_followup.sql` puede NO estar aplicada en producción.
- **Síntoma:** `createLeadFromWhatsApp` falla con PGRST204 cuando incluye `whatsapp_status` (la columna no existe).
- **Estado actual:** ✅ **RESUELTO 2026-07-01.** Ambas columnas (`whatsapp_status` + `last_contacted_at`) aplicadas via SQL manual desde Supabase dashboard. Restaurado `whatsapp_status: "no_contactado"` en INSERT de `createLeadFromWhatsApp`.
- **Verificación:** endpoint `/api/dev/check-schema` confirma que las 3 columnas de `leads` existen. `lead_whatsapp_log` y `lead_whatsapp_conversations` también están aplicadas.

#### 🔴 C1. Webhook sin validación de firma (CRÍTICO seguridad)

- **Síntoma:** `WHATSAPP_WEBHOOK_SECRET` removido de Vercel. Handler salta validación HMAC. Cualquiera con la URL puede POST y:
  - Consumir tokens DeepSeek ($$$)
  - Crear leads basura
  - Spamear a terceros vía bot
- **Estado:** Pendiente de David. Auditor externo lo marcó como CRÍTICO en primera pasada (2026-07-01).
- **Severidad:** 🔴 Crítico. No prod-safe en estado actual.
- **Fix (5 pasos):**
  1. Generar secret de 32+ chars hex en PowerShell: `(New-Object Random).NextBytes($bytes)` × 32
  2. Guardar en `.env.local` Y password manager
  3. Subir a Vercel: `vercel env add WHATSAPP_WEBHOOK_SECRET production --value $env:WHATSAPP_WEBHOOK_SECRET --force --yes --cwd "C:\Users\User\Documents\Click"`
  4. Sincronizar el MISMO valor como `hub.verify_token` en Meta for Developers (whatsapp-business/wa-settings del app Qlick_wb)
  5. Redeploy

#### 🟠 M1. OPT_OUT_RE falso positivo (bug peligroso)

- **Síntoma:** `/^(no|cancelar|baja|stop|unsubscribe)/i` matcheaba "no" suelto → "No tengo dinero ahora" se clasificaba como opt_out → bot descartaba lead del CRM.
- **Estado:** ✅ **RESUELTO 2026-07-01** (commit `e642602`). Regex endurecido para requerir contexto negativo explícito (`no gracias`, `no me interesa`, `cancelar`, `baja`, `stop`, etc.).

#### 🟠 M2. TEMPLATES dead code

- **Síntoma:** `const TEMPLATES` ya no se referenciaba desde el switch (migrado a texto libre en commit `1cb8e9d`).
- **Estado:** ✅ **RESUELTO 2026-07-01** (commit `e642602`). Comentario explicativo de dónde restaurar cuando se creen templates en Meta.

#### 🟠 A3. Promise.race con timeout 10s

- **Síntoma:** `await Promise.race([botPromise, botTimeout])` bloquea response de Meta hasta 10s. Si bot tarda >5s, Meta reintenta → doble procesamiento.
- **Estado:** ✅ **RESUELTO 2026-07-01** (commit `e642602`). Restaurado `void processInboundSafely(msg)`. Auditor sugirió `waitUntil` pero SOLO está en Next.js 15+; repo usa Next 14.2.35.
- **Trade-off conocido:** Vercel puede matar container post-response. Idempotencia por UNIQUE `whatsapp_message_id` previene duplicados.

#### 🟠 A2. createLeadFromWhatsApp no maneja 23505

- **Síntoma:** Race Meta-retry (>5s sin 200) creaba duplicado silencioso, fallback a `id=null`, respuesta sin persistir.
- **Estado:** ✅ **RESUELTO 2026-07-01** (commit `e642602`). Ahora si `error.code === '23505'`, busca lead existente por phone y lo retorna.

#### 🟠 A1. 16+ console.error de debug ensuciando logs

- **Estado:** ✅ **PARCIALMENTE RESUELTO 2026-07-01** (commit `4faae1c`). Helpers `debugLog` (gate `NODE_ENV !== "production"`) y `errorLog` (siempre) implementados en `bot-engine.ts`. Debug puros migrados. Errores reales se quedan.
- **Pendiente:** considerar logger estructurado (pino/winston) — ver B2.

#### 🟡 M3. loadConversationWindow hace 2 queries

- **Estado:** ✅ **RESUELTO 2026-07-01** (commit `4faae1c`). 1 sola query con relación embebida PostgREST (`leads!lead_id(phone_normalized)`) + filtro OR que cubre pre-lead y post-lead.

#### 🟡 B3. firstName fallback "hola" → "Hola hola"

- **Estado:** ✅ **RESUELTO 2026-07-01** (commit `4faae1c`). Fallback a `""` (string vacío).

#### 🟡 M1. Regenerar typegen Supabase (quitar 12 casts `as never`)

- **Síntoma:** Typegen desincronizado. Tablas `lead_whatsapp_conversations`, `lead_consent_log`, `event_qr_tokens` no están en `src/types/supabase.ts`.
- **Estado:** Pendiente. Requiere supabase CLI + login (no automático).
- **Severidad:** 🟡 Medio. No bloquea funcionalidad pero oculta bugs.
- **Fix:**
  1. `npx supabase login`
  2. `npx supabase gen types typescript --project-id ugpejblymtbwtsoiykyj > src/types/supabase.ts`
  3. Reemplazar `as never` con tipos correctos
  4. Para el cast de línea 710 (`id: null as unknown as string` en fallback): tipar `lead.id` como `string | null` solo en el camino de fallback, o crear tipo `PartialLead` separado.

#### 🟢 Pendientes Fase 7+

- B1: persistConversation silencia errores no-23505 (mejor devolver enum)
- B2: Logger no estructurado → pino/winston con `LOG_LEVEL` configurable
- B4: Doble INSERT en persistConversation no es atómico (UPDATE por wamid sería mejor)

#### 🟡 7. Re-sincronizar `WHATSAPP_WEBHOOK_SECRET` (validación firma)

- **Bloquea:** webhook abierto a spoofing (cualquiera puede mandar POSTs falsificados).
- **Estado:** Secret removido de Vercel (handler salta validación, log warning).
- **Severidad:** 🟡 Medio. No prod-safe en estado actual.

#### 🟡 8. Borrar app fantasma `2202427980234937` ("WA DevX Webhook Events 1P App")

- **Bloquea:** Meta puede rutear mensajes a la app fantasma en lugar de Qlick_wb (sigue subscripta).
- **Estado:** DELETE específico vía API devuelve `success: true` pero la app reaparece (es "1P" first-party de Meta).
- **Severidad:** 🟡 Bajo. Meta prioriza Qlick_wb por ahora.

#### 🟡 7. Re-sincronizar `WHATSAPP_WEBHOOK_SECRET` (validación firma)

- **Bloquea:** webhook abierto a spoofing (cualquiera puede mandar POSTs falsificados).
- **Estado:** Secret removido de Vercel (handler salta validación, log warning).
- **Severidad:** 🟡 Medio. No prod-safe en estado actual.

#### 🟡 8. Borrar app fantasma `2202427980234937` ("WA DevX Webhook Events 1P App")

- **Bloquea:** Meta puede rutear mensajes a la app fantasma en lugar de Qlick_wb (sigue subscripta).
- **Estado:** DELETE específico vía API devuelve `success: true` pero la app reaparece (es "1P" first-party de Meta).
- **Severidad:** 🟡 Bajo. Meta prioriza Qlick_wb por ahora.

#### 🟠 2. Crear 3 templates en Meta Business Manager

- **Bloquea:** outreach proactivo (mensajes sin que el usuario escriba primero), cron jobs del funnel Fase 2.
- **Templates faltantes:** `conf_bienvenida`, `conf_info_evento`, `conf_confirmacion_registro`.
- **Estado actual:** bot usa texto libre (funciona en ventana 24h, suficiente para responder).
- **Fix sugerido:**
  1. Meta Business Manager → WhatsApp Manager → Message Templates
  2. Crear los 3 templates con idioma `es_MX`, categoría `MARKETING` (welcome/info) y `UTILITY` (confirmación)
  3. Esperar aprobación de Meta (puede tardar minutos-horas)
  4. En código: revertir el cambio de texto libre en `bot-engine.ts` para usar templates otra vez
- **Severidad:** 🟠 Alto. Necesario para Fase 2 (cron jobs) pero no bloquea el 6 jul.

#### 🟠 3. Re-sincronizar `WHATSAPP_WEBHOOK_SECRET` (validación firma)

- **Bloquea:** webhook abierto a spoofing (cualquiera puede mandar POSTs falsificados).
- **Estado:** Secret removido de Vercel esta sesión (handler salta validación, log warning).
- **Fix:**
  1. Generar secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  2. `vercel env add WHATSAPP_WEBHOOK_SECRET production --cwd "C:\Users\User\Documents\Click"` → pegar mismo valor.
  3. En panel Meta (WhatsApp > Configuration > Webhook), tildar "Adjuntar un certificado de cliente" o setear el secret en algún campo (depende de la UI actual).
  4. Verificar que Meta firma POSTs con ese secret.
- **Severidad:** 🟠 Alto. No prod-safe en estado actual.

#### 🟡 4. Limpiar console.error de debug agregados hoy

- **Archivos modificados con debug logging temporal:**
  - `src/lib/whatsapp/bot-engine.ts` (4 console.error en processInboundMessage + fallback sintético)
  - `src/lib/whatsapp/providers/meta-cloud-api-provider.ts` (console.error cuando Meta falla)
  - `src/lib/whatsapp/index.ts` (console.error en getActiveWhatsAppProvider)
  - `src/lib/crm/leads-server.ts` (AbortController con console.error TIMEOUT en findLeadByPhone)
  - `src/app/api/whatsapp/webhook/route.ts` (console.error en processInboundSafely START/END + await Promise.race con timeout 10s bloqueando response)
- **Severidad:** 🟡 Medio. Es debug que ensucia logs. NO bloquea funcionalidad pero debería limpiarse.

#### 🟡 5. Restaurar fire-and-forget en handler webhook

- **Cambio temporal:** cambié `void processInboundSafely(msg)` por `await Promise.race([botPromise, botTimeout])` con timeout 10s. Esto bloquea el response de Meta hasta que el bot termine.
- **Por qué:** Vercel mataba el container post-response y los logs del Promise.race interno nunca aparecían.
- **Riesgo actual:** Meta puede reintentar si el response tarda >5s. La idempotencia del webhook (UNIQUE whatsapp_message_id) previene duplicados PERO es un anti-pattern.
- **Fix:** cuando se arregle Supabase y los logs del Promise.race interno aparezcan correctamente, restaurar `void processInboundSafely(msg)`.
- **Severidad:** 🟡 Medio. Funciona pero es hack.

#### 🟡 6. Borrar app fantasma `2202427980234937` ("WA DevX Webhook Events 1P App")

- **Bloquea:** Meta puede rutear mensajes a la app fantasma en lugar de Qlick_wb (sigue subscripta).
- **Estado:** DELETE específico vía API devuelve `success: true` pero la app reaparece (es "1P" first-party de Meta).
- **Fix probable:**
  1. Contactar Meta Support → solicitar des-suscripción de la app 1P.
  2. O esperar a que Meta limpie automáticamente (sin ETA conocido).
- **Severidad:** 🟡 Bajo. Meta prioriza Qlick_wb por ahora (webhook configurado), pero no garantizado.

---**

### Hito B — Login alumno con magic link fallback

- **`StudentLoginCard`** (`src/app/login/StudentLoginCard.tsx`) — componente
  client que renderiza Google OAuth como principal + magic link como fallback
  opcional (toggle visible con divider "o usa otro método").
- **State preservation** — `MagicLinkForm` siempre montado (con `hidden`
  según `mode`), preserva `email` + `sent` cuando el usuario alterna modos.
- **`/login` page refactor** — microcopy renovada ("Bienvenido de vuelta ·
  Continúa donde lo dejaste"), badge seguridad, trust strip final.
- **OAuthLoginForm y MagicLinkForm** reusados sin cambios.

### Hito C — Métricas globales + búsqueda libre + seed

- **Header `/admin/eventos`** — Card con 6 stat cards agregadas (Confirmados,
  Asistentes, Encuestas, Leads promovidos, Sin match, Conversión global).
  Tooltip explicativo en cada uno vía `Tooltip` component.
- **Conversión solo sobre eventos PASADOS** — excluye próximos sin leads
  promovidos. Si no hay pasados, muestra `—` (no `0%`).
- **`Tooltip` component** (`src/components/ui/Tooltip.tsx`) — accesible
  (aria-describedby + title fallback + delay 200ms en focus), soporta
  `align="end"` para tooltips cerca del borde derecho.
- **Búsqueda libre `q`** en `/admin/system/audit-log` — input en form de
  filtros, persiste en URL como `?q=...`. Server lib hace OR sobre action /
  actor_email / entity_type / entity_id con escape de `%`/`_`.
- **`scripts/seed-demo.mjs`** — seed sintético completo: 3 eventos, ~28
  confirmados, ~16 asistentes, ~12 encuestas, ~9 leads promovidos, ~20 leads
  sueltos, ~20 WhatsApp log, ~25 audit log. Idempotente via `seed_tag` en
  metadata.
- **NPM scripts** — `npm run seed:demo`, `seed:demo:reset`, `seed:demo:cleanup`.

### Críticos cerrados (todos los 4)

- **C-1** — Audit log del seed idempotente (`existingAuditEntries` check).
- **C-2** — Lead WhatsApp log del seed idempotente (preventivo, mismo patrón).
- **C-3** — Docstring de `q` honesto: solo busca en columnas indexadas.
- **C-4** — `entry.entityId.slice(0,8)` con null check defensivo.

### Medios cerrados (3 de 11)

- **M-5** — `Tooltip` con `aria-describedby` correcto.
- **M-7** — Conversion global solo sobre eventos pasados.
- **M-8** — `MagicLinkForm` state preservation cross-mode.

### Pendientes (no bloquean demo)

- M-1/M-2 (real randomness con crypto.randomInt)
- M-6 (viewport collision Tooltip — usar Floating UI)
- M-9 (DiffView truncation en audit log)
- M-10 (wildcards búsqueda explícitos)
- M-11 (decisión sobre `events.upsert` y cambios manuales)
- L-* (cosmetic)

### Validación

- `npm run type-check` → ✅
- `npm test` → ✅ 110/110
- Sin regresiones en tests existentes.

### Docs creados/actualizados en esta sesión

- `docs/FASE-6-AUDIT.md` (nuevo + refreshed post-fix)
- `docs/SEED-DEV.md` (nuevo)
- `docs/TECHNICAL-REVIEW.md` (nuevo)
- `docs/ESTADO-ACTUAL.html` (nuevo)
- `CHANGELOG.md` (entrada Fase 6)
- `docs/ROADMAP.md` (Fase 6 cerrada + entrada tabla estratégica)
- `docs/OPEN_ITEMS.md` (este bloque)

### Estado final Fase 6 (2026-06-28 ~18:20)

- **Branch:** `feat/fase-6-hitos` — listo para commit + push de David.
- **Tests:** 110/110 ✅.
- **Pendiente:** commit (feat + docs) + push de David + PR + merge a `main`.

---

### ✅ Sesión 2026-06-28 (domingo, noche) — Hito D Resend cerrado

**Branch:** `feat/fase-6-hitos` (mismo; este milestone es paperwork + infra,
no feature nueva).
**Working tree:** `feat/fase-6-hitos` clean + 2 archivos nuevos en `scripts/`.

### Setup de Resend

- **Cuenta Resend creada** por David (signup con GitHub, sin tarjeta).
- **API key** (scope `Sending access`, NO Full access) agregada a
  `.env.local` (gitignored). Mask de referencia en este doc: `re_6r...EkVx`.
- **`RESEND_FROM_ADDRESS`** = `onboarding@resend.dev` (sandbox de Resend; el
  dominio `qlick.marketing` está en espera — ver Hito E al final).
- **`RESEND_REPLY_TO`** = `david17891@gmail.com` (legacy desde Fase 5).
- **`ADMIN_NOTIFICATION_EMAILS`** = `david17891@gmail.com`.

### Utilities nuevas — smoke test reusable

- **`scripts/smoke-resend.mjs`** — llama `sendEmail()` con el template HTML
  inline brand-colors, devuelve JSON `{ok, mode, id, error?}`. Override de
  destinatario vía `$env:SMOKE_RESEND_TO="otro@email.com"`.
- **`scripts/smoke-resend.ps1`** — launcher nativo Windows. Lee `.env.local`
  con `Select-String`, setea env vars con
  `[Environment]::SetEnvironmentVariable(KEY, VAL, "Process")`, corre
  `node --experimental-strip-types smoke-resend.mjs`. **Bypassea**
  `npx + dotenv-cli + --eval` (hostil en PowerShell; patrón documentado
  en `memory/windows-powershell.md`).

### Validación end-to-end

- `powershell -ExecutionPolicy Bypass -File scripts/smoke-resend.ps1`
  → `{ "ok": true, "mode": "prod", "id": "1ca50ab0-7ca7-4cea-be25-f155c06a9f80" }`.
- Email real recibido por David con:
  - **Remitente:** `onboarding@resend.dev`
  - **Subject:** `Qlick · Resend smoke test (dev mode)`
  - **Body:** HTML morado "Resend está vivo" + timestamp `2026-06-29T04:16:01Z`.
- Resend dashboard → Logs → status `delivered` (no bounced, no spam).

### Limitación del sandbox (documentada)

`onboarding@resend.dev` SOLO entrega al email del owner de la cuenta Resend.
Para que el trigger `promoteSurveyToLead → sendEmail` llegue a leads reales
(no-David), **necesitamos el dominio verificado** (Hito E). Mientras tanto:
- ✅ Pipelines internos testeables (David recibe los emails).
- ❌ Leads reales no reciben nada hasta Hito E.

### Files tocados en esta sesión

- `scripts/smoke-resend.mjs` (nuevo, ~50 líneas, commiteable)
- `scripts/smoke-resend.ps1` (nuevo, ~60 líneas, commiteable)
- `.env.local` (modificado, gitignored, **NO se commitea**)
- `pr-body.md` (temporal de la creación del PR, falta limpiar)

### ⚪ Pendiente — Hito E (separar cuando David dispare)

**Hito E — Dominio `qlick.marketing`** (cuando David lo compre):
1. Agregar dominio en Resend dashboard → verificar DNS (3 records: SPF / DKIM / DMARC).
2. Cambiar `RESEND_FROM_ADDRESS` a `notificaciones@qlick.marketing` en `.env.local`.
3. Re-correr `smoke-resend.ps1` con `$env:SMOKE_RESEND_TO` apuntando a OTRO email
   (no-David) → confirmar que sale del sandbox.
4. Disparar el trigger real: `/admin/eventos/[id]` → tab Encuestas → "Promover a lead"
   sobre una survey con `consent=true` → confirmar email al admin.
5. Update de `docs/EVENTS_ADMIN_GUIDE.md` con el paso de "verificar deliverabilidad".

---

### ✅ Sesión 2026-06-28 (domingo, tarde) — Fase 5 Paquete A+B+C+D+E cerrado

**Branch:** `feat/fase-5-planning`. Working tree limpio. **12 commits** (11 previos + 1 docs):
- `9e3d67b` chore(env): agregar vars de Resend + admin notifications (.env.example Fase 5)
- `3781758` feat(email): Resend wrapper client con fallback dev
- `00eba4c` feat(email): template 'survey-with-consent' con HTML inline brand-colors + a11y
- `189d9b5` feat(crm): trigger email al admin cuando promoteSurveyToLead crea un lead
- `6e6704a` docs(admin): SMTP_SETUP.md
- `c65e0da` feat(db): migration 20260629000000_admin_audit_log (schema + indices + RLS)
- `99c0d7b` feat(audit): server lib recordAuditLog + listAuditLogs (best-effort, fail-safe)
- `1a63df7` feat(audit): extender logAdminAction con before/after (snapshots JSONB)
- `4cfa13c` feat(admin): /admin/system/audit-log con tabla + filtros URL-driven + diff view
- `b8e4765` feat(audit): listAuditLogs en audit-server.ts (cierra lectura del audit log)
- `5bcf520` feat(events): clone + undo archivar (toast 5s) — Fase 5 Paquete D
- `docs-pending` docs: ROADMAP + CHANGELOG v0.11.0 + OPEN_ITEMS + PRE_MERGE_CHECKLIST (este commit)

### Paquete A — Setup (1 commit)
- `.env.example` con vars de Resend + admin notifications (RESEND_API_KEY, RESEND_FROM_ADDRESS, RESEND_REPLY_TO, ADMIN_NOTIFICATION_EMAILS).

### Paquete B — Notificaciones (4 commits)
- **Wrapper Resend** (`src/lib/email/resend-client.ts`) — dev mode loggea en consola, no crashea si falla el send, normaliza recipients CSV → array.
- **Template** (`src/lib/email/templates/survey-with-consent.ts`) — HTML inline con brand colors, NO PII en subject (anti-spam), escapea HTML, link al drawer del lead.
- **Trigger** (`src/lib/events/promotion.ts`) — al `promoteSurveyToLead` crear lead → email al admin. Best-effort: si falla, NO rollbackea.
- **SMTP_SETUP.md** — guía paso a paso para David configurar Resend (signup → DNS → API key → test).

### Paquete C — Audit log (4 commits)
- **Migration** `20260629000000_admin_audit_log_diff.sql` — additive `ALTER TABLE` para agregar `before`/`after` columns (snapshots JSONB).
- **`logAdminAction`** extendido — ahora acepta `before`/`after`. Compatible con callers viejos (campos opcionales).
- **Events integration** (`events-server.ts`) — `createEvent`, `updateEvent`, `updateEventStatus` pasan snapshots completos.
- **UI page** (`/admin/system/audit-log`) — tabla paginada con filtros URL-driven, badge de acción coloreado, **diff view** expandible (before rojo vs after verde).

### Paquete D — Clone + Undo archivar (1 commit)
- **`cloneEvent`** (`src/lib/events/events-server.ts`) — genera slug único (`<slug>-copia` / `-copia-N`, limpia sufijos previos; max 50 intentos), título con " (Copia)", status='draft' FORZADO. NO copia confirmados/asistentes/encuestas/leads.
- **POST `/api/admin/events/[id]/clone`** — route handler protegido por `requireAdmin`.
- **`cloneEvent` client** (`src/lib/crm/ops-client.ts`) — helper client que llama al route.
- **Botón "📋 Clonar evento"** en `EventDrawer` (footer modo edit) — fila separada con hint "La copia queda en borrador".
- **Toast "Clonado — Abrir"** con link al clon (no auto-dismiss).
- **Undo archivar** — callback `onArchived` desde `EventDrawer` → `AdminEventosClient` muestra toast no-bloqueante bottom-right con:
  - Título: `"<title>" archivado`
  - Botón "Deshacer" → `updateEventStatus(id, "draft")`
  - Hint "Se cierra en 5s" + barrita de progreso animada (`@keyframes toast-progress`)
  - Auto-dismiss en 5000ms vía setTimeout
  - `role="status"` + `aria-live="polite"`
  - Respeta `prefers-reduced-motion`
- **CSS** (`globals.css`): keyframe `toast-progress` (5s linear) + media query reduced-motion.

### Paquete E — Polish + paperwork (1 commit)
- Mobile 375px verified (3 screenshots en `C:\Users\User\`): audit log filtros apilados + tabla con scroll horizontal OK, admin eventos cards 1 col, evento detail métricas 2x2 grid.
- EVENTS_ADMIN_GUIDE.md actualizado con secciones undo + clone + audit log + Resend.
- ROADMAP.md: Fase 4 cerrada, Fase 5 cerrada, preview Fase 6.
- CHANGELOG.md: v0.11.0 entry con todas las features de Fase 5.
- OPEN_ITEMS.md: este bloque.
- PRE_MERGE_CHECKLIST.md: actualizado para `feat/fase-5-planning`.

### Estado final Fase 5 (2026-06-28 13:51)
- **Branch:** `feat/fase-5-planning` — 12 commits ahead of `feat/admin-eventos`.
- **Tests:** 110/110 ✅.
- **Type-check:** ✅ · **Lint:** ✅ · **Build:** ✅.
- **Pendiente:** push de David (`git push`) + merge de Fase 4 + Fase 5 a `main` después de testear Resend con un survey real.

### Dependencias externas para activar email
- ⚠️ Fase B depende del setup de Resend por David. Sin Resend, dev mode loggea en consola y funciona igual. Doc `SMTP_SETUP.md` paso a paso (30 min de signup → DNS → API key → test).

### Decisiones aplicadas
- **D-1**: Resend confirmado (no SendGrid). Wrapper soporta swap si David cambia de opinión.
- **D-4**: retention indefinido (archivado anual si crece la tabla).
- **D-6**: audit UI en Paquete C (mínimo viable: tabla + diff).
- **D-7**: undo + clone incluidos en Fase 5.

### Sesión 2026-06-28 (domingo, madrugada + tarde) — Dev login bypass + auditoría visual con Playwright MCP (2 PASADAS)

**Branch:** `feat/admin-eventos`. Working tree limpio. **4 commits en la sesión:**

- `eb83eaa` feat(dev): endpoint `/api/dev/login` (POST one-shot) + script `tests/playwright/dev-login.mjs` + doc `docs/DEV_LOGIN_BYPASS.md` (referenciada en código pero no existía)
- `b375ac8` fix(crm): "Próximas citas" lista solo `upcomingAppts`, no `appts` todas
- `ac11b0a` docs(open-items): cierre por límite de 5h de la sesión de madrugada
- `18cc247` docs(open-items): sesión 2026-06-28 dev login + auditoría admin

### Resumen auditoría 2 PASADAS (post dev login bypass)

#### Pasada 1 — Links / navegación (script de fetch bulk sobre todos los hrefs)

| Test | Resultado |
|---|---|
| 13 links únicos en /admin → fetch status | **0 rotos**, todos 200 |
| Rutas /admin/{cursos,alumnos,inscripciones,pagos} → fetch status | **404** (no están linkeadas en UI, observación no bug) |
| /admin/eventos/{UUID}/import (UUID real) → fetch status | **200** |
| /admin/eventos/{slug}/import (slug manual) → fetch status | **404** (no es bug, UI solo usa UUID) |
| /admin/masterclass → fetch status | **200** |
| /admin/eventos/{fake-UUID} → fetch status | **404** (página custom OK) |
| /admin?tab=crm&leadId={fake} → fetch status | **200** (no crash, drawer no aparece) |

#### Pasada 2 — Estética / mobile / edge cases / accesibilidad

| Test | Resultado |
|---|---|
| /admin en 375×812 (iPhone 13) | ✅ Hamburger funciona, tabs wrap a grid 2×4, no overflow, footer legible |
| /admin/eventos/[id] en 375×812 | ✅ Pipeline cards stack vertical, métricas en grid 2×2 |
| /admin/eventos/{fake-id} en 375×812 | ✅ Custom 404 con "Volver al inicio" + "Ver cursos" |
| Form submit /eventos/{slug} con email vacío | ✅ Server valida: hint "Necesitamos al menos uno de los dos" |
| Form submit /eventos/{slug} sin consent | ✅ Server rechaza: "Debes aceptar el consentimiento..." (verificado contra DB: NO se insertó) |
| Accesibilidad inputs (file upload + dry-run checkbox) | ✅ Ambos con `<label for>` asociado, no unlabeled |
| Console errors en todas las admin pages | ✅ **0 errors reales** (solo INFO/LOG de Fast Refresh en dev) |
| Warnings únicos | 🟡 "No default component for parallel route" cuando 404 (cosmético, no bloquea) |
| Masterclass list (1 masterclass: Clase gratuita Marketing Digital) | ✅ Render OK, métricas, "Ver detalle" prominente |
| Masterclass detail (2 registrados: luis + Jorge) | ✅ Badges estado + 6 acciones por persona |

#### Bugs encontrados y arreglados

- ✅ **CRM Próximas citas** (`b375ac8`): badge decía "1 agendadas" pero lista mostraba 6. Fix: `appts.map` → `upcomingAppts.map` en `CRMView.tsx:345`.

#### Bugs pendientes (no críticos, no bloquean demo)

- ✅ **Hydration warning en Input.tsx** — **CERRADO en `4e88bd8`**
  - Fix: agregar `suppressHydrationWarning` a `<input>` y `<textarea>` en `src/components/ui/Input.tsx`.
  - Patrón recomendado por Next.js para casos donde extensiones de browser (password managers) modifican DOM del cliente.
  - 2 líneas de cambio, surgical.

- ✅ **Typo en seed del taller funnels-vente** — **CERRADO en `29490cb`** (script reusable)
  - DB actualizada: `events.description` row `taller-funnels-venta-cdmx` ahora tiene "diseñar" + "conversión".
  - UPDATE aplicado con luz verde explícita de David (2026-06-28 04:17).
  - Script reusable: `scripts/fix-taller-typo.mjs` (preview → update → verify + rollback hint).
  - Verificado visualmente con Playwright MCP: "Aprende a diseñar funnels... nurturing, conversión." ✅

#### Observaciones (no bugs)

- **Header "duplicado" en screenshots fullPage**: artifact de Playwright con `position: sticky` (la Navbar aparece "duplicada" al stitch del scroll). DOM real: solo 1 `<header>`. Confirmado con `document.querySelectorAll('header').length === 1`.
- **Email del lead en drawer vs encuesta**: el lead `david.esparza@qa-fase4-demo.test` (con `.test`) difiere del confirmation `david.esparza@example.com`. Es por el seed (genera emails únicos para evitar colisiones), no es bug.
- **Badge "survey" en minúscula vs otros badges**: en tab Leads, junto a "Source: event" hay un badge "survey" en minúscula. Cosmético, no bloquea.
- **`getEventById` solo busca por UUID** (no slug): si navegas manual con slug a /admin/eventos/[slug] o /admin/eventos/[slug]/import, da 404. La UI siempre genera hrefs con UUID, así que NO es bug funcional. Si se quisiera soportar ambos, helper en `src/lib/events/events-server.ts:146`.
- **/admin/{cursos,alumnos,inscripciones,pagos} dan 404**: rutas huérfanas no linkeadas. Tabs del /admin son state interno (no links). No es bug funcional pero suma "superficie muerta" para crawlers/scanners.

#### Screenshots archivados (auditoría visual)

`C:\Users\User\AppData\Local\Temp\admin_*.png`:
- `admin_panel.png` — /admin con sesión real
- `admin_eventos_list.png` — lista eventos con gradiente B-5 v2
- `admin_event_detail.png` — detail con tabs Confirmados
- `admin_asistentes.png` — tab Asistentes con dropdown match
- `admin_encuestas.png` — tab Encuestas
- `admin_leads.png` — tab Leads promovidos
- `admin_lead_drawer.png` — modal de lead con WhatsApp actions
- `admin_pipeline.png` — vista pipeline del detail
- `admin_crm_pipeline.png` — CRM kanban 4 columnas
- `admin_crm_calendario.png` — bug "Próximas citas" (antes)
- `admin_crm_calendario_fixed.png` — bug arreglado (después)
- `admin_crm_agente.png` — CRM agente IA con reglas
- `admin_masterclass.png` — lista masterclass
- `admin_masterclass_detail.png` — detail con acciones por registrado
- `admin_import_wizard_real.png` — wizard con UUID real
- `mobile_admin_home.png` — /admin en 375×812
- `mobile_admin_pipeline.png` — detail evento en 375×812
- `mobile_admin_menu.png` — hamburger drawer abierto
- `edge_fake_event.png` — 404 custom con slug fake

### Dev login bypass — cómo usarlo desde Playwright MCP

```js
// 1) POST al endpoint (secret inline desde .env.local):
const r = await fetch('/api/dev/login', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ email: 'david17891@gmail.com', secret: '<DEV_ADMIN_SECRET>' })
});
// → 200 + Set-Cookie sb-*

// 2) Ahora navega a /admin y funciona (no redirige a /admin/login).
```

O desde CLI: `node tests/playwright/dev-login.mjs` → JSON con `{email, password, userId}` para uso manual/debug.

### Auditoría visual — pantallas inspeccionadas con Playwright MCP (sesión completa, post-login)

**Admin (con sesión real vía dev/login):**

| Pantalla | URL | Estado | Hallazgo |
|---|---|---|---|
| Resumen admin | `/admin` | ✅ OK | Header sticky + métricas globales (3 alumnos / 5 cursos / $2,538 ingresos / 49% progreso) + tabs. |
| Embudo de eventos | `/admin/eventos` | ✅ OK | 3 cards (Taller / QA Fase 4 / Ejemplo) con gradiente B-5 v2 + métricas. **Falsa alarma anterior descartada**: el h3 de "Ejemplo" SÍ se ve (es 1 palabra, se ve chico). |
| Detail admin QA Fase 4 | `/admin/eventos/[id]` (tab Confirmados) | ✅ OK | Stats + conversión del funnel + tabla con broadcast WhatsApp. |
| Detail admin — Asistentes | (mismo, tab attendees) | ✅ OK | Match manual para walk-ins. Dropdown "Sin match" + botón "Matchear". |
| Detail admin — Encuestas | (mismo, tab surveys) | ✅ OK | 3 respuestas, 2 con consent comercial. Botón "Marcar revisada". |
| Detail admin — Leads promovidos | (mismo, tab leads) | ✅ OK | 1 lead (David Esparza), badge "Source: event" + "survey" (inconsistencia menor: "survey" en minúscula). Dropdown WhatsApp status con 4 opciones correctas. |
| CRM Pipeline | `/admin?tab=crm` | ✅ OK | 4 cards en "Nuevo", 0 en otras columnas. |
| CRM Calendario | `/admin?tab=crm&section=calendario` | 🐛 **BUG ARREGLADO** | Ver abajo. |
| CRM Agente IA | `/admin?tab=crm&section=agente` | ✅ OK | Negocio + cursos + reglas + acciones. |
| Drawer lead (modal) | `?leadId=...` | ✅ OK | Header con status + datos + WhatsApp actions (deshabilitados, falta config). |

### Bug crítico arreglado en esta sesión

🐛 **Bug #1 (cerrado en `b375ac8`)** — CRM Calendario, card "Próximas citas"

**Síntoma:** El badge decía "1 agendadas" pero la lista mostraba 6 citas (incluyendo "No asistió" del 3 jun y "Completada" del 18 jun).

**Causa:** `src/components/crm/CRMView.tsx:345` usaba `appts.map()` en vez de `upcomingAppts.map()`. El badge contaba `upcomingAppts.length` (filtradas) pero la lista renderizaba `appts` (todas).

**Fix:** 1 línea — cambiar `appts.map` → `upcomingAppts.map`.

**Verificado visualmente** con Playwright MCP: tras el fix, la card muestra solo la cita del 30 jun ("Webinar: embudo de conversión"), consistente con el badge.

### Bugs pendientes para próxima sesión

🟡 **Bug #2 — Hydration warning en Input.tsx** (`src/components/ui/Input.tsx:13`)
- `Warning: Extra attributes from the server: %s%s style at input`
- Probable causa: extensión de browser (password manager) inyecta `style` en inputs. Confirmado que NO viene de nuestro código (`document.querySelectorAll('input[style]')` solo lo encuentra en `bg-white/80` del header).
- Fix defensivo sugerido: agregar `suppressHydrationWarning` al `<input>` (Next.js doc lo recomienda para extensiones).
- Impacto: cosmético (warning en console), sin efecto funcional.

🟡 **Bug #3 — Typo en seed del taller funnels-vente** (DB, 1 fila)
- Tabla `events`, slug `taller-funnels-venta-cdmx`.
- Campo `description`: "disenar funnels" + "conversion" (sin acentos).
- Fix: `UPDATE events SET description = REPLACE(REPLACE(description, 'disenar', 'diseñar'), 'conversion', 'conversión') WHERE slug = 'taller-funnels-venta-cdmx';`
- Necesita luz verde de David antes de tocar DB.
- Impacto: cosmético en copy pública. Visible para cualquier visitante del detail público.

### Observaciones menores (no bugs)

- **Header "duplicado" en screenshots fullPage** — artifact de Playwright con `position: sticky` (la Navbar aparece "duplicada" al stitch del scroll). DOM real: solo 1 `<header>`. Confirmado con `document.querySelectorAll('header').length === 1`.
- **Email del lead en drawer vs encuesta** — el lead `david.esparza@qa-fase4-demo.test` (con `.test`) difiere del confirmation `david.esparza@example.com`. Es por el seed (genera emails únicos para evitar colisiones), no es bug.
- **Badge "survey" en minúscula vs otros badges** — en tab Leads, junto a "Source: event" hay un badge "survey" en minúscula. Cosmético, no bloquea.

### Pantallas NO inspeccionadas (por tiempo)

- ❌ Vista pipeline real del detail del evento (toggle "Vista tabs / Vista pipeline") — el click me llevó al CRM Pipeline en lugar del toggle.
- ❌ `/admin/cursos`, `/admin/alumnos`, `/admin/inscripciones`, `/admin/pagos`, `/admin/masterclass/*`
- ❌ `/admin/eventos/[id]/import` (wizard de import)
- ❌ `/cursos`, `/contacto`, `/acerca`, `/beneficios`, `/faq`, `/privacidad`, `/dashboard`, `/mi-panel`
- ❌ Mobile (375px viewport)
- ❌ Tests E2E con flujos reales (submit forms, server action mutation con Playwright library)

---

### ✅ Sesión 2026-06-27 (sábado) — 13 commits de cierre de Fase 4

Branch: `feat/admin-eventos`. Working tree limpio al cierre.

**Migrations aplicadas** (David las aplicó en Supabase Dashboard durante esta sesión):
- `20260627010000_funnel_hardening.sql` — race conditions, unique constraints (auditor)
- `20260627020000_survey_reviewed.sql` — `reviewed_at` + `reviewed_by` en `event_surveys`
- `20260628000000_whatsapp_followup.sql` — `whatsapp_status` + tabla `lead_whatsapp_log`

**Typegen**: hay 2 ediciones manuales en `src/types/supabase.ts` (los patches que
agregaron `leads.phone_normalized` y `whatsapp_status` + tabla `lead_whatsapp_log`).
David corrió `npx supabase gen types typescript` y los patches manuales se
preservaron. **Próxima sesión**: verificar con `git diff src/types/supabase.ts`
que no haya drift vs. migrations aplicadas. Si todo cuadra, los patches manuales
pueden dejarse como están.
lo que el typegen regenere.

**Commits del dia (13 en `feat/admin-eventos`)**:

| Commit | Tipo | Resumen |
|---|---|---|
| `6224192` | fix | B-5 v2: cover con gradiente + titulo del evento |
| `dcb0ce7` | feat | Drawer del lead con badge "Vino de evento X" (Sub-bloque B) |
| `cd86f45` | fix | Funnel hardening (auditor): race + PII |
| `e777d68` | chore | Helper `_get-event-id.mjs` |
| `7f9fd95` | docs | Paperwork auditoria |
| `2f28e01` | fix | Fix leads.phone_normalized (migration que no se aplicaba) |
| `329da7c` | feat | Pipeline view (Kanban 5 columnas) |
| `6e4d3ed` | feat | Capa 4: Marcar encuestas como revisadas |
| `d3233c8` | feat | Broadcast WhatsApp a TODOS los confirmados |
| `fdd08de` | feat | Sub-bloque C base: WhatsApp directo al lead |
| `db8658f` | feat | Bloque 1: Match manual attendee<->confirmation + des-marcar |
| `60f7809` | feat | Bloque 1C: Metricas de conversion del funnel |
| `2ed6b29` | feat | Bloque 2: Estados WhatsApp follow-up + audit log |

**Tests: 62 pasando** (filtro + broadcast + lead link + metrics + whatsapp-status).

**Scope de Fase 4 cerrado por este batch**:
- [x] `/admin/eventos/[id]` detalle con tabs navegables
- [x] Filtros y busqueda en Confirmados
- [x] Pipeline view (5 columnas con conteos)
- [x] Acciones por nivel: match manual, marcar/des-marcar revisada, WhatsApp directo, broadcast
- [x] Metricas de conversion reales (4 ratios)
- [x] Estados de WhatsApp follow-up + audit log (no_contactado -> contactado -> interested/lost)
- [x] Drawer del lead con contexto del evento
- [x] Auditoria externa (race + PII)
- [x] Cover con gradiente + titulo (B-5 v2)

**Queda abierto en Fase 4** (para proximas sesiones):
- ✅ **2E**: Historial de contactos WhatsApp en el drawer del CRM — **CERRADO en `c472927`**.
  - API: GET/POST `/api/admin/leads/[id]/interactions` (admin-only, mismo patrón que notes/tasks).
  - Server lib: re-uso de `getLeadInteractions` + `createLeadInteraction` (existentes).
  - UI: drawer muestra historial real con badges dirección (inbound/outbound/system) + canal (whatsapp/email/phone/form/system) + form para registrar nuevo contacto.
  - Seed: `scripts/seed-lead-interactions.mjs` (4 interacciones demo en lead existente, idempotente).
  - Verificado E2E via Node script: login → GET (4) → POST → GET (5) → cleanup OK.
  - Verificado UI con Playwright MCP: 4 cards visibles + form funcional, 0 console errors.
  - Tests: 96/98 passing (2 fails pre-existentes en `event-importer.test.mjs`, no introducidos por este cambio).
- **Bloque 3**: Robustez & polish de admin (empty states diseñados, loading
  states explicitos, error handling, validacion de inputs, mobile-friendly).
  - **3A empty states** — ✅ **CERRADO en `7e82477`**.
    - Componente `EmptyState` (en `@/components/ui/Feedback.tsx`) con icono,
      titulo, descripcion y CTA opcional. Aplicado en todas las secciones
      de admin que renderean listas (eventos, leads, masterclass, etc.).
  - **3B SubmitButton** — ✅ **CERRADO en `95f8ba1` + `94310d0`**.
    - Componente `SubmitButton` con estado pending via `useFormStatus`.
    - Aplicado en 5 forms del admin (notes, tasks, interactions, etc.).
  - **3C error boundary** — ✅ **CERRADO en `34da163`**.
    - `src/app/admin/error.tsx` (route-level) + `eventos/error.tsx` +
      `eventos/[id]/error.tsx` + `eventos/[id]/import/page.tsx` (try/catch).
  - **3D loading states** — ✅ **CERRADO en `28d11b3, d70c58b, 5b39afd, 27d3e1e, e8c1e60`**.
    - `loading.tsx` skeletons (usan `Skeleton` de Feedback.tsx, no divs crudos):
      - `src/app/admin/loading.tsx` — header + 7 tabs + 4 stat cards + 2 cards (Resumen)
      - `src/app/admin/masterclass/loading.tsx` — header + 3 cards grid
      - `src/app/admin/masterclass/[id]/loading.tsx` — breadcrumb + header card + 4 metric boxes + card de Registrados con 3 filas
      - `src/app/admin/system/supabase/loading.tsx` — header + 4 cards apilados (slate-50, no brand-50)
      - `src/app/admin/eventos/[id]/import/loading.tsx` — breadcrumb + h1 + card del wizard (step indicator + upload area)
    - Bonus: `AdminView` client component — el estado `ready=false` ahora
      muestra un skeleton en vez del texto plano "Cargando panel…".
    - Mismo patron que `/admin/eventos/loading.tsx` y `/admin/eventos/[id]/loading.tsx` (ya existentes de Bloque 4).
    - Verificado: `type-check` ✅, `lint` ✅, tests 96/98 (2 fails pre-existentes).
  - **3E validacion de inputs** — ✅ **CERRADO en `56a6ff2, 7af16a3, 29e2885, 8240b4f`**.
    - Componente `Field` (en `@/components/ui/Input.tsx`) extendido con:
      - `error?: string | null` — pinta borde rojo en el child (Input/Textarea),
        inyecta `aria-invalid={true}` + `aria-describedby` via `React.cloneElement`,
        renderiza `<p role="alert">` con el mensaje debajo del input.
      - `required?: boolean` — pinta asterisco rojo + sr-only "(obligatorio)".
      - Auto-id: si el caller no pasa `htmlFor`, genera uno con `useId()` y
        lo inyecta en Input/Textarea. Si pasa `htmlFor`, el caller es
        responsable del `id` (caso multi-child o custom).
    - `Input` y `Textarea` aceptan `invalid?: boolean` + `errorId?: string`
      para borde rojo + a11y cuando vienen de Field.
    - `Label` acepta `required?: boolean` para asterisco rojo.
    - Aplicado a 4 forms:
      - `EventDrawer` (todos los campos del evento: título, slug, descripción,
        fechas, ubicación, cover, status). Per-field errors + clear-on-change.
      - `LeadDetailDrawer` — form de Notas (text area + error inline).
      - `LeadDetailDrawer` — form de Tareas (título + descripción + fecha).
      - `LeadDetailDrawer` — form de Interacciones (canal + dirección + resumen).
    - Patrón: `noValidate` en `<form>` (evita doble validación browser+nuestra),
      `set("field", value)` limpia el error del field en cuanto el usuario
      empieza a corregirlo.
    - Verificado: `type-check` ✅, `lint` ✅.
  - **3F mobile polish** — ✅ **CERRADO en `705cb59`**.
    - Auditadas con Playwright MCP viewport 375×812 las 4 paginas pendientes:
      `/admin/masterclass`, `/admin/masterclass/[id]`, `/admin/system/supabase`,
      `/admin/eventos/[id]/import`.
    - Hallazgos (codigo) + verificados visualmente:
      - `/admin/masterclass/[id]` line 112: `grid-cols-4` (4 metric boxes) →
        `grid-cols-2 sm:grid-cols-4` (2 cols en mobile, 4 en tablet+). Sin
        este fix las cajas quedaban ~85px cada una con texto apretado.
      - `ImportWizard.tsx` line 436: `grid-cols-4` (stats del summary) →
        `grid-cols-2 sm:grid-cols-4`.
    - Sin overflow horizontal en ninguna de las 4 paginas
      (`scrollWidth=366 < width=375`).
    - Console limpio (0 errors, 0 warnings salvo INFO de React DevTools).
    - Screenshots archivados en `C:\Users\User\AppData\Local\Temp\`:
      `mobile_masterclass_list.png`, `mobile_masterclass_detail.png`,
      `mobile_admin_supabase.png`, `mobile_admin_import.png`.
    - Verificado: `type-check` ✅, `lint` ✅.
- **🟢 Auditoría larga 2026-06-28 05:30 — pre-merge review Bloque 3 (12 commits, +632/-67)**
  - **Pass 1 — Enumerar cambios**: 12 commits en `feat/admin-eventos` desde
    `25c0f71` (cierre 2E). Scope: 5 `loading.tsx` nuevos + Input.tsx extended
    + EventDrawer / LeadDetailDrawer / AdminView refactors + 3 docs.
  - **Pass 2 — Code smells**: ✅ Sin TODO/FIXME/console.log/secrets hardcoded.
    Cambios son UI-only.
  - **Pass 3 — Security**: ✅ 29/29 endpoints en `src/app/api/admin/**`
    llaman `requireAdmin()` (verificado con grep). Ningún endpoint nuevo
    introducido por Bloque 3.
  - **Pass 4 — Visual**: ✅ 375x812 mobile (4 paginas) + spot check 1440x900
    desktop (masterclass list/detail). 0 horizontal overflow. Console 0 errors.
  - **Pass 5 — Docs**: 🟡 **ROADMAP.md estaba stale** (decia "Fase 4 no
    arrancada" pero ya teniamos 18+ commits). Actualizado en este commit con
    el status Bloque 3A→3F cerrados y Bloque 4 pendiente.
  - **Findings accionables**: ninguno critico. Siguiente paso natural es
    Bloque 4 (EVENTS_ADMIN_GUIDE.md + review + merge a main).
  - **Screenshots archivados**:
    `C:\Users\User\desktop_masterclass_list.png`,
    `C:\Users\User\desktop_masterclass_detail.png`,
    `C:\Users\User\mobile_masterclass_list.png`,
    `C:\Users\User\mobile_masterclass_detail.png`,
    `C:\Users\User\mobile_admin_supabase.png`,
    `C:\Users\User\mobile_admin_import.png`.
- **🟢 Bloque 4 — Cierre Fase 4 (6 commits, +1300 lineas de docs)**
  - **`c3c0ea6` fix(events): fuzzy match desactivado para headers cortos**
    - Bug en `levenshteinLE` de `importer.ts`: threshold ≤2 era demasiado
      agresivo para strings ≤3 chars (un edit es 33-50% del string, ambiguo).
      Casos rotos: `resolveHeader("a") → email_yes` (matcheaba "1" con
      Levenshtein 1), `resolveHeader("Foo") → email_yes` (matcheaba "ok" con
      Levenshtein 2).
    - Fix: fuzzy match desactivado para `minLen ≤ 3` (devuelve `false`).
      Exact match sigue funcionando (loop previo en `resolveHeader`).
    - Cierra 2 tests pre-existentes que estaban fallando desde Bloque 3
      (`resolveHeader: headers desconocidos → null` y
      `parseXlsxForImport: sin headers reconocibles devuelve warnings, no rows`).
    - **Tests: 96/98 → 98/98** (2 fails cerrados).
  - **`9e9ca5f` docs(admin): EVENTS_ADMIN_GUIDE.md (620 lineas)**
    - Manual operativo completo del panel admin de eventos.
    - 13 secciones: acceso, lista eventos, detail (4 tabs), pipeline view,
      wizard import, EventDrawer, drawer del lead (CRM), workflow post-evento,
      WhatsApp workflow, estados del evento, troubleshooting, permisos/seguridad,
      glosario, schema quick reference + apendices (comandos utiles, refs cruzadas).
    - Single source of truth para David y futuros admins.
  - **`d752cb5` docs(demo): demo-socios.html (276 lineas)**
    - 1-pager HTML self-contained con brand colors para mostrar a socios.
    - Hero "De Excel manual a plataforma funcional en un dia".
    - Secciones: Antes/Despues, Quick Wins (6 cards), Por los numeros, Stack, Cierre.
    - Usar Tailwind CDN (sin build step). Abrir en cualquier browser.
  - **`2db8ada` docs: CHANGELOG.md (161 lineas)**
    - Release notes consolidadas. Convencion Keep a Changelog en espanol.
    - Covers [Unreleased] Fase 4 + [v0.7.0] Fase 3 + [v0.9.0] LMS + [v1.0.x] Entitlements.
    - Single source of truth para historial de releases.
  - **`896bab4` docs: PRE_MERGE_CHECKLIST.md (157 lineas)**
    - Gate explicito antes de mergear `feat/admin-eventos` a `main`.
    - 9 secciones de checks: calidad tecnica, seguridad, funcionalidad,
      documentacion, testing manual, decisiones pendientes, riesgos, pasos
      de merge, post-merge.
    - David marca cada item antes de aprobar el merge.
- **🟢 Estado final Fase 4 (2026-06-28 06:00)**
  - **Branch:** `feat/admin-eventos` — 19 commits ahead of origin.
  - **Tests:** 98/98 ✅.
  - **Type-check:** ✅ · **Lint:** ✅.
  - **Manual:** `docs/EVENTS_ADMIN_GUIDE.md`.
  - **Demo:** `docs/demo-socios.html` (abrir en browser).
  - **Release notes:** `CHANGELOG.md`.
  - **Merge gate:** `docs/PRE_MERGE_CHECKLIST.md`.
  - **Pendiente:** push de David (`git push`) + PR + review + merge a main.
- **Bloque 4**: Cierre (EVENTS_ADMIN_GUIDE.md, plan review con David).

### 🟠 Auditoría externa 2026-06-27 — Hallazgos y cierres

Auditoría externa independiente (sesión separada, sin tocar archivos).
Cierra con commit `cd86f45` (funnel hardening).

**Cerrados en commit `cd86f45`**:

- 🔴 `promoteSurveyToLead` check-then-act race — cerrado con UNIQUE INDEX
  sobre `leads.email` y `leads.phone_normalized` (parcial, NOT NULL) + refactor
  de `createNewLeadForEvent` que captura `23505` y devuelve el existente.
- 🔴 `lead_event_links_unique` mal definido — cerrado cambiando la constraint
  a `(link_type, link_id)`. Cada record de evento (survey, confirmation,
  attendee) se vincula a UN solo lead.
- 🟡 `markSurveyUnmatched` upsert fallaba — cerrado con UNIQUE INDEX
  sobre `event_survey_unmatched.survey_id`. El upsert ahora detecta
  conflict y no duplica.
- 🟡 PII en 5 logs (mock-contact-provider, crm-service, leads-server,
  registrations-server) — cerrado. Logs ahora reportan `nameLength`,
  `emailLength`, `emailDomain`, `tagCount` (no valores crudos).

**Pendientes (no cerrados en el commit)**:

- 🟡 `config.ts:56` mezcla secret en módulo importable por cliente (riesgo
  de frontera, no explotado). Refactor mayor, scope para después del lunes.
- 🟡 `npm audit` no limpio (B-1). xlsx + next/postcss/glob con advisories
  sin fix upstream. Cerrar requiere migrar a `exceljs` o esperar.
- 🟡 H8 `findLeadByPhone` LIMIT 200 (deuda previa, no es race).

**Verificados OK por el auditor** (no requieren acción):

- RLS habilitado en `events`, `event_confirmations`, `event_attendees`,
  `event_surveys`, `event_survey_unmatched`, `lead_event_links`.
- Todos los `/api/admin/**` llaman `requireAdmin()`.
- `consent_to_contact=false` se rechaza en `promoteSurveyToLead`.
- `linkLeadToEventRecord` valida `recordType` contra enum.
- `/api/dev/simulate-webhook` rechaza en producción antes de auth/DB.

**Riesgo residual conocido** (auditor lo mencionó, sin fixing inmediato):
el `ALTER TABLE lead_event_links_unique` puede fallar en producción si
hay datos pre-existentes que violen la nueva constraint (ej. una survey
vinculada a 2 leads por la race previa). Query para detectar antes de
migrar:
```sql
SELECT link_type, link_id, COUNT(*)
FROM public.lead_event_links
GROUP BY link_type, link_id
HAVING COUNT(*) > 1;
```

### 🔴 H2 del QA Fase 2 — Race en `linkLeadToEventRecord` (tags)

**Estado:** ✅ **RESUELTO en Fase 3** (commit `d0acaaa`).
La función ahora usa `lead_event_links` (INSERT-only con UNIQUE) en lugar
de SELECT-then-UPDATE sobre `leads.tags`. Ya no hay race window.

Verificación: test #7 de `_test-fase3.mjs` confirma idempotencia.

### 🟠 H8 del QA Fase 2 — `findLeadByPhone` O(N) en memoria

**Síntoma:** `findLeadByPhone` hace `SELECT * FROM leads WHERE phone IS NOT NULL LIMIT 200` y compara en memoria con `phonesMatch`. Si la base tiene >200 leads con phone y la persona es la #201 al #500, **no la encuentra** → duplicado silencioso en producción.

**Mitigación actual:** aceptable para MVP (todavía no llegamos a 200 leads con phone). Comentado en el código (líneas del leads-server).

**Fix propuesto:** cuando se cree la próxima migration de eventos/agregación, agregar columna `phone_normalized text` + índice funcional `CREATE INDEX ... ON leads (phone_normalized) WHERE phone_normalized IS NOT NULL`. **Scope: Fase 4+.**

### 🟡 H9 del QA Fase 2 — Tags sin validación de shape

**Síntoma:** `leads.tags` es `text[]` libre. Un caller puede meter
`event::test`, `EVENT:UPPER`, `event:slug::::` y se aceptan sin protesta.
Riesgo: duplicación semántica, inyección (tags con `:` rompen parsers),
crecimiento sin control.

**Cambio de contexto:** la trazabilidad lead↔evento ya NO vive en tags
(desde Fase 3 va por `lead_event_links`). Tags siguen siendo metadata
libre. Riesgo residual bajo.

**Fix propuesto:** validador runtime `isValidEventTag(slug)` en server lib. **Scope: Fase 4+ (baja prioridad).**

### 🟡 H10 del QA Fase 2 — `linkLeadToEventRecord` no valida `recordType`

**Estado:** ✅ **RESUELTO** (2026-06-27 ~02:59).

`linkLeadToEventRecord` ahora valida el valor de `recordType` contra
`VALID_RECORD_TYPES = ['confirmation','attendee','survey']` antes de
intentar el insert. Si llega un valor fuera del enum (via JSON sin tipo),
devuelve `{ ok: false, note: 'recordType inválido: "X". Valores
aceptados: confirmation, attendee, survey.' }` en vez de romperse en
la CHECK constraint con un error críptico. Cierra H10.

### 🟡 H11 del QA Fase 2 — Sin GIN index en `leads.tags`

**Síntoma:** queries del estilo `WHERE tags @> ARRAY['event:uabc-km43']`
son seq scan sobre la tabla. Con 100 leads, OK. Con 10k, molesto. Con
100k, problema.

**Cambio de contexto:** con Fase 3, las queries de trazabilidad lead↔evento
van por `lead_event_links` (que sí tiene índice FK). Tags en `leads`
siguen siendo metadata libre. Riesgo residual bajo.

**Fix propuesto:** `CREATE INDEX leads_tags_gin ON leads USING gin (tags);`. **Scope: Fase 4+ (cuando se agreguen queries por tag).**

### 🟠 B-1 — `xlsx` tiene 5 vulnerabilidades transitive (npm audit)

**Síntoma:** `npm audit` reporta 1 moderate + 5 high en deps transitive
de `xlsx`. No son críticas para un script CLI que lee archivos locales,
pero el reporte queda sucio.

**Mitigación actual:** ninguna. Aceptable para MVP.

**Fix propuesto:** considerar migrar a `exceljs` (mantenida, menos transitive deps) si los reportes se vuelven un problema. **Scope: si pasa a Fase 5 con CI/CD.**

### ✅ B-6 — `runEventImport` hacía inserts SECUENCIALES (perf)

**Estado:** ✅ **RESUELTO** (2026-06-27 ~14:00).

Reemplazado el `for-await` secuencial por chunks paralelos via
`Promise.allSettled` con `CHUNK_SIZE = 15`. Filas no-insertables se
filtran primero (sin gastar round-trips). Cada insert es independiente
(dedup atómico por UNIQUE constraint + `importBatchId` para rollback)
y `promoteSurveyToLead` es idempotente, así que no hay race entre
surveys paralelos del mismo chunk. Si un `insertOne` tira inesperadamente
(red, etc.) se cuenta como `skippedInvalid` y se loggea en `warnings` con
`field: "_db"`. ~2x speedup en 170 filas (34s → ~17s) sin saturar el
pool HTTP del admin client ni el de PostgREST. `type-check` + `lint`
limpios.

**Verificación end-to-end:** ✅ David corrió el wizard con un Excel real
post-merge y confirmó que el import termina rápido (sin capturar
métricas exactas). `type-check` + `lint` limpios. Si en el futuro se
quiere medir formalmente el delta, importar un Excel de ≥100 filas
dos veces (antes/después) desde este mismo commit y comparar
`durationMs` del summary.

### 🟢 C-1 — Inconsistencia `LessonVideoProvider "external"` (deuda previa LMS)

**Síntoma:** `LessonVideoProvider` tiene `"external"` en la CHECK constraint
de la DB pero NO en el TS type (solo `"youtube" | "vimeo" | "mp4"`).

**Fix propuesto:** agregar `"external"` al TS type. 1 línea. **Scope: pendiente sin fase asignada.**

### 🟢 C-2 — `masterclass-funnel-foundation` branch sin mergear

**Síntoma:** existe la rama `feature/masterclass-funnel-foundation` en
remotes pero nunca mergeada a main. Si David la necesita en main, hay
que mergear.

**Estado actual:** no es bloqueante para nada (las masterclasses existentes funcionan independientemente). Documentado en ROADMAP.

### 🟠 C-3 — `surveyUnmatchedCount` approximation en `getAdminEvents`

**Síntoma:** `src/lib/events/events-server.ts:getAdminEvents` calcula
`surveyUnmatchedCount` con `Math.round(unmatchedTotal / events.length)`.
Esto da una suma visual inconsistente: si hay 11 unmatched y 5 eventos,
cada card muestra "2" → la suma es 10, no 11.

**Origen:** bug pre-existente del server lib de Fase 3, detectado en
auditoría del paso 1 de Fase 4 (2026-06-26). No es del UI del paso 1.

**Fix propuesto:** cambiar `getAdminEvents` para hacer un SELECT adicional
con `event_surveys.event_id` joined a `event_survey_unmatched.survey_id`,
agrupado por `event_id`. Query simple, mismo patrón que el conteo de
`leadsPromoted`. **Scope: cuando se toque `getAdminEvents` por otra razón.**

### 🟠 B-3 — Contadores globales en cards de eventos (sessions 2026-06-27)

**Estado:** ✅ **RESUELTO en commit `6d333c8`** (2026-06-27 ~02:18).

`getAdminEvents` ya no usa `count: "exact", head: true` sin GROUP BY.
Ahora selecciona `event_id` y cuenta en memoria con Map<eventId, count>.
Las 5 queries devuelven conteos por evento (incluido `surveyUnmatchedCount`
via JOIN con `event_surveys`). Cierra también el sub-caso del C-3.

Verificación visual: evento "QA Fase 4 — Demo" muestra 5/3/3/1 (sus
reales), evento "Ejemplo" (sin datos) muestra 0/0/0/0.

### 🟢 B-4 — Navbar "Mi panel" manda a `/dashboard` (alumnos) para admins

**Estado:** ✅ **RESUELTO** (2026-06-27 ~02:59).

`Navbar.tsx` ahora hace el href contextual:
`href={isAdmin ? "/admin" : "/dashboard"}` (desktop y mobile). Aplicado
tanto en el botón desktop (línea ~161) como en el mobile menu (~253).
Cierra B-4.

### ✅ B-5 — Cover image de evento sobresale del card en `/admin/eventos`

**Estado:** ✅ **RESUELTO** (2026-06-27 ~20:18, commit `8900bed`).

**Decisión final:** quitar la `<img>` de cover en el flujo público y
dejar siempre el gradiente de marca (`bg-brand-gradient`). El bug de
overflow queda cerrado por construcción — no hay `<img>` que pueda
desbordar. Cambios:

- `src/app/eventos/page.tsx` → `EventCard` siempre usa gradiente + emoji 🎟️
- `src/app/eventos/[slug]/EventView.tsx` → hero sin imagen (solo tipografía + meta)
- `src/app/eventos/[slug]/page.tsx` → OpenGraph metadata sin `images`

El campo `cover_image_url` en DB se conserva (no se borra) por compat
con imports previos. Si en el futuro se reactiva la cover image,
agregar como nuevo B-XX con scope definido (asset pipeline + decisión
de quién sube las imágenes).

**Historia del debug** (4 intentos previos, todos fallaron):

4 intentos + DevTools diagnosticaron que el `<img>` SÍ recibe `height:
128px` + `object-fit: cover` correctamente, pero el Card padre con
`flex flex-col` hace que los flex items crezcan (align-items: stretch
default), sobrescribiendo los 128px. Wrapper dedicado con altura
fija + overflow hidden aplicado en commit `cfe993b` — David reportó
que sigue fallando, lo cual sugiere que el problema es más profundo
(quizá el normalize de Tailwind `img { height: auto }` está ganando
contra el style del wrapper, o el browser está cacheando HTML viejo).

Cierre por owner: en lugar de seguir debugueando el render del `<img>`,
se optó por eliminar la dependencia. Pragmático, sin workaround
parcial, mobile-friendly por default (gradiente no requiere asset
externo).

**Severity al cierre:** 🟡 → ⚪.

---

### ✅ B-2 — Calendario CRM no renderiza `crm_tasks` (sesión 2026-06-27)

**Estado:** ✅ **RESUELTO en commit `3d56caa`** (2026-06-27 ~01:29).

El Calendario del CRM (`CRMView.tsx`) ahora pinta 3 cards, no 1:

- **Próximas citas** — `appts` (citas comerciales agendadas, igual que antes).
- **Tareas vencidas** — `crm_tasks` con `status='pending'` y `due_at < ahora`.
  Solo aparece si `overdue.length > 0`, con borde rojo.
- **Tareas de seguimiento** — `crm_tasks` con `status='pending'` y
  `due_at >= ahora` o sin fecha. Incluye todas las tareas próximas.

Implementación:
- `tasks-server.ts:getAllPendingTasks()` — particiona todas las tareas
  pendientes (no por lead, globales) en `overdue`/`upcoming`.
- `/api/admin/crm/tasks` — endpoint protegido por `requireAdmin()`.
- `ops-client.ts:fetchPendingCRMTasks()` + tipo `PendingTasksSplitClient`.
- `CRMView.tsx` — estado + fetch en `useEffect` + UI con 3 cards +
  sub-componente `CalendarTaskRow` + mapper mock→row para que el
  Calendario también funcione en modo demo (no solo real).

Cada `CalendarTaskRow` es clickeable → abre el drawer del lead asociado.
La nota al pie explica el modelo (appts = agendadas, crm_tasks = internas)
y menciona el campo `externalCalendarId` listo para sync futura con
Google Calendar.

Verificación pendiente (visual con sesión admin): confirmar que la tarea
vencida "Tarea 1" (en DB, due 2026-06-27) se renderiza en la card roja
del Calendario.

---

#### ⚪ 7. Dominio `qlick.marketing` no comprado — bloqueador de Resend (2026-07-01)

- **Bloquea:** Pase digital visual por correo + recordatorios automáticos 24h/2h.
- **Severidad:** ⚪ Bloqueado (decisión de David: "marcamos como pendiente, aún no trabajaremos en eso").
- **Por qué:** Para que Resend mande emails con `from: notificaciones@qlick.marketing`, el dominio tiene que estar validado en Resend con registros SPF/DKIM/DMARC. Sin dominio comprado, no se puede validar.
- **Estado actual (2026-07-01 ~20:09):**
  - Las 3 env vars de Resend NO están en Vercel production: `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_REPLY_TO`.
  - El job `/api/cron/event-reminders` corre cada 30 min y loggea los emails en consola — no llegan a leads.
  - El bot sigue mandando el link del pase por WhatsApp (eso funciona).
  - El check-in sigue promoviendo el lead a `event_attended` (eso funciona, no depende de email).
  - Solo se pierde el canal de email.
- **Impacto operativo 6 jul:**
  - Asistentes que olvidan: sin recordatorio 24h, ~30% no-shows extra.
  - Staff en puerta: tiene que buscar por nombre en admin (no pueden escanear QR desde la pantalla del asistente, que sí existe en `/check-in/[token]`).
  - Mitigación: admin manda recordatorio manual via broadcast (`buildEventBroadcast` en `src/lib/contact/whatsapp.ts:438` — ya existe, genera wa.me links pre-armados).
- **Fix cuando David lo destrabe:**
  1. Comprar `qlick.marketing` (Namecheap, Cloudflare Registrar, GoDaddy — preferencia de David).
  2. Configurar DNS en Resend (SPF/DKIM/DMARC). 24-48h propagación.
  3. Setear 3 env vars en Vercel production:
     - `RESEND_API_KEY` (de Resend dashboard, scope: send).
     - `RESEND_FROM_ADDRESS=notificaciones@qlick.marketing`.
     - `RESEND_REPLY_TO=david17891@gmail.com`.
  4. (Opcional) `CRON_SECRET` para auth del cron + configurar header `Authorization: Bearer <secret>` en Vercel Cron.
  5. Trigger manual de prueba: `curl https://qlick-three.vercel.app/api/cron/event-reminders`.
  6. Verificar: `SELECT * FROM event_reminder_log ORDER BY sent_at DESC LIMIT 10;` en Supabase.
- **Workaround temporal (5 min, sin dominio):** usar sandbox de Resend `onboarding@resend.dev` como `RESEND_FROM_ADDRESS`. Email sale pero **solo al owner de la cuenta Resend** (David). Sirve para validar el flow, NO para producción real con leads.
- **Refs:** `docs/HANDOFF_v0.7.1_FASE_7A_REMINDERS.md` (sección "Limitaciones documentadas" + "Pendiente pre-deploy"), `docs/STATUS.md` §"Fase 7a", `data/PROJECT-LOG.md` entrada 2026-07-01 ~17:45.

---

## 2. Features pendientes por fase

### Fase 4 — UI Admin `/admin/eventos` + WhatsApp manual

**Status:** ⚪ No iniciada. Esperando luz verde.

**Scope: COMPLETO, no MVP.** David (2026-06-26): "mientras más completo
mejor, recuerda que al final será la plataforma oficial". Si algo se
corta, conversamos antes — no propongo acotar de entrada.

**Scope completo (del doc `EVENTS_FUNNEL_FOUNDATION.md` §9 + decisión
2026-06-26):**
- [ ] `/admin/eventos` lista de eventos con cards (cards con conteos: confirmations, attendees, surveys, leads promovidos)
- [ ] `/admin/eventos/[id]` detalle con 4 tabs:
  - Confirmados (tabla + búsqueda + filtro por source)
  - Asistentes (tabla + match manual con confirmation si no matchea)
  - Encuestas (tabla con `consent_to_contact` visible, marcar como revisadas)
  - Leads promovidos (lista linked al evento, drawer del lead)
- [ ] Wizard de import:
  - Upload `.xlsx` (drag & drop)
  - Preview con mapping de headers (auto-detect + override)
  - Confirmar import con reporte (inserted/duplicates/invalid/warnings)
  - Opción de `--dry-run` desde el browser (sin tocar DB)
- [ ] Drawer del lead con badge "📅 Vino de evento X, encuesta Y, interés Z"
- [ ] WhatsApp manual workflow completo:
  - `buildWhatsAppMessage(lead, event)` server-side (template con placeholders)
  - Botón "Generar WhatsApp" → abre `wa.me/...?text=...` en nueva pestaña
  - Estados: `no_contactado` → `mensaje_preparado` → `contactado` → `respondió` → `interested`/`lost`
  - Audit log de cada mensaje enviado (en `lead_interactions` o `admin_audit_log`)
- [ ] Server action público: `/eventos/[slug]` con form de "registrarme" (igual que masterclass funnel)
- [ ] **CRUD admin de eventos** (era "Fase 5" en el roadmap, lo subimos acá por scope completo): crear/editar/archivar eventos desde el panel sin tocar SQL
- [ ] **Drawer del evento** con métricas: total inscritos vs asistentes vs leads promovidos vs conversion rate

**Out of scope (queda para Fase 5+):**
- Notificaciones automáticas por email (requiere SMTP)
- WhatsApp Business API (requiere Meta Cloud / BSP)
- Multi-evento en un Excel
- NLP sobre respuestas libres de encuesta

**Dependencias:**
- Migration nueva opcional para `phone_normalized` (cierra H8, recomendable incluirla)
- Posible nueva columna en `events` para `cover_image_url` upload desde el admin (ya existe en la tabla, falta UI)
- Dep `exceljs` o seguir con `xlsx`

**Criterio de "done" para Fase 4 (más estricto que MVP):**
- Todas las funciones de admin accesibles vía browser autenticado
- Sin fallback demo en producción (solo dev)
- Empty states diseñados (no "Error" genérico)
- Loading states explícitos (no "Loading..." eterno)
- Mobile-friendly básico (la mayoría de admin se usa en desktop, pero no debe romperse en mobile)
- Documentación de uso en `docs/EVENTS_ADMIN_GUIDE.md`

### Fase 5 — Notificaciones automáticas + admin CRUD

- [ ] Email al admin cuando entra survey con consent (requiere SMTP — Resend / SendGrid)
- [ ] CRUD admin completo de eventos desde panel sin tocar SQL

### Fase 6+ — Backend

- [ ] WhatsApp Business API (Meta Cloud / BSP) — reemplazar el workflow manual
- [ ] Multi-evento en un solo Excel (D-8 del concept)
- [ ] Análisis de sentimiento sobre respuestas libres de encuesta

---

## 3. Deuda del roadmap previo (LMS / Masterclass)

### Roadmap item 0 — LMS al 100%

- [ ] Catálogo real: los 4 cursos siguen duplicados entre `src/lib/data/courses.ts` y la DB (seed). Cuando David defina el catálogo final con sócios, eliminar el mock.
- [ ] Pendiente: test E2E de pagos con cuenta NO-admin.

### Roadmap item 5 — Pagos (adapters)

- [ ] Decisión abierta: MercadoPago / Stripe / Conekta / mix.
- [ ] Stubs ya existen (`src/lib/payments/`), falta reemplazar por adapter real con credenciales.

### Roadmap item 6 — Onboarding del alumno

- [ ] Scope exacto abierto (tooltips vs tour modal vs emails).
- [ ] Bloqueado hasta definir UX con socios.

### Roadmap item 7 — Tests automáticos (Vitest + SQL)

- [ ] `_test-fase2.mjs` y `_test-fase3.mjs` funcionan pero son scripts ad-hoc, no tests automatizados.
- [ ] Vitest con `unstable_vitest_node` en Postgres local podría cubrir Fase 2/3 server libs.

---

## 4. Decisiones pendientes con socios

### 🟠 Proveedor de pagos

**Bloqueado:** esperando decisión de David con socios sobre MercadoPago vs Stripe vs Conekta vs mix.

**Impacto:** roadmap item 5 + cualquier flujo de inscripción paid.

**Costo/comisiones/tiempo de implementación** varía por proveedor. Recomiendo MercadoPago para MX (audiencia principal) + Stripe como backup para USD.

### 🟠 Contenido real de cursos

**Bloqueado:** los videos de los 4 cursos siguen siendo placeholders de YouTube (no originales).

**Impacto:** el LMS funciona, pero la propuesta de valor "cursos de marketing de Qlick" está vacía sin contenido real.

**Decisión necesaria:** ¿qué cursos producir primero y cuándo?

### 🟡 Plantilla de email transaccional

**Bloqueado:** default de Supabase Auth vs custom branded.

**Impacto:** bienvenida, reset password, confirmaciones.

### 🟡 Monitoring de errores en runtime

**Bloqueado:** Sentry vs nada.

**Impacto:** debug en producción. Hoy los logs son la única fuente.

---

## 5. Watchlist (no bloqueante, para tener presente)

### Memory note — David en periodo de prueba con agencia

- Acuerdo verbal: sueldo base 40,000 MXN/mes + 25% de ganancias propias.
- Línea divisoria: "lo que construyamos a partir de mí es mío".
- Implicación: herramientas propias (Higgsfield, video UGC, productos
  paralelos) son ingreso personal, no de la agencia.

### Memory note — Higgsfield MCP setup existe pero no suscrito

- MCP server configurado y autenticado en el runtime de David.
- Imagen del influencer "Jean" ya creada (job_id `c08f1fbb-7c61-4fa0-bb43-79d271dd78a2`).
- Balance: ~8 créditos restantes (solo imagen, no video).
- Pendiente: decidir si se suscribe a Starter PLUS ($15/mes) para video UGC.
- Plan tentativo: ofrecer video UGC como servicio de agencia (25%) Y revender por su cuenta (100%). Formalizar empresa separada (RESICO) cuando el volumen lo justifique.

### Memory note — Multi-agente NO por ahora

Acordado en sesión del 2026-06-26: features de tamaño medio se hacen
secuenciales en una sesión, documentadas en `ROADMAP.md`. Para planes
multi-agente, dividir en <8 archivos o aceptar partial-state.

---

## 6. Resueltos reciente

### ✅ B-2 — Cierre de paperwork (2026-06-27 ~17:00)

B-2 ya estaba **resuelto en código** desde el commit `3d56caa` (David,
2026-06-27 ~01:29) pero el doc quedó desactualizado (doc-rot). Detectado
en pasada de QA visual al retomar la sesión. Cierre puro de paperwork:

- Marcado como ✅ en la sección 1 (deuda técnica activa).
- Esta entrada en "Resueltos reciente" como rastro.

Implementación validada por lectura de código:
- `CRMView.tsx` (líneas 334-425) pinta 3 cards en el Calendario.
- `tasks-server.ts:getAllPendingTasks()` particiona global por `due_at`.
- `fetchPendingCRMTasks()` ya está integrado en el `useEffect` del CRM.
- `CalendarTaskRow` clickeable → abre drawer del lead.

Verificación visual con sesión admin sigue pendiente — David puede abrir
`/admin` → tab CRM → sub-tab Calendario y debería ver la tarea vencida
"Tarea 1" (en DB desde hoy temprano) en la card con borde rojo.

### ✅ Validación visual del fix single-column en `/eventos/[slug]` (2026-06-27 ~16:45)

Commit `e0df5ab fix(events): single-column en /eventos/[slug] — form prominente`
quedó **validado visualmente** tomando screenshot fullPage de
`/eventos/qa-fase4-demo` con Playwright MCP en viewport ~907×1328:

- Header limpio, badge "Evento Qlick", título grande, meta (cuándo/lugar).
- CTA primario "Confirmar asistencia ↓" en el hero; el ↓ empuja al form.
- Separación amplia (intencional, scroll-margin) entre hero y form.
- Form single-column en card blanco con sombra: Nombre (full) →
  Email + Teléfono (50/50) → checkbox consentimiento → CTA "Confirmar
  asistencia" prominente → microcopy de baja.
- Footer con 4 columnas.

Jerarquía visual correcta, mobile-friendly, el form domina la página como
debe. Fix cumple su objetivo: **registro sin fricción**.

### ✅ Fase 3 — Events Funnel Foundation (v0.7.0)

12 commits, branch `feat/events-funnel-foundation`, mergeado a main
post-limpieza de docs. Detalle completo en `EVENTS_FUNNEL_FOUNDATION.md`.

- Migration `20260627000000_events_funnel.sql` aplicada.
- 6 tablas nuevas + 4 enums + RLS.
- 5 server libs (events, confirmations, attendees, surveys, promotion).
- Importer CLI con `xlsx` (acotado al CLI).
- 37/37 tests unitarios + 7/7 end-to-end contra Supabase real.

### ✅ Cierre del QA round 1 de Fase 2 (commit `20883aa`)

- H3: PII fuera de logs (`emailLength` en vez de `email`)
- H4: `createLead` falla ruidoso en lugar de enmascarar con demo
- H5: `updateLeadStatus` con SELECT previo + UPDATE atómico + audit log con from/to
- H6: `createLeadFromEvent` rechaza sin email/phone
- H12: `phonesMatch` en import estático
- **H1+H2 diferidos** — H2 ahora ✅ cerrado por Fase 3.

### ✅ Fase 2 — CRM Real Foundation para Eventos (v0.6.0)

6 commits, branch cerrado y mergeado.
- 5 funciones: `findLeadByEmail`, `findLeadByPhone`, `createLeadFromEvent`,
  `linkLeadToEventRecord` (era STUB, ahora es real en Fase 3),
  `updateLeadCommercialStatus`.
- 14 unit tests + 9 tests manuales.
- Doc `FASE_2_CRM_FOUNDATION.md`.

## N. Sesión 2026-07-02 ~18:22 (PAUSA) — Estado al retomar

### 🔴 Pendiente inmediato (David aplica manual)

- **N-1 · Aplicar migration 20260702180000_add_requires_name_to_events.sql** en Supabase. Comando:
  `
  $env:SUPABASE_DB_PASSWORD = "<db-password-del-dashboard>"
  node --env-file=.env.local scripts/exec-sql.mjs supabase/migrations/20260702180000_add_requires_name_to_events.sql
  `
  O pegar el SQL en https://supabase.com/dashboard/project/ugpejblymtbwtsoiykyj/sql/new. Sin esto, el flow funciona con equiresName=false (fallback silencioso, sin pedir nombre).

### 🟠 Planificados para próxima sesión

- **N-2 · Commit B: Staff scanner con link temporal.** Tabla event_staff_links (id, event_id, token, created_by, created_at, expires_at, first_used_at, use_count, revoked_at). Endpoint admin POST /api/admin/eventos/[slug]/staff-links para generar (TTL default 60min). Página pública /staff/[token]/check-in con html5-qrcode + input manual respaldo. Endpoint POST /api/staff/check-in con validación de link + asignación de checked_in_by='staff_link:<id>'. Auto-expiración por check en cada request. Plan completo en conversación de la sesión 2026-07-02 ~17:55. ~1.5-2h de implementación.

- **N-3 · Fix de la coma huérfana en /check-in/[token] estado "already".** Cuando ttendeeName="" (porque el fix de "Por confirmar" → "" funcionó), la pantalla muestra ", hiciste check-in a las 05:04 p.m..." sin nombre antes de la coma. David dijo "lo podemos dejar para luego" — aplazar hasta que se rediseñe el header del check-in page con el scanner (Commit B).

### 🟢 Polish (nice-to-have, no urge)

- **N-4 · ot-engine.ts pesa 1930 líneas.** Refactor: splittear en intents/welcome.ts, intents/register.ts, intents/provide-email.ts, intents/provide-name.ts, intents/question.ts. Pago de deuda pendiente. Mejora legibilidad y testeabilidad.

- **N-5 · P1-5 de auditoría previa: rate limit en endpoints públicos.** /api/check-in/[token] (POST/GET) y /api/event-qr/[token] (GET) son públicos. Sin rate limit, alguien puede hacer 10K requests/seg. Mitigación: rate limit por IP via middleware (src/middleware.ts). Bajo riesgo ahora (DB aguanta), alto riesgo si crece tráfico.

- **N-6 · P2-6 de auditoría previa: assert NEXT_PUBLIC_APP_URL al startup.** Hoy fallback a localhost:3000 si no está seteado en prod, lo que causaría URLs de email/QR rotas. Fix: assert en 
ext.config.mjs o src/lib/env.ts.

- **N-7 · P2-2 de auditoría previa: summary se actualiza solo si intent !== question.** En ot-engine.ts:1594, summary: intent === "question" ? lead.summary : .... Backwards. Fix: registrar el content del LLM cuando hay question.

### ⚪ Bloqueado por input externo

- (vacío — nada esperando a David más allá de N-1)

---

## M. Auditoría 2026-07-02 ~03:00 — Cerrada en sesión 17:00-18:22 (6 commits)

| Audit ID | Severidad | Descripción corta | Estado |
|---|---|---|---|
| **P0-1** | 🔴 | PLACEHOLDER_NAMES duplicado en 4 sitios | ✅ Commit  6032cc |
| **P0-2** | 🔴 | findEventInConversation solo mira outbound, ignora inbound | ✅ Commit  6032cc |
| **P0-3** | 🔴 | generateQrToken fallback DESC (más reciente) en vez de ASC (más próximo) | ✅ Commit  6032cc |
| **P0-4** | 🔴 | loadConversationWindow(lead.phone ?? "") en vez de phoneNormalized | ✅ Commit  6032cc |
| **P1-1** | 🟠 | Tokens viejos sin limpieza | ✅ Commit 7685a7b (cron diario) |
| **P1-2** | 🟠 | Body de click truncado a 24 chars (sin buttonId en metadata) | ✅ Commit  6032cc |
| **P1-3** | 🟠 | Update email + consent sin verificar error | ✅ Commit  6032cc |
| **P1-4** | 🟠 | findEventInConversation silently fail en idx fuera de rango | ✅ Commit  6032cc |
| **P2-1** | 🟢 | getActiveEvent() (env vars) usado en 4 sitios | ⚠️ Pospuesto (refactor = N-4) |
| **P2-2** | 🟢 | Summary backwards (question vs !== question) | ⚠️ Pospuesto (N-7) |
| **P2-3** | 🟢 | summarize_conversation s never | ⚠️ Pospuesto |
| **P2-4** | 🟢 | bot-engine.ts 1930 líneas | ⚠️ Pospuesto (N-4) |
| **P2-5** | 🟢 | Scripts SQL untracked | ✅ Commit 60dff6 |
| **P2-6** | 🟢 | NEXT_PUBLIC_APP_URL sin assert | ⚠️ Pospuesto (N-6) |
| **P2-7** | 🟢 | getActiveEvent() redefinido por call site | ⚠️ Pospuesto |
| **P2-8** | 🟢 | EMAIL_RE permite emails inválidos tipo a@b.c | ⚠️ Pospuesto |
| **P2-9** | 🟢 | Safety net puede cortar contenido legítimo | ⚠️ Pospuesto |
| **N-extra: UX check-in** | 🟢 | Mostrar QR + "se mandó al correo" post-check-in | ✅ Commit 2b92a5c |
