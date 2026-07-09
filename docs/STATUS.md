# Project Status — Snapshot vivo

> **Propósito:** Single source of truth "dónde estamos AHORA". A diferencia de
> `ROADMAP.md` (planes) y `OPEN_ITEMS.md` (deuda histórica), este doc captura
> el estado actual de producción en un momento dado.
>
> **Cuándo actualizarlo:** después de cada deploy, cambio de env var, fix
> crítico, o descubrimiento que invalida lo escrito. NO es append-only —
> se sobreescribe con el nuevo snapshot.
>
> **Última actualización:** 2026-07-08 21:00 — **Hotfix #3: edit confirmado en vista Confirmados**. David pidió poder editar los confirmados del evento directamente desde `/admin/eventos/[id]?tab=confirmations` (no solo desde el drawer del CRM global). El drawer del CRM (commit `997378f`) queda intacto — es para editar el lead global; este es para editar el confirmado del evento en su contexto. Son independientes por diseño (un lead puede tener múltiples confirmados en eventos distintos, con datos que divergen en el tiempo).

---

## Hotfix #3 (2026-07-08 ~21:00): admin edit confirmed attendee (name/email/phone)

**Cambios:**
- `updateConfirmationFields()` server-side en `confirmations-server.ts`: valida formato (mismas reglas que `updateLeadFields` del CRM — email RFC-lite, phone E.164 via `normalizePhone`, name 1-100), diff contra fila, audit log con before/after JSONB (`action='event_confirmation_edit'`), re-mapea `event_qr_tokens` si cambia email/phone (best-effort — no rompe la op principal si falla).
- `editConfirmationAction()` server action en `_actions.ts`: delega a la lib, `revalidatePath` al éxito.
- `EditConfirmationButton.tsx` client component: modal inline con form (name/email/phone) + Save/Cancel, `useFormState` + `useFormStatus` para feedback de error/éxito en vivo, cierre automático al success. Patrón consistente con el drawer del CRM global.
- +13 tests en `tests/confirmations-admin-edit-fields.test.mjs` cubriendo validación, diff, audit, errores DB, re-mapeo QR, confirmation not found.

**Rama:** `fix/eventos-confirmados-edit-2026-07-08` (en worktree `C:\Users\User\Documents\Click-fix-confirmados`). Mergeado a main después de "rama principal" de David.

**Validación:** type-check ✓ · lint ✓ · **726/726 tests verde** (713 + 13 nuevos) · build ✓.

**Lo que David puede hacer ya en producción:**
- Ir a `/admin/eventos/[id]?tab=confirmations` → cada fila de confirmado tiene botón "✏️ Editar" → click → modal con form → save.
- Placeholders heredados del bug del bot ("WhatsApp Lead", emails `wa.xxx@placeholder.local`) se identifican fácil y se corrigen en sitio.
- Cada save registra `event_confirmation_edit` en `admin_audit_log` con `before/after` + `metadata.fields_changed` + `metadata.eventId`.
- Si cambia el email/phone, el QR token asociado se re-mapea automáticamente (best-effort) — "Reenviar email" usa los datos nuevos sin re-generar el token.

---

## Feature previa (2026-07-08 ~19:30, mergeada en hotfix #1+#2): admin edit lead fields + bot order-independent

Sesión David pidió: (a) editar los 4 leads "WhatsApp Lead" legacy desde el drawer del CRM (placeholders del bug del bot, ej. `36249ecd` Yesy087, `646bc08f` UK, `a5360d1c`, `fe8ff672`), (b) hacer el bot más inteligente con orden-independiente de nombre+email.

**Feature 1 — Admin edit lead fields (commit `997378f`):**
- `updateLeadFields()` server-side con validación (email RFC-lite, phone E.164, name 1-100), diff contra fila actual (solo persiste lo que cambió), audit log JSONB con before/after snapshots (`action='lead_field_edit'`).
- `PATCH /api/admin/leads/[id]` extendido: acepta status Y/O name/email/phone en cualquier combinación.
- `patchLeadFields()` en ops-client.ts.
- `LeadDetailDrawer`: toggle view/edit inline en "Datos de contacto". Form con 3 inputs + Save/Cancel + optimistic update + rollback. Badge amber "placeholder" en valores heredados del bug (WhatsApp Lead, wa.xxx@placeholder.local) para que David los identifique de un vistazo.
- +15 tests unitarios en `tests/leads-admin-edit-fields.test.mjs`.

**Feature 2 — Bot order-independent name+email (commit `dfb2f8b`):**
- Helper exportado `extractNameAndEmailTogether()`: detecta "nombre + email juntos" en cualquier orden, con/sin coma, múltiples emails (toma primero, limpia resto del nombre).
- Override en `processInboundMessage` catchall: si matchea, fuerza intent=`provide_name` antes que `detectIntent` (que mandaría a welcome/question). El handler `provide_name` ya tenía implicit email capture (FIX 2026-07-07), así que ahora ejecuta update email + generateQrToken + sendEventQrPassEmail + createConfirmation en el mismo turno.
- Casos cubiertos: "Sitlalic Guzmán ramos sitlalic.guzman@uabc.edu.mx" (3 palabras + email) → ambos en 1 turno. "david@x.com David Esparza" (email antes) → ambos en 1 turno. "David david@x.com" (1 palabra) → null (necesita apellido, manejado por otro path).
- +17 tests en `tests/whatsapp-bot-order-independent.test.mjs`.
- `--experimental-test-module-mocks` agregado a `npm test` (Node 22) para que tests puedan mockear módulos ES.

**Rama:** `fix/leads-admin-edit-fields-2026-07-08` (en worktree `C:\Users\User\Documents\Click-fix-leads-edit`). **Mergeada a main** (`1d24561`) → auto-deploy Vercel disparado (`dpl_8PdQHmtctZuDtwsx4FNdfeBrKGEs` READY).

**Validación:** type-check ✓ · lint ✓ · 713/713 tests verde (681 anteriores + 15 leads-edit + 17 bot-order) · build ✓ (55+ rutas SSG/SSR).

---

## 🏷️ Release point actual: v0.9.0 (CRM Inteligente v2.0)

**Tag Git de respaldo (HEAD estable):** *(se crea en commit de cierre de gobierno — apunta al commit `ec9eb55`)*
**Commits relevantes en `main`:**
- (HEAD actual: 1d24561 — merge de leads-admin-edit-fields; el merge de eventos-confirmados-edit está pendiente)

**Branch:** `main` (deployado en Vercel)
**Handoff canónico:** `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` ← **leer primero para contexto completo del release**

### Puntos de respaldo (Rollback Tags) disponibles

| Tag | Estado | Devuelve a | Notas |

### Hotfixes mergeados a main este sprint (2026-07-08)

| Commit | Descripción | Branch origen | Vercel deploy |
| --- | --- | --- | --- |
| `1d24561` | Merge fix/leads-admin-edit-fields (admin edit leads + bot order-independent) | `fix/leads-admin-edit-fields-2026-07-08` | `dpl_8PdQHmtctZuDtwsx4FNdfeBrKGEs` READY |
| (pendiente) | Merge fix/eventos-confirmados-edit (edit confirmado en vista Confirmados) | `fix/eventos-confirmados-edit-2026-07-08` | (disparándose) |
| `ce22647` | Merge fix/whatsapp-bot-register-intercept (hotfix #2: register sin nombre + verbos coloquiales) | `fix/whatsapp-bot-register-intercept-2026-07-08` | READY |
| `88e39f7` | Merge fix/whatsapp-bot-name-capture (hotfix #1: saludo + captura nombre) | `fix/whatsapp-bot-name-capture-2026-07-08` | READY |
| `dc74db1` | fix(admin/events): propagar format/streaming/eventRules al POST | (directo) | READY |

### Entorno

- **Producción:** `qlick.digital` / `www.qlick.digital` (Vercel) — auto-deploy en cada push a `main`.
- **Branch alias:** `qlick-git-main-david17891-9351s-projects.vercel.app` (preview del HEAD de main).
- **Supabase:** project `ugpejblymtbwtsoiykyj` (región: aws-us-east-1, plan Free).
- **WhatsApp Business API:** Meta Cloud API. Webhook validando con `WHATSAPP_WEBHOOK_SECRET` (HMAC SHA-256).
- **Email transaccional:** Brevo (sender `noreply@qlick.digital`).
- **Cron jobs Vercel:** 1/día max (Hobby plan): `0 8 * * *` event-reminders, `0 3 * * *` cleanup-qr-tokens, `0 5 * * *` survey-reminders.

### Tests status

**Total actual: 726/726 verde.**
- 110 tests base pre-Fase-7b.
- +32 tests de la sesión 2026-07-08 (15 leads-admin-edit + 17 bot-order-independent + 13 confirmations-admin-edit).
- 583 tests restantes (CRM, eventos, payments, AI agent, QR tokens, etc).

### Decisiones recientes (ADRs en `docs/DECISIONS.md`)

- D-018: Admin client con service role (bypass RLS). actorEmail registrado en audit log.
- D-019 (implícito): confirmation fields edit via server action, re-mapeo QR token best-effort.
- D-020 (implícito): bot order-independent via helper puro + override en processInboundMessage catchall (no LLM intervene).
