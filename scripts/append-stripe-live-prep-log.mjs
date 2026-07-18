// Appendea entrada de "Stripe Live prep" a data/PROJECT-LOG.md.
import { readFileSync, writeFileSync } from "node:fs";

const path = "C:/Users/User/Documents/Click/data/PROJECT-LOG.md";
const current = readFileSync(path, "utf8");
const entry = `
## 2026-07-18 — Stripe Live prep: handlers charge.dispute.created + payment_intent.payment_failed

**Commit:** (en este push)

**Contexto:** David sigue en test mode (no paso a live). El codigo
del webhook de Stripe cubria solo 4 eventos. Faltaban 2 criticos para
proteger el flujo de dinero real:

1. \`charge.dispute.created\` — cliente inicia chargeback en su banco.
   Si no se procesa, David no se entera hasta que recibe el email 30
   dias despues. Con handler, aparece en el admin y puede responder
   dentro del plazo de Stripe.
2. \`payment_intent.payment_failed\` — tarjeta rechazada (3DS failure,
   fondos insuficientes, card expired). Llega ANTES de
   \`checkout.session.expired\` que ya cubriamos.

## Cambios

### src/types/index.ts
- \`PaymentStatus\` union expandido: + \`"failed"\` y \`"disputed"\`.
  El typegen ya acepta estos strings (status: string libre), pero
  el union del dominio los necesitaba.

### src/components/admin/AdminView.tsx
- \`statusTone\`: \`failed\` -> "danger" (rojo), \`disputed\` -> "warning"
  (amarillo).
- \`statusLabel\`: \`failed\` -> "Fallo", \`disputed\` -> "En disputa".

### src/app/api/webhooks/stripe/route.ts
- Switch: 2 cases nuevos (\`charge.dispute.created\`,
  \`payment_intent.payment_failed\`).
- \`handleChargeDispute(event, idempotencyKey)\`:
  - Busca payment por payment_intent.id o fallback a charge.id.
  - Busca en \`payments\` (cursos) y \`event_payments\` (eventos).
  - Marca como \`disputed\` (NO revoca access: la disputa puede ganarse).
  - Audit log con dispute_id, reason, amount, evidence_due_by.
- \`handlePaymentIntentFailed(event, idempotencyKey)\`:
  - Busca payment por payment_intent.id.
  - Marca como \`failed\` (NO crea access).
  - Audit log con decline_code, decline_message, payment_method.
- Import: \`logAdminAction\` desde \`@/lib/crm/audit-server\`.

### tests/webhook-stripe-new-handlers.test.mjs (nuevo, 14 tests)
Tests estructurales (sin levantar Next.js + Supabase). Validan:
- PaymentStatus union incluye los 2 nuevos valores.
- Switch del route.ts cubre los 2 cases.
- Handlers existen y no hacen operaciones indebidas (no revoca
  access en dispute, no crea access en payment_failed).
- Buscan en payments + event_payments (fallback).
- Usan logAdminAction para audit.
- AdminView tiene los 2 estados en statusTone y statusLabel.

## Verificacion

- npm run type-check: OK
- npm test: 1446/1446 (era 1432, +14)
- npm run lint: OK
- npm run build: OK

## Lo que SIGUE faltando para live

(Reporte completo en sesion reauditoria 2026-07-18; resumen:)
1. STRIPE_SECRET_KEY de Vercel es \`sk_test_*\`. Rotar a \`sk_live_*\`.
2. STRIPE_WEBHOOK_SECRET de Vercel corresponde a test mode. Crear
   webhook en Stripe dashboard (live mode) con los 6 eventos
   (los 4 originales + \`charge.dispute.created\` + \`payment_intent.payment_failed\`).
3. Stripe account activation (identity + bank + branding + support email).
4. CFDI / facturacion con contador.
5. Test E2E con tarjeta real de \$1 MXN antes de promover a live.

**Memorable porque:**
1. \`PaymentStatus\` como type union del dominio vs typegen \`status: string\`
   fue un mismatch latente. Cualquier estado nuevo requiere update
   sincronizado en ambos. Defense: cuando se agregue un valor a
   PaymentStatus, tambien agregar al admin (statusTone + statusLabel).
2. \`charge.dispute.created\` NO revoca access: la disputa puede ganarse
   con evidencia. Revocar precipitadamente haria que el cliente pierda
   acceso aun si ganamos el caso. Stripe reembolsa el dinero si la
   disputa se resuelve a favor del cliente.
3. \`payment_intent.payment_failed\` precede a \`checkout.session.expired\`.
   Si NO tenemos el handler, el admin nunca ve el decline_code exacto
   (solo ve "el checkout expiro" sin saber que fue fondos insuficientes).
`;

writeFileSync(path, current + entry, "utf8");
console.log("Appended entry. New size:", (current + entry).length, "bytes");
