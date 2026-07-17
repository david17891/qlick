// Append bug 11 documentation to PROJECT-LOG.md
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const LOG_PATH = join(ROOT, "data/PROJECT-LOG.md");

if (!existsSync(LOG_PATH)) {
  console.error("PROJECT-LOG.md no existe en", LOG_PATH);
  process.exit(1);
}

const content = readFileSync(LOG_PATH, "utf-8");

const APPEND = `

### Bug 11: bot contradice su flow tras pedir email para evento activo

David reporto que despues de pedir email para el evento "Marketing + IA
para Emprendedores" (precio $1000 MXN, en CANACA Mexicali), el bot
respondia "Por el momento no tenemos eventos proximos publicados" en
lugar de confirmar el registro. El bot ya tenia el evento en contexto
(de ahi pudo decir "Marketing + IA para Emprendedores del 17 de julio
en CANACA"), asi que la respuesta final era auto-contradiccion.

**Flow real capturado en BD:**

1. Lead manda "Inscribirme" (buttonId evt_inscribir_marketing-ia-...).
2. Bot responde "Para inscribirte al taller X necesito tu nombre com..."
   (intent=interactive_event_inscribir, awaiting_field="name").
3. Lead manda "David Martinez".
4. Bot responde "Gracias, David. Solo necesito tu correo electronico
   para enviarte los detalles del evento 'Marketing + IA para
   Emprendedores' del 17 de julio en CANACA. Cual es tu mejor correo?"
   (intent=question, SIN awaiting_field en metadata).
5. Lead manda "david17891@gmail.com".
6. Bot responde "Por el momento no tenemos eventos proximos publicados"
   (intent=provide_email).

**Causa raiz:**

\`loadConversationWindow\` (en \`src/lib/ai/conversation-window.ts\`)
usaba filtro \`.is("metadata->>status", null)\` para excluir status
updates vacios de Meta (sent/delivered/read con body=null). PERO este
filtro tambien excluye los outbounds del bot que tienen copy + 
metadata.status="read" (delivery tracking aplicado por
\`persistStatusUpdatesIfAny\` en el webhook handler).

Resultado en cadena:
- lastOutbound perdia awaiting_field="name" (se filtraba).
- Intent del inbound "David Martinez" NO se seteaba a provide_name
  (la condicion \`if (awaitingField === "name")\` fallaba).
- Caia al LLM (case "question") que generaba un copy similar al de
  provide_name pero SIN setear awaiting_field="email" en metadata.
- Cuando llegaba el email, case "provide_email" recibia
  args.registrationEvent=null (porque findEventInConversation no
  encontraba el evento en el lastOutbound filtrado).
- Caia al fallback getActiveEvent() que retorna "no_events" (env vars
  no seteadas en Vercel), y respondia con noEventsText.

**Fix raiz (conversation-window.ts):**

Cambiar filtro de \`.is("metadata->>status", null)\` a
\`.not("body", "is", null)\`. Los status updates de Meta son body=null
(vienen del webhook de statuses, no tienen texto). Los outbounds del
bot SIEMPRE tienen body con copy.

**Fix defensivo (bot-engine.ts, case "provide_email"):**

Si args.registrationEvent es null, intentar \`loadActiveEventContext()\`
de BD antes de declarar "no hay eventos". Solo decir noEventsText si
BD tampoco tiene eventos Y fallback de env vars esta vacio. Red de
seguridad por si en el futuro vuelve a fallar.

**Verificacion:**

- \`scripts/verify-window-fix.mjs\`: el query con body IS NOT NULL
  incluye los 3 outbounds del bot con delivery status (antes los
  excluye). El outbound critico "Para inscribirte al taller..." con
  awaiting_field="name" AHORA se incluye.
- Test E2E con processInboundMessage directo (\`scratch/e2e-bug11-direct.mjs\`):
  pre-pobla outbound con awaiting_field="name" + status="read", luego
  llama processInboundMessage("David Martinez") → intent=provide_name,
  outbound con awaiting_field="email". El fix raiz FUNCIONA end-to-end.
- type-check, lint, 1408/1408 tests pasan.
- Deploy: \`qlick-c485sad9y\` ready (commit 6f95e68).

**Archivos tocados:**

- \`src/lib/ai/conversation-window.ts\` — filtro body IS NOT NULL.
- \`src/lib/whatsapp/bot-engine.ts\` — red defensiva en case "provide_email".
- \`scripts/verify-window-fix.mjs\` — nuevo, verifica el filtro.
- \`scripts/audit-status-updates.mjs\` — nuevo, valida la hipotesis
  de que Meta status updates son body=null vs bot outbounds con
  body+delivery_status.
- \`scripts/diag-bug11.mjs\` — nuevo, diagnostica la conversacion de
  David en BD para confirmar el flow.
- \`scripts/test-match-text-to-event.mjs\` — nuevo, valida que el
  matchTitle del fix sigue funcionando con los bodies reales.
- \`scratch/e2e-bug11-direct.mjs\` — nuevo, test E2E del flow completo
  con processInboundMessage.

Commit: \`6f95e68 fix(bot): window excluye outbounds con delivery status + red defensiva provide_email\`.

### Sprint event-payments — Cierre (2026-07-17)

Sprint completo cerrado. Resumen de lo que se hizo:

**Tabla event_payments (migration 20260715120000):**
- Tabla nueva con CHECK enums method (stripe/cash/card_manual/transfer/other/simulated_event_payment) y status (pending/approved/failed/refunded/cancelled/paid_manual).
- Migracion FK: event_access.payment_id ahora apunta a event_payments (no a payments legacy). Migration 20260716120000 aplicada.

**Webhook handler (src/app/api/webhooks/stripe/route.ts):**
- 3 fixes (commits 46f00d3, 2a83f9c, d2d2f34): email lookup ANTES del INSERT, method='stripe' en CHECK enum, update event_confirmations.payment_status='paid' post-GRANT.
- persistStatusUpdatesIfAny (commit a52014e): SELECT + UPDATE en lugar de INSERT ciego para status updates de Meta.

**Pagos manuales (src/lib/payments/manual-payment.ts):**
- INSERT en event_payments con mapping de metodo y status (commit a691791).

**Helpers de pago (src/lib/payments/event-payments-server.ts):**
- Re-lee de event_payments (no payments). totalPaid/totalCollectedCentavos cuentan approved Y paid_manual (commits a52014e, 8be1d27, 82a679f).

**Notificacion WhatsApp (src/lib/payments/notify-lead-payment-confirmed.ts):**
- Mensaje "pago en puerta" ahora es comprobante con formato: monto + metodo + fecha + link QR (commit a52014e).

**Checkout evento (src/app/pagar/evento/[slug]/CheckoutButton.tsx):**
- Pasa successUrl/cancelUrl explicitos a /pagar/evento/[slug]/exito (commit c09b201).

**Bot FK event_qr_tokens (migration 20260717063306):**
- Agrega confirmation_id (uuid nullable) a event_qr_tokens con FK a event_confirmations(id) ON DELETE SET NULL.
- Backfill automatico via (event_id, attendee_phone_normalized) y (event_id, email).
- Indice idx_event_qr_tokens_confirmation_id.
- Migration aplicada via Management API (status 201).
- findActiveQrTokenForLead devuelve confirmationId: string | null.
- Bot path already_registered re-valida confirmation via confirmation_id (commit 0ac822d).
- 2 QR huerfanos de David borrados (4eb5e7f4 y 1000bd23).

**Bot bug 11 (commit 6f95e68):**
- loadConversationWindow: filtro metadata->>status IS NULL → body IS NOT NULL.
- case "provide_email": intentar loadActiveEventContext() antes de decir "no hay eventos".

**Verificacion:**
- 6 commits con author David A. <41293320+david17891@users.noreply.github.com>.
- 1408/1408 tests pasando.
- 5 deploys a Vercel (qlick-8b2hhij6v ... qlick-c485sad9y).
- Sprint future: regenerar typegen, dashboard de pagos confirmados no notificados, regenerar par de keys para live mode, qr_token persistente (Bug 6), Meta Cloud API de WhatsApp para outbound real, fix pagina de exito con polling/getStatus, reescribir commits viejos con Mavis/bot (rewrite masivo, requiere aprobacion).
`;

const updated = content + APPEND;
writeFileSync(LOG_PATH, updated, "utf-8");
console.log("Appended bug 11 + sprint cierre to PROJECT-LOG.md");
console.log(`Final size: ${updated.length} chars (~${Math.round(updated.length / 1024)} KB)`);
