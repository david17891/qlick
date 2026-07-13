# Changelog — Qlick Marketing Integral

> Release notes consolidadas. Una sección por release significativo (no por commit).
>
> Convención: [Keep a Changelog](https://keepachangelog.com) en español.
> Tipos: **Added** (feature nuevo), **Changed** (cambio compatible), **Fixed** (bug fix),
> **Deprecated**, **Removed**, **Security**, **Internal** (refactor / paperwork).

---

## [v0.9.9] — Arnés de simulación masiva 200 situaciones cartesianas — 2026-07-12

**Branch:** `feat/fase-17-4-improvements-and-massive-harness` → **mergeado a `main` (PR #26, HEAD `89902e8`)**.
**Handoff:** `docs/HANDOFF_v0.9.9_BOT_MASSIVE_SIMULATION.md` (creado en sprint housekeeping 2026-07-12).
**Reporte ejecutivo:** `docs/BOT_MASSIVE_SIMULATION_200_REPORT.md` (215 líneas, semáforo por arquetipo, 60.0% pass rate baseline).
**Tests:** 1262/1262 verde · type-check ✓ · lint 0/0 · build ✓.

Este release cierra el cluster de sprints v17 con un **arnés de simulación masiva** que valida 200 situaciones cartesianas (10 arquetipos × 4 contextos × 5 trayectorias) contra 5 métricas de calidad (`isBrief`, `guestsHandledCorrectly`, `typoIntercepted`, `cadenciaSuaveRespetada`, `toolCalledCorrectly`).

### Added

- **`src/lib/ai/simulation/massive-matrix-generator.ts`** — generador cartesiano determinista. Arquetipos: `apresurado`, `desconfiado`, `tecnico`, `fuera_de_horario`, `acompanantes`, `typo_email`, `cadencia_larga`, `asesor_humano`, `monosilabo`, `hostil`. Contextos: `super_executive+free_masterclass`, `super_executive+paid_course`, `socratic_autopilot_v2+lms_course`, `fallback+no_active_event`. Trayectorias: `quick_convert`, `standard_funnel`, `deep_objection`, `abandonment`, `reactivation`.
- **`src/lib/ai/simulation/matrix-auditor.ts`** — 5 métricas + `mockBotRespond` determinístico + `auditTurn` + `auditSituation` + `auditMatrix` con agregación por arquetipo/contexto/trayectoria.
- **`scripts/generate-massive-report.mjs`** — genera reporte ejecutivo (`.md` commiteable) + reporte completo (`.json` en `private-data/` gitignored, ~236KB).
- **8 tests** en `tests/bot-simulator-massive-matrix.test.mjs` (cardinalidad 200, unicidad de IDs, distribución cartesiana, duración <5s, agregación correcta).

### Baseline (punto de partida, no objetivo cerrado)

- 60.0% pass rate (120/200).
- 6 arquetipos 🟢: `desconfiado`, `tecnico`, `acompanantes`, `typo_email`, `monosilabo`, `hostil`.
- 4 arquetipos 🔴: `apresurado`, `fuera_de_horario`, `cadencia_larga`, `asesor_humano` (situaciones de stress esperables, documentadas como siguiente sprint).

---

## [v0.9.8] — 3 mejoras del Súper Ejecutivo (typos de dominio, cadencia suave, tool `add_event_guest`) — 2026-07-12

**Branch:** `feat/fase-17-4-improvements-and-massive-harness` → **mergeado a `main` (PR #26, HEAD `89902e8`)**.
**Handoff:** `docs/HANDOFF_v0.9.8_SUPER_EJECUTIVO.md` (creado en sprint housekeeping 2026-07-12).
**Tests:** 1226/1226 → 1262/1262 (+36 nuevos) · type-check ✓ · lint 0/0 · build ✓.

### Added

- **Mejora #1 — Detección de typos de dominio en `extract-contact.ts`** (commit `2348103`):
  - `DOMAIN_TYPOS` dict con 15 typos frecuentes (`gmial.com`, `hotmial.com`, `gnmail.com`, `yaho.com`, `outlok.com`, etc.).
  - `detectDomainTypo()` corre sobre el email parseado antes de validar formato.
  - `executeExtractAndSaveContact()` retorna `status: "needs_domain_confirmation"` con `suggested_domain` + `raw_domain` cuando hay typo.
  - +15 tests en `tests/extract-contact-typo.test.mjs`.
- **Mejora #2 — Cadencia suave de cierre (anti-insistencia)** (commit `038b519`):
  - Bloque `CADENCIA SUAVE DE CIERRE (ANTI-INSISTENCIA)` agregado al prompt del Súper Ejecutivo (`buildSuperExecutivePrompt` en `src/lib/ai/agent-prompts.ts`).
  - Regla: máximo 1 mención al enlace de pago/registro por ventana de 4 turnos, 1 pregunta de calificación por ventana de 6 turnos, si el usuario ya mostró resistencia (>0 objeciones) NUNCA insistir con el mismo ángulo.
  - Copy rígido del v0.9.6 reemplazado por directivas flexibles (decidido → CTA inmediato, dudas → cierre conversacional sin CTA duro).
  - +13 tests de tono actualizados en `tests/agent-prompts-tone.test.mjs`.
- **Mejora #3 — Tool `add_event_guest` + migración `guests JSONB` + registro de acompañantes** (commit `b91207f`):
  - Migration `supabase/migrations/20260712044100_event_attendees_guests.sql`: columna `guests JSONB NOT NULL DEFAULT '[]'::jsonb` en `event_attendees`. RLS heredada.
  - Nueva tool `add_event_guest` en `getAgentTools()` (`src/lib/ai/agent-tools.ts`): esquema estricto (`parent_lead_id` req, `guest_name` req, `guest_email` opt). Total de tools del Súper Ejecutivo: **2** (`extract_contact` + `add_event_guest`).
  - Executor `src/lib/ai/tool-executors/add-guest.ts`: idempotente por nombre (case-insensitive trim, mismo nombre actualiza email/added_at, preserva id).
  - Prompt Súper Ejecutivo: bloque `REGISTRO DE ACOMPAÑANTES (TOOL add_event_guest)` REEMPLAZA el bloque `LÍMITE TÉCNICO DE REGISTRO` del v0.9.7 hotfix. 3 reglas: DISPONIBLE (tool existe), CONFIRMACIÓN CÁLIDA (registra + confirma con nombre), LIMITACIÓN (si tool falla, NO inventar).
  - +12 tests en `tests/add_event_guest.test.mjs` (idempotencia, validación, errores DB).
  - Migration adicional `20260712044200_enable_pg_trgm.sql` (habilita `pg_trgm` requerida para GIN con `gin_trgm_ops`).
  - Typegen regenerado (`event_attendees.guests: Json` + `admin_audit_log.before/after: Json` ahora visibles).

### Typegen refresh

- 4 call sites limpiados de `as unknown as` global; queda 1 cast local en lectura de `Json` → `GuestRecord[]` (necesario por typegen).
- 3 errores pre-existentes destapados por typegen estricto en `handoffs-server.ts`, `leads-admin-server.ts`, `confirmations-server.ts` → corregidos con `as unknown as Json`.

### Riesgo operacional documentado

- La migración `guests` es ADITIVA (solo `add column if not exists`). Si se aplicó a prod antes del merge, los acompañantes existentes serán `[]` y la tool empezará a poblarlos idempotentemente.

---

## [v0.9.7] — Anti-alucinación de acompañantes + switch Flash/Pro + directivas de tono — 2026-07-12

**Branch:** `feat/fase-17-2-ai-flash-and-tone` + `fix/v17-3-anti-alucinacion-acompanantes` → **mergeado a `main` (PR #25, HEAD `aea4b8e`)**.
**Handoff:** no dedicado (sprint corto end-to-end); detalle en `data/PROJECT-LOG.md` 2026-07-12.
**Tests:** 1173/1173 → 1226/1226 (+53) · type-check ✓ · lint 0/0 · build ✓.

### Fixed

- **Anti-alucinación de acompañantes** (commit `067e15b`, hotfix v0.9.7):
  - El bot alucinaba confirmaciones de acompañantes que el lead no había mencionado. Fix: endurecer el bloque `LÍMITE TÉCNICO DE REGISTRO` en el prompt Súper Ejecutivo para que NUNCA afirme "registré a tu acompañante X" sin haber llamado `add_event_guest` (que no existía aún — llegaba en v0.9.8).
- **Switch Flash/Pro con heurística de escalado** (commit `17e51ad`):
  - Default: DeepSeek V4-Flash (rápido + barato). Escalado a V4-Pro para mensajes largos (>500 chars) o intents complejos (precio, objeción, registro).
  - Configurable vía `system_settings.bot_llm_escalation_threshold`.

### Added

- **Directivas de tono WhatsApp** en `agent-prompts.ts`: brevedad, no emojis forzados, NO usar nombres propios sin consentimiento, NO asumir relaciones personales.

### Internal

- Backfill de tests: 53 tests nuevos distribuidos entre `whatsapp-bot-tone.test.mjs` y `agent-prompts-flash-pro.test.mjs`.

---

## [v0.9.6] — Bot Simulator v0.9.6 (mejoras del simulador de conversaciones) — 2026-07-10

**Branch:** `feat/bot-v2` + `feat/bot-v2-admin-toggle` → mergeado a `main` (pre-sprint v17).
**Handoff:** `docs/HANDOFF_v0.9.6_BOT_SIMULATOR.md`.
**Tests:** 1096/1096 → 1144/1144 (+48) · type-check ✓ · lint 0/0 · build ✓.

### Added

- **Bot Simulator v0.9.6** (`scratch/bot-simulator-v2/`): permite a David probar conversaciones del bot sin gastar tokens DeepSeek, con arquetipos predefinidos y assertions sobre el comportamiento esperado.
- **Arquetipos R1 (FIX #3 stripGreeting<3 + anti-injection + tool loop)** (commit `15cad95`): tests de regresión para el safety-net de openers cortos.
- **Sub-sprint 2d integración bot-engine + E2E acceptance** (commit `ab1c072`): cierre del sprint 2 del bot v2.

### Internal

- 48 tests nuevos en `tests/bot-simulator-v2/` y `tests/whatsapp-bot-tool-loop.test.mjs`.

---

## [v0.9.5] — Torre de Control del Bot v16 (hotfix #3: persistencia de modo + anti-flicker) — 2026-07-10

**Branch:** `chore/hand-v0.9.5-sprint-v16-cierre` (cierre paperwork) + `feat/fase-16-6-hotfix-ui-3` (código).
**Handoff:** `docs/HANDOFF_v0.9.5_BOT_SIMULATOR.md` (cierre paperwork del sprint v16).
**Tests:** 1144/1144 verde · type-check ✓ · lint 0/0 · build ✓.

Este sprint cierra el cluster **v16** (Torre de Control del Bot) con un hotfix UI que arregla dos bugs detectados por David en producción.

### Fixed

- **Hotfix #3 — persistencia real de `onSelectMode`** (commits en `feat/fase-16-6-hotfix-ui-3`):
  - Antes: `onSelectMode` solo cambiaba el estado local del componente `BotConfigTab.tsx`. El cambio NO se persistía en `system_settings.bot_global_mode`. Al recargar la pestaña, el modo volvía al default.
  - Ahora: optimistic update + POST a `/api/admin/bot/mode` + refetch de `/api/admin/bot/stats` para reconciliar.
  - Si el POST falla → rollback del modo local + `setError` con el mensaje.
- **Anti-flicker de carga** en la sección "Modo Global del Bot":
  - Antes: `useState<BotMode>("socratic_autopilot_v2")` inicializaba con Socrático v2 por defecto. Cuando `fetchStats()` terminaba (~500ms después), saltaba a `stats.bot_global_mode`. La UI dibujaba un modo falso por medio segundo.
  - Ahora: mientras `statsLoading && !stats`, muestra 3 placeholders animados con `animate-pulse` + el mensaje *"Cargando configuración activa desde base de datos…"*.

### Added

- **Endpoint dedicado `/api/admin/bot/mode`** (`src/app/api/admin/bot/mode/route.ts`):
  - `GET` → `{ ok, mode: BotMode | null }` leyendo `system_settings.bot_global_mode`.
  - `POST` con body `{ mode: "socratic_autopilot_v2" | "socratic_no_tools_v1" | "super_executive" }` → UPSERT en system_settings. Idempotente. Valida contra set cerrado de 3 valores; cualquier otro string → 400.
  - `requireAdmin` + `checkSupabaseConfig` (mismo guard que el resto del admin).
- **SSOT `BotGlobalMode` + type guard `isBotGlobalMode`** en `src/lib/admin/system-settings-server.ts` (32 líneas nuevas).

### Internal

- **PR #20** (`feat/fase-16-6-hotfix-ui-3`) mergeado a main con HEAD `aea4b8e`. Branch de paperwork `chore/hand-v0.9.5-sprint-v16-cierre` agregada con handoff v0.9.5 + cierre formal.

---

## [v0.9.4] — Sprint CI smoke E2E + GitHub Secrets config (operacional, infra-only) — 2026-07-11

**Branch:** (no branch de feature; 0 commits de código en este sprint).
**Traza:** `data/PROJECT-LOG.md` entrada `2026-07-11 ~19:30`.
**Tests:** 1144/1144 verde (sin cambios) · smoke E2E `npm run smoke:audit` y `npm run smoke:scenarios` ✓ en CI.

Este sprint **no incluye cambios de código** — solo infra. Cierra el loop "el CI no corría el smoke E2E contra DB real, así que las migrations no aplicadas a prod pasaban el type-check y el lint pero rompían en runtime".

### Added (operacional)

- **3 GitHub Secrets** configurados en `david17891/qlick` (encriptados en reposo): `SUPABASE_URL`, `SUPABASE_PROJECT_REF` (público, extraído del subdominio), `SUPABASE_SECRET_KEY` (formato `sb_secret_xxx`, válido).
- **Fine-grained PAT actualizado**: scope "Secrets: Read and write" agregado al existente `github_pat_11AJ3BMCA0...` sin regenerar el token.
- **Smoke workflow verde** por primera vez en run `29176681182` (1m18s) — los 3 pushes consecutivos a `main` que fallaban (`654e6b6`, `433ad62`, `e7fd2bb`) ahora pasan.

### Cierre del incidente del commit `e7fd2bb`

- Migrations `event_survey_tokens` (`20260703180000`) y `admin_audit_log.before/after` (`20260629000000`) aplicadas a prod vía SQL Editor + `NOTIFY pgrst` ejecutado.
- El botón "📨 Enviar link de encuesta" del admin ya funciona sin PGRST205.
- Script nuevo `scripts/audit-migrations-applied.mjs` queda como gate pre-merge.

### Lección operativa

- Fine-grained PAT scopes son granulares — `Actions: R+W` ≠ `Secrets: R+W`. Para escribir GitHub Secrets se necesita scope explícito. Polling manual desde sesión root es mejor que cron para CI <2 min (race condition entre tick programado y delete).
- `gh secret set` con pipe (`$value | gh secret set NAME`) NO loguea el valor en argv ni en transcript de PowerShell.

---

## [v0.9.3] — Sprint Cierre-Eventos-Virtuales (link con encuesta + UPSERT attendee + promote lead + audit voseo) — 2026-07-11

**Branch:** `main` (HEAD actual)
**Status vivo:** `docs/STATUS.md` (snapshot 2026-07-11 11:50)
**Handoff:** no dedicado (sprint corto end-to-end); info completa en `STATUS.md` + `data/PROJECT-LOG.md` 2026-07-11 ~10:40.
**Tests:** 1066/1066 verde · type-check ✓ · lint ✓ (0 warnings) · build ✓
**Commits clave:** `bd5a27d` (David, feature), `1e97849` (Mavis, UPSERT+promote), `827b32b` (Mavis, voseo fix), `d858f9c` (Mavis, audit voseo completo), `73a0685` (Mavis, 5 gaps: rate-limit, modal detalle, attendee_id, dev-secret, vercel aliases), `0211c55` (Mavis, docs housekeeping).

Este sprint cierra el ciclo **"confirmado → asistencia real"** en eventos Zoom/virtuales/hybrid. Antes de este sprint, los confirmados que solo respondían la Q0 de la encuesta post-evento por email/WhatsApp (sin haber abierto el gate virtual ni escaneado el QR) NO quedaban como asistentes en el funnel ni en el CRM. Después del sprint, caen automáticamente al funnel vía UPSERT del attendee + promote del lead.

### Added

- **Botón "📨 Enviar link de encuesta"** en toolbar del tab Confirmados (`/admin/eventos/[id]?tab=confirmations`).
  - Genera (o reutiliza) un `event_survey_tokens` por cada confirmado con email.
  - Manda email con Brevo (`renderSurveyInviteEmail`).
  - Devuelve links `wa.me` pre-armados para confirmados con phone sin email.
- **Orquestador `send-survey-link.ts`**: server-side, idempotente a nivel de token.
- **Template email `survey-invite.ts`**: HTML inline con brand Qlick, escape XSS (`esc()`), CTA grande "📝 Responder encuesta (2 min)".
- **Botón "Ver detalle (N)" post-envío + modal con tabla por confirmado** (Gap #3 cerrado): muestra canal (email/WhatsApp/sin canal), estado, y botón "💬 Mandar" que abre WhatsApp Web con el waLink pre-armado. Antes David tenía que reconstruir el mensaje a mano del audit log.
- **Cooldown 30s post-envío** en el botón (Gap #4): con countdown visible, evita doble click accidental que gasta emails de Brevo.
- **Checkbox "Solo preview (no enviar emails)"** que pasa `dryRun=true` al server action.
- **Helper puro `detectAttendanceCheck`** (`src/lib/events/survey-attendance-check.ts`): decisión booleana "asistió" extraída de `surveys-server.ts` para testearla sin DB. 10 tests unitarios.
- **Helper `getRespondedSurveySets`** (`src/lib/events/survey-tokens.ts`): devuelve 2 sets (`confirmationIds` + `attendeeIds`) para que la tab Confirmados matchee respondedores por confirmation_id Y la tab Asistentes pueda matchearlos por attendee_id (Gap #5).

### Changed

- **Attendance check del Q0** en `surveys-server.ts:295-494`: cambia de UPDATE a UPSERT. Si el confirmado NUNCA abrió el gate virtual NI escaneó el QR (camino email-only), crea `event_attendees` con `source='survey_attended'` + `checked_in_at=now()`. Si ya existía, solo setea `checked_in_at` (preserva `source` original). Race condition con UNIQUE constraint manejada (23505 → SELECT + UPDATE).
- **Promoción del lead a `event_attended`** en el CRM tras Q0=Yes: SELECT lead por email o phone → UPDATE `status='event_attended'`, `tags+=[event:{slug}:attended]`, `last_contacted_at=now()`. Idempotente (no-op si ya está en `event_attended` o cerrado). Patrón idéntico a `api/check-in/route.ts:409-437`.
- **Badge "✓ Link"** en la tabla de Confirmados para los respondedores (usa `respondedSets.confirmationIds`).
- **Simulate-webhook** (`/api/dev/simulate-webhook`): ahora acepta 2 modos de auth — header `x-dev-admin-secret` (scripts admin) o sesión de estudiante (Client Component, sin cambio de comportamiento). Si `process.env.DEV_ADMIN_SECRET` está set + matchea, pasa sin auth de estudiante. Body debe incluir `userId` del target en modo admin.
- **`vercel.json`**: agregado `"alias": ["qlick.digital", "www.qlick.digital"]`. Vercel reasigna estos aliases automáticamente cuando un deploy a `main` queda READY. Antes David tenía que reasignarlos manualmente con `vercel alias set` (lo vivió el 2026-07-09).

### Added (migrations)

- `supabase/migrations/20260711100000_event_attendee_source_survey_attended.sql`: `ALTER TYPE event_attendee_source ADD VALUE 'survey_attended'`. Aplicada en Supabase por David antes del merge.

### Fixed (copy)

- **17 voseos argentinos** corregidos en 11 archivos (memory rule "Español MEXICANO — regla absoluta"):
  - `src/lib/email/templates/survey-invite.ts`: "Tardás" → "Tardas", "decinos" → "dinos", "copiá y pegá" → "copia y pega".
  - `src/lib/whatsapp/bot-engine.ts` (6 strings): "podés ver" → "puedes ver", "pasás" → "pasas", "mandámelo" → "mándamelo" (x2), "volvés" → "vuelves", "sabés" → "sabes".
  - `src/lib/whatsapp/survey-messages.ts`: "Podés volver" → "Puedes volver".
  - `src/components/crm/CRMView.tsx`, `LeadDetailDrawer.tsx`, `events/EventDrawer.tsx` (múltiples): voseo → tuteo MX.
  - `src/app/admin/eventos/[id]/_components/CertificateBatchPanel.tsx`, `StaffLinksPanel.tsx`: "vos les mandes" / "mandáselo" → tuteo.
  - `src/app/api/payments/create-checkout/route.ts`: "Ya tenés acceso" → "Ya tienes acceso".
  - `src/app/pagar/[courseSlug]/exito/page.tsx` (3 strings): voseo → tuteo.

### Internal

- Nuevo script `scripts/_audit-voseo-templates.mjs`: escanea 212 archivos de `src/lib/email/templates`, `src/lib/whatsapp`, `src/lib/contact`, `src/components`, `src/app` en busca de conjugaciones voseantes, pronombres ("vos"), y muletillas rioplatenses. Allowlist de falsos positivos conocidos (regex detectors, "deja" tuteo sin tilde, "parámetros" sustantivo). Exit 0 = cero voseo, exit 1 = lista de matches.
- Nuevo script `scripts/_preview-survey-invite-email.mjs`: renderiza el template con datos sintéticos para preview local sin gastar emails de Brevo.
- 10 nuevos tests en `tests/survey-attendance-check.test.mjs` (helper puro).

### Deuda viva (post-sprint, Mavis NO puede tocar — requiere David)

- **G-5**: 3 plantillas Meta NO creadas en Business Manager (`conf_bienvenida`, `conf_info_evento`, `conf_confirmacion_registro`). Acción de David en Meta UI + 24-48h approval.
- **G-6**: 5 migrations Fase 7a no confirmadas aplicadas en Supabase. Acción: `npx supabase migration list` o SQL Editor.
- **G-7**: `NEXT_PUBLIC_APP_URL` en Vercel env vars. Acción: `vercel env ls production` + `vercel env add` con `https://www.qlick.digital`.

---

## [v0.9.2] — Sprint Cert Email (envío batch de constancias) — 2026-07-08

**Branch:** `feat/certificados-concept-c` mergeado a `main` (2026-07-11 vía `ba461ba`)
**Handoff:** `docs/HANDOFF_v0.9.2_CERT_EMAIL.md`
**Status vivo:** `docs/STATUS.md` (snapshot 2026-07-10 5:32)
**Tests:** 1056/1056 verde · type-check ✓ · lint ✓ (0 warnings) · build ✓
**Commits:** `aca349e`, `98124ff`, `da06af2`, `9787a2f` (concepto), `8454577` (pivote HTML imprimible), `338a4f6`, `6553e6d`, `b0ac503`, `e2418a9`, `511d15c`, `f3e4447` (sprint completo, 9 archivos).

Este sprint entrega el flujo completo de **emisión de certificados de asistencia**: cert HTML imprimible 1:1 con el design Concept C aprobado, server action `issueCertificateAction` con auth admin + validaciones + idempotencia, panel admin `CertificateBatchPanel` con UX de 2 pasos (preview + confirmación), email transaccional con Brevo (sender `noreply@qlick.digital`), fallback manual a WhatsApp.

### Added

- **Cert HTML imprimible 1:1 con design Concept C** (`/cert/[folio]`). Página pública (folio es el secreto: random sobre 100k combinaciones, no adivinable). Hardening futuro: JWT con expiración.
- **Server action `issueCertificateAction`** (`src/app/admin/eventos/[id]/_actions.ts`): auth admin (`requireAdmin()`), validaciones (attendee pertenece al evento + tiene check-in + tiene nombre real, regex de placeholder), idempotencia por `(event_id, attendee_id)`.
- **Client Component `IssueCertButton`** en admin check-in tab ("Emitir cert") + `PrintCertButton` con `document.fonts.ready`.
- **Migrations**:
  - `20260708010000_event_certificates.sql`: tabla `event_certificates` con folio UNIQUE regex `^QLK-\d{4}-\d{5}$` enforced en CHECK constraint + UNIQUE `(event_id, attendee_id)`.
  - `20260708020000_event_certificates_rpc.sql`: RPC race-safe `issue_event_certificate()`.
  - `20260708170000_event_email_log_certificate_type.sql`: extiende `event_email_log` con `email_type='certificate'` (CHECK constraint) + `event_certificate_id` (FK nullable) + índice.
- **Email transaccional con Brevo** (`noreply@qlick.digital`). Template con saludo personalizado, datos del evento, folio en mono, CTA grande "Ver mi constancia", instrucciones Ctrl+P.
- **Fallback WhatsApp**: link `wa.me/[phone]?text=...` pre-armado con mensaje + link al cert. Abre `web.whatsapp.com` en browser de David.
- **Panel admin `CertificateBatchPanel`** con UX de 2 pasos: preview (cargado por `getCertificateBatchPreviewAction`) + confirmación (`sendBatchCertificatesAction`). Muestra desglose por canal (email / WhatsApp fallback / skipped).
- **12 TTF** de Plus Jakarta Sans / Inter / JetBrains Mono cargados en `public/certificates/fonts/`.
- **3 assets** (signature PNG, isotipo PNG, wordmark SVG) en `public/certificates/`.
- **12 tests** en `tests/email-event-certificate-template.test.mjs` (incluido XSS en `<title>` descubierto durante desarrollo, ya arreglado).

### Fixed (print)

- **Fix crítico de print**: `@page { size: 297mm 210mm; margin: 0 }` (NO keyword `A4 landscape` — Chrome ambigüa el keyword con drivers Letter y produce margen blanco vertical). Aplica a certs, recibos, constancias en cualquier proyecto.

### Trade-offs aceptados

- **HTML imprimible en lugar de PDF server-side** (Vercel Hobby no aguanta headless browsers; `@react-pdf/renderer` falla con binary deps en Windows). David imprime local con Ctrl+P o el botón "🖨️ Imprimir". Fidelity 100% porque es el mismo motor del browser rendereando el mismo HTML.

### Validado en producción

- Folio `QLK-2026-68558` para attendee `dddddddd-dddd-dddd-dddd-dddddddddddd`. Print preview en A4 horizontal sin margen blanco en márgenes "Predeterminado" ni "Ninguno".
- 1 fila `event_email_log` con `email_type='certificate'`, `ok=true`, `event_certificate_id` poblado (E2E real con Brevo).

### Pendiente (post-sprint)

- Pilotaje con attendees reales en evento del 11/jul.
- Cleanup DB de dev artifacts (`DDDDDDD`/`QLK-2026-68558`).
- Decisión Paso 2: script bulk + envío por correo automatizado.

---

## [v0.8.0] — Wizard WhatsApp funcional + Español MX — 2026-07-06

**Tag:** `v0.8.0` (rollback target estable)
**Branch:** `main` (HEAD post-tag)
**Handoff:** `docs/HANDOFF_v0.8.0_FUNCIONAL.md`
**Tests:** 535/535 verde · type-check ✓ · lint ✓ (0 warnings) · build ✓

Este release acumula los clusters **G-15 r1-r7** (wizard funcional + UI admin
mejorada + copy MX) más la **Fase name capture** previa. Cierra el ciclo
donde el wizard de encuesta post-evento WhatsApp funciona end-to-end sin
que el LLM "robe" turnos del flow conversacional, y todo el copy user-facing
suena en español mexicano consistente.

### Added

- **Wizard de encuesta WhatsApp end-to-end (G-15 r1-r5)**
  - Detección de buttonId formato dinámico (`survey_q1_clarity_very_clear`) +
    legacy (`survey_q1_very_clear`) unificada en `detectSurveyButtonAny`
    (`src/lib/whatsapp/survey-wizard.ts`).
  - Síntesis de buttonId desde texto crudo cuando Meta omite el field
    (dudupe/retry/button reply reentrega) — `synthesizeSurveyOptionFromText`
    + `buildDynamicButtonIdFromOption`.
  - Nuevo intent `survey_q_consent_continue` — "Sí" en q_consent avanza a
    q_business (step 5), "No" cierra. `survey_q4_text/skip` aceptan step 4 OR 5.
  - `consent_to_contact` derivado de `responses.q_consent` explícito
    (yes→true, no→false), fallback a `businessCaptured` si ausente.
- **Admin panel `/admin/eventos/[id]` mejorado (G-15 r4)**
  - Tab Encuestas con rama "dynamic" en `detectSurveyShape` que formatea
    labels legibles (incluye `Consentimiento: Sí/No`).
  - Tab Leads promovidos renderiza badges inline (🎯 Score, HOT/WARM/MQL/
    COLD con tone según bucket, ✓ Consent).
  - `mapLeadRowToLead` ahora incluye `score`, `qualification`,
    `surveyOfferSentAt` con cast explícito (typegen stale).
  - `PipelineCard` acepta props opcionales `score/qualification` y renderiza
    badges cuando están presentes.
- **Documentación de release**
  - `docs/HANDOFF_v0.8.0_FUNCIONAL.md` (handoff completo).
  - `docs/STATUS.md` snapshot v0.8.0.
  - `docs/ROADMAP.md` entrada v0.8.0.
  - Este CHANGELOG.
  - Tag Git `v0.8.0` pusheado.

### Changed

- **Cierre del wizard ahora manda 1 solo mensaje (G-15 r5)**
  - Removido el send del follow-up bucket HOT/MQL/coldWarm del close path
    (`survey_q4_text` + `survey_q_consent_continue`).
  - Solo thank-you estándar de cierre. Consistente entre path texto y path
    Saltar. Sin mensaje fantasma que aparezca en WhatsApp pero no en DB.
  - Si el admin quiere disparar bucket follow-up, debe usar
    `/api/events/:id/send-survey-offers` desde el panel.
- **Copy 100% español mexicano (G-15 r6-r7)**
  - 8 archivos del WhatsApp bot outbound + emails transaccionales arreglados.
  - 12 archivos de páginas web admin/student/staff + LLM system prompt
    arreglados.
  - **Mappings aplicados:** voseo → tuteo (`querés` → `quieres`, `tenés` →
    `tienes`, etc.), `escribinos` → `escríbenos`, `contanos` → `cuéntanos`,
    `por acá` → `por aquí`, `Disculpá` → `Disculpa`, `respondé` → `responde`.

### Fixed

- **Bug G-15 r0 (David 2026-07-06 12:36):** "Muy claro no avanza wizard" —
  Meta omite buttonId en dedupe/retry; ahora sintetizamos desde texto.
- **Bug G-15 r3 (David 2026-07-06 13:30):** "Encuestas=0, Leads promovidos=0,
  no me da info del lead" — q_consent ahora persiste, consent_to_contact se
  deriva correctamente, formato dinámico soportado en UI.
- **Bug G-15 r5 (David 2026-07-06 14:55):** "Mensaje extra en cierre wizard" —
  follow-up bucket duplicaba el thank-you; ahora solo thank-you.
- **Bug G-15 r6 (David 2026-07-06 15:10):** "Contanos/escribinos/por acá
  no se dicen en español mexicano" — todos los archivos user-facing migrados.

### Internal

- 5 nuevos tests para formato dinámico en `survey-display.test.mjs`.
- Tests existentes actualizados para validar `detectSurveyButtonAny` con
  ambos formatos (legacy + dinámico) — 12 nuevos tests en
  `survey-button-detection.test.mjs`.
- 14 tests en `survey-text-fallback.test.mjs` para
  `synthesizeSurveyButtonFromText`.
- LLM system prompt (`bot-personality-templates.ts:64`) actualizado a
  español mexicano para que no genere voseo en runtime.

### Lecciones aprendidas (para futuras sesiones)

1. **Tests E2E con DB limpia no detectan bugs del path webhook → bot.**
   El E2E del r2 simuló buttonId en formato legacy, pasó, pero prod usa
   formato dinámico. Regla: tests E2E deben usar el formato EXACTO que
   produce prod, no uno equivalente.
2. **Anti-invention trap — NO fabricar comportamiento de servicios.**
   Decir "Supabase detecta tokens pegados en chat y los rota
   automáticamente" sin evidencia es wrong. La razón válida para no pegar
   tokens por chat es solo de seguridad (logs de Mavis son persistentes),
   no comportamiento del servicio.
3. **Fix defensivo NO es aceptable cuando el root cause es identificable.**
   G-15 r0 requería leer logs de Vercel y entender QUE Meta omite
   buttonId, no agregar un regex permisivo.

---

## [Unreleased] — Fase 6 (Polish + auditoría + métricas globales)

**Branch:** `feat/fase-6-hitos` (siguiente branch lógico tras `feat/fase-5-planning`)
**Status:** 🟡 Funcional + tested (110/110), pendiente merge a `main` post-review de David.
**Prereq:** Fase 5 mergeada a `main` primero.

### Added

#### Métricas globales en `/admin/eventos` (Hito C)

- **Header con 6 stat cards agregadas** (Card con grid 2/3/6 responsive):
  - Confirmados totales, Asistentes totales (% sobre confirmados),
    Encuestas completadas, Leads promovidos desde encuestas,
    Encuestas sin match (sin consent), Conversión global.
- **Conversión global solo sobre eventos PASADOS** — excluye eventos próximos
  que aún no tienen leads promovidos. Si no hay eventos pasados, muestra `—`
  en vez de `0%`.
- **Tooltips explicativos en cada stat** — ícono `?` con texto que aclara qué
  mide la métrica y de dónde sale el número (%). Hover/focus accessible.
- **`Tooltip` component reutilizable** (`src/components/ui/Tooltip.tsx`) —
  aria-describedby + title fallback + soporte `align="end"` para tooltips
  cerca del borde derecho del viewport.

#### Búsqueda libre en audit log (Hito C)

- **Input `Búsqueda libre`** en `/admin/system/audit-log` — placeholder
  `"lead, david@, event_clone…"`, persiste en URL como `?q=...`.
- **Server lib `listAuditLogs`** extendido con filtro `q` — OR sobre
  `action`, `actor_email`, `entity_type`, `entity_id` (columnas indexadas).
- **Escape de wildcards** — `%` y `_` se escapan antes de pasarlos a `ilike`
  para evitar resultados inesperados.

#### Login alumno con magic link como fallback (Hito B)

- **`StudentLoginCard`** (`src/app/login/StudentLoginCard.tsx`) — Google OAuth
  sigue siendo el método principal (1 click), magic link reactivado como
  fallback visible con divider "o usa otro método".
- **State preservation** — el `MagicLinkForm` se mantiene siempre montado (solo
  cambia `hidden`), preservando `email` + `sent` cuando el usuario alterna entre
  modos.
- **Microcopy renovada** — "Bienvenido de vuelta · Continúa donde lo dejaste"
  + badge "🔒 Acceso seguro · sin contraseñas" + trust strip "Nunca compartimos
  tu correo ni tu actividad con terceros".

#### Seed demo realista (Hito C — soporte demos)

- **`scripts/seed-demo.mjs`** — seed sintético de eventos + confirmados +
  asistentes + encuestas + leads + WhatsApp log + audit log. Idempotente.
- **NPM scripts** — `npm run seed:demo`, `seed:demo:reset`, `seed:demo:cleanup`.
- **Doc `SEED-DEV.md`** — qué crea, privacidad, cómo usar, cómo funciona la
  idempotencia.

### Fixed

- **C-1** — Audit log del seed ya NO acumula entries por corrida. Check
  `existingAuditEntries` antes del INSERT usando `seed_tag` en metadata.
- **C-2** — Lead WhatsApp log del seed idempotente (preventivo, mismo patrón).
- **C-3** — Docstring de `q` honesto: ya NO afirma buscar en `metadata`.
  Doc dice explícitamente que solo busca en columnas indexadas y cómo
  buscar en metadata si se necesita.
- **C-4** — `entry.entityId.slice(0, 8)` ya NO rompe con null. Render
  defensivo con `entry.entityId ? ... : "—"`.
- **M-7** — Conversion global solo sobre eventos pasados (no distorsionaba
  la métrica incluyendo eventos próximos).

### Security / Privacy

- **Audit seed entries** usan `seed_tag` en metadata que permite cleanup
  selectivo. La página del audit log distingue seed entries de reales
  mediante el filtro `q` o `actorEmail` (admin real = `david@qlick.mx`).

### Internal

- **`src/components/ui/index.ts`** — exporta `Tooltip` + `TooltipProps`.
- **`src/lib/crm/audit-server.ts`** — interface `ListAuditLogsInput` extendida
  con `q`, lógica de escape de wildcards.
- **`src/app/admin/system/audit-log/page.tsx`** — filtros URL-driven ampliados
  con `q`, render defensivo para `entityId` null.

### Docs

- **`docs/FASE-6-AUDIT.md`** — auditoría completa (23 issues: 4 críticos,
  11 medios, 8 bajos) + status post-fix (4 críticos + 3 medios aplicados).
- **`docs/SEED-DEV.md`** — guía del seed.
- **`docs/TECHNICAL-REVIEW.md`** — snapshot técnico del repo a 2026-06-28.
- **`docs/ESTADO-ACTUAL.html`** — vista 1-pager del estado actual.

### Tests

- 110/110 pasando (sin cambios — los fixes no agregan lógica que rompa tests).
- Type-check ✅. Lint ✅. Build ✅.

---

## [Unreleased] — Fase 5 (Admin notificaciones + audit log + clone/undo)

**Branch:** `feat/fase-5-planning` (11 commits desde 2026-06-28).
**Status:** 🟡 Funcional + tested, pendiente merge a `main` post-review de David.
**Prereq:** `feat/admin-eventos` (Fase 4) mergeado a `main` primero.

### Added

#### Notificaciones por email (Paquete B)

- **Resend wrapper** (`src/lib/email/resend-client.ts`) — funciona en dev mode (loggea en consola sin API key), fail-safe (no rompe la operación principal si falla el send), normaliza recipients CSV → array.
- **Template `survey-with-consent`** (`src/lib/email/templates/survey-with-consent.ts`) — HTML inline con brand colors, NO PII en subject (anti-spam), escapea HTML para evitar inyección, link al drawer del lead con `&amp;` correcto.
- **Trigger automático** (`src/lib/events/promotion.ts`) — al `promoteSurveyToLead` crear un lead nuevo → manda email al admin. Best-effort: si falla, NO rollbackea.
- **Doc `SMTP_SETUP.md`** — guía paso a paso para David configurar Resend (signup → DNS → API key → test).

#### Audit log de admin (Paquete C)

- **Migration `20260629000000_admin_audit_log_diff.sql`** — additive `ALTER TABLE` para agregar `before`/`after` columns (snapshots JSONB). Compatible con installs existentes (entrys viejas quedan con null).
- **`logAdminAction` extendido** — ahora acepta `before` + `after` snapshots. Compatible con callers viejos (campos opcionales).
- **Events integration** — `createEvent`, `updateEvent`, `updateEventStatus` pasan snapshots completos del estado.
- **`listAuditLogs`** (server lib) — filtros por actor/entity/action/fechas + paginación + `total` count.
- **Página `/admin/system/audit-log`** — tabla paginada con filtros URL-driven (admin/entity/acción/fechas), badge de acción coloreado, **diff view expandible** (rojo `before` vs verde `after`).

#### Clone + Undo archivar (Paquete D)

- **`cloneEvent`** (server lib) — genera slug único (`<slug>-copia` / `-copia-N`, limpia sufijos previos; max 50 intentos), título con ` (Copia)`, status=`draft` FORZADO. NO copia confirmados/asistentes/encuestas/leads.
- **POST `/api/admin/events/[id]/clone`** — route handler protegido por `requireAdmin`, devuelve `{ event, sourceEvent }`.
- **Botón "📋 Clonar evento"** en EventDrawer (footer modo edit) — fila separada con hint "La copia queda en borrador".
- **Toast "Clonado — Abrir"** con link al clon (no auto-dismiss).
- **Undo archivar** — toast no-bloqueante con botón "Deshacer" (vuelve a `draft`) + barrita de progreso animada + auto-dismiss en 5s.
- **Accesibilidad del toast** — `role="status"` con `aria-live="polite"` para undo/info, `role="alert"` para errores. Respeta `prefers-reduced-motion`.
- **Audit log**: action `event_clone` con `metadata.source_event_id` + snapshots before/after.

### Internal

- **CSS** (`globals.css`): keyframe `toast-progress` (5s linear) + media query `prefers-reduced-motion`.
- **Barrel update** (`src/lib/events/index.ts`): re-exporta `cloneEvent`.

### Tests

- 110/110 pasando (sin cambios — el flujo ya está cubierto por los tests de createEvent/updateEvent existentes; undo/clone no agregan lógica nueva que rompa los tests). E2E manual en `EVENTS_ADMIN_GUIDE.md` §10.

---

## [v0.10.0] — Fase 4 (Admin `/admin/eventos` + WhatsApp manual) — 2026-06-28

**Branch:** `feat/admin-eventos` (~30 commits desde 2026-06-27).
**Status:** ✅ Funcional. Pendiente merge a `main` post-review de David.

### Added

#### Admin de eventos (`/admin/eventos`)

- Lista de eventos con cards y conteos en vivo (confirmados / asistentes / encuestas / leads promovidos).
- Detalle del evento con 4 tabs navegables (Confirmados / Asistentes / Encuestas / Leads promovidos).
- Vista Pipeline kanban 5 columnas (toggle desde el detail).
- Métricas de funnel en vivo (conversion rates entre etapas).
- Búsqueda + filtro por fuente en tab Confirmados.
- Búsqueda y match manual attendee ↔ confirmation con dropdown de candidatos.
- Marcar/des-marcar encuestas como revisadas (`reviewed_at` + `reviewed_by`).
- Acciones de WhatsApp por fila + broadcast pre-armado para todos los confirmados.

#### Wizard de import xlsx (`/admin/eventos/[id]/import`)

- Upload drag & drop de `.xlsx`.
- Auto-detección de headers vía sinonimos ES + EN + fuzzy match (determinista, no AI).
- Dry-run antes de tocar DB con preview de inserted / duplicates / invalid / warnings.
- Override manual de headers con `--map` JSON.
- Formato estricto documentado en `docs/IMPORT_FORMAT.md`.
- Idempotencia: `importBatchId` único por run, dedup atómico por UNIQUE constraint.
- Report con warnings de data quality por fila.

#### CRM drawer del lead

- Badge "📅 Vino de evento X, encuesta Y, interés Z" en el header.
- Historial de contactos (`lead_interactions`): badges dirección (inbound/outbound/system) + canal (whatsapp/email/phone/form/system) + form para registrar nuevo.
- Drawer con: datos, cambiar etapa, WhatsApp actions, conversación IA (demo), notas, tareas, citas, sugerencias IA (demo).

#### WhatsApp workflow

- Estados por lead: `no_contactado` → `mensaje_preparado` → `contactado` → `respondió` → `interested` / `lost`.
- Audit log en `lead_whatsapp_log` (template usado, message preview, sent_by, sent_at).

#### Admin polish (Bloque 3)

- **3A** — `EmptyState` component reutilizable con icono + título + descripción + CTA.
- **3B** — `SubmitButton` con estado pending via `useFormStatus` + aplicado en 5 forms.
- **3C** — Error boundary global en `/admin/**`.
- **3D** — 5 `loading.tsx` skeletons + `AdminView` interno.
- **3E** — Validación inline con `aria-invalid` + `role="alert"` + mensajes accionables.
- **3F** — Mobile polish (375×812 verificado con Playwright MCP, 0 horizontal overflow).

#### Dev tooling

- Endpoint `/api/dev/login` (POST one-shot) + script `tests/playwright/dev-login.mjs`.
- Doc `docs/DEV_LOGIN_BYPASS.md` con uso desde Playwright MCP.

### Changed

- `AdminView` ahora muestra skeleton en `ready=false` (en vez de texto plano "Cargando panel…").
- EventDrawer cambia de error banner genérico a errores per-field inline.
- LeadDetailDrawer (notas/tareas/interacciones) usa `<Field error>` para validación inline.
- `Field` component extendido con `error` + `required` props; auto-inyecta `aria-invalid` + `aria-describedby` en Input/Textarea hijos.

### Fixed

- **Fuzzy match de headers cortos** (`importer.ts`): un edit en strings ≤3 chars matcheaba
  cualquier cosa (ej: "Foo" → "ok" con Levenshtein 2, false positive). Ahora fuzzy match
  desactivado para minLen ≤3 (exact match sigue funcionando). Cierra 2 tests pre-existentes.
- **CRM Próximas citas** (`CRMView.tsx`): el badge decía "1 agendadas" pero la lista mostraba
  6 (incluyendo "No asistió" y "Completada"). Fix: usar `upcomingAppts.map` en vez de `appts.map`.
- **Hydration warning en Input.tsx**: agregado `suppressHydrationWarning` a `<input>` y `<textarea>`
  (patrón Next.js para password managers).
- **Typo en seed del taller funnels-vente**: "disenar"/"conversion" sin acentos → "diseñar"/"conversión".

### Security

- Auditoría externa 2026-06-27: race en `promoteSurveyToLead` cerrada con UNIQUE INDEX;
  PII fuera de logs (`emailLength`/`emailDomain` en vez de emails crudos);
  `link_event_unique` redefinida como `(link_type, link_id)`.
- RLS habilitado en todas las tablas de eventos (`events`, `event_confirmations`,
  `event_attendees`, `event_surveys`, `event_survey_unmatched`, `lead_event_links`).
- Todos los `/api/admin/**` llaman `requireAdmin()` (defensa en profundidad).

### Internal

- 9 server libs (events / confirmations / attendees / surveys / promotion + ops-client).
- 6 tablas nuevas + 4 enums + RLS.
- Migrations aplicadas: `20260627000000_events_funnel.sql` (Fase 3) +
  `20260627010000_funnel_hardening.sql` + `20260627020000_survey_reviewed.sql` +
  `20260628000000_whatsapp_followup.sql`.
- Tests: 98/98 pasando.
- Docs nuevos: `EVENTS_ADMIN_GUIDE.md`, `AUDIT_REPORT.md` (referencia), `demo-socios.html`,
  actualizaciones a `OPEN_ITEMS.md`, `ROADMAP.md`.

---

## [v0.7.0] — Fase 3 (Events Funnel Foundation) — 2026-06-26

**Branch:** `feat/events-funnel-foundation` → mergeado a `main`.

### Added

- Schema de eventos: 6 tablas + 4 enums + RLS.
- 5 server libs: events / confirmations / attendees / surveys / promotion.
- Mapper row ↔ dominio + typegen provisional.
- Importer CLI con parser tolerante a headers variables.
- Barrel `src/lib/events/index.ts` como fachada pública.
- 37 unit tests + 7 end-to-end contra Supabase real.

### Fixed

- Cierre del H2 del QA Fase 2 (race condition en tags): `linkLeadToEventRecord` ahora usa
  `lead_event_links` (INSERT-only con UNIQUE) en vez de SELECT-then-UPDATE sobre `leads.tags`.

---

## [v0.9.0] — LMS Real Foundation — 2026-06-25

**Branch:** `feature/lms-real-foundation` → mergeado a `main`.

### Added

- DB: 5 tablas + RLS para LMS.
- Server libs: `getCourseById`, `getCourseBySlug`, `enrollUserInCourse`.
- Google OAuth (reemplaza magic link).
- QR enrollment con tracking `source` + página `/inscripcion/[slug]`.
- Fallbacks automáticos (UUID legacy → mock fallback).
- Seed script (idempotente): 4 cursos + 12 módulos + 36 lecciones.
- Tour Playwright con 7 screenshots + cross-check de DB.

---

## [v1.0.x] — Entitlements — 2026-06-25

**Branch:** `feature/qlick-entitlements` → mergeado a `main`.

### Added

- Schema con `courses.access_type`, tablas `course_access` + `payments` con RLS.
- 1 curso paid ($499 MXN) + 3 free.
- Server lib `src/lib/lms/entitlements.ts` con `getCourseAccess`, `checkCourseAccess`,
  `grantAccess`, `revokeAccess` (idempotente).
- Endpoint `POST /api/dev/simulate-webhook` + página `/pagar/[courseSlug]` con SimulatorForm.
- Auditoría de uso (5 críticos arreglados).

---

## Notas de proceso

- Cada release tiene branch dedicado (`feat/<feature>`, `feature/<feature>`) y se mergea a `main`
  después de luz verde explícita de David.
- OPEN_ITEMS.md es la lista viva de deuda activa + features pendientes. Se actualiza cada sesión.
- ROADMAP.md tiene el plan estratégico por fase. Se actualiza al cerrar fase.
- EVENTS_ADMIN_GUIDE.md es el manual operativo del admin (post-Fase 4).