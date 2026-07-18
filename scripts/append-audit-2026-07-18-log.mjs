// Appendea entrada del audit 2026-07-18 a data/PROJECT-LOG.md.
import { readFileSync, writeFileSync } from "node:fs";

const path = "C:/Users/User/Documents/Click/data/PROJECT-LOG.md";
const current = readFileSync(path, "utf8");
const stamp = new Date().toISOString();
const entry = `
## 2026-07-18 — Audit completo: casts stale + bug latente payments.metadata

**Commit:** 8ee780a — refactor(typegen): limpiar casts stale + fix bug latente payments.metadata

**Cambios:**

### Typegen regenerado correctamente
- \`scripts/regen-supabase-types.mjs\`: la API responde \`{types: '...'}\` JSON
  envuelto. El script guardaba la respuesta cruda. Ahora extrae \`j.types\`.
  Output: 73121 bytes de TS real (antes: 76701 bytes de JSON literal).
- \`src/types/supabase.ts\`: regenerado via API. Cubre event_payments,
  event_access, event_confirmations, event_qr_tokens, leads.score,
  leads.qualification, leads.bot_paused*, etc.

### Bug latente arreglado: payments.metadata NO existe en DB
- Verificado via REST: GET /rest/v1/payments?select=metadata -> 42703
  (column does not exist).
- \`src/app/api/webhooks/stripe/route.ts\`: insert en 'amount_discrepancy'
  intentaba escribir en metadata -> 42703 silencioso en prod. Quitado.
- \`src/app/api/payments/create-checkout/route.ts\`: scholarship insert
  mismo bug. La razon del scholarship queda en external_reference.

### Casts stale limpiados
- \`src/lib/lms/event-entitlements.ts\`: 4 @ts-ignore + as never en
  events.price_mxn y event_access.confirmation_id. TODO stale borrado.
- \`src/app/api/webhooks/stripe/route.ts\`: 7 @ts-ignore + as any/never
  en event_payments, payments.course_id, event_access.
- \`src/app/api/payments/create-checkout/route.ts\`: 1 as any en
  scholarship insert.
- \`src/lib/events/ensure-event-confirmation.ts\`: 5 as any/never en
  event_confirmations (payment_status, email, phone_raw).
- \`src/lib/crm/leads-mapper.ts\`: 5 as unknown as narrowing para score,
  qualification, bot_paused*, survey_offer_sent_at.
- \`src/app/api/event-gate/[token]/click/route.ts\`: 1 as never en
  event_qr_tokens.

### Bug 16 extendido: qlick.mx fallbacks (7 sitios)
- event-gate/[token]/click/route.ts: 6 fallbacks
  'process.env.NEXT_PUBLIC_APP_URL ?? https://qlick.mx' migrados a
  appBaseUrl() (helper canonico con fix bug 16).
- lib/qr/event-tokens.ts:96: fallback 'qlick.mx' en buildCheckInUrl
  -> 'qlick.digital'.
- lib/staff/qr-token.ts:5: doc comment con URL incorrecta -> corregida.

### Dominio sincronizado con DB
- \`src/types/crm.ts\`: LeadSource ahora incluye 'synthetic_lab'.
- \`src/lib/crm/lead-utils.ts\`: leadSourceLabel incluye 'synthetic_lab'
  con label 'Lab sintetico'.

**Verificacion:**
- npm run type-check: OK
- npm test: 1421/1421 passing
- npm run lint: OK
- npm run build: OK
- git push: 011c25a..8ee780a main -> main

**Memorable porque:**
1. El typegen estaba MAL regenerado (guardaba JSON literal). El error
   TS1005 linea 1 fue la pista. Verificar siempre la primera linea
   despues de regenerar: \`Get-Content src/types/supabase.ts -TotalCount 1\`.
2. \`payments.metadata\` no existe en la DB pero el codigo lo escribia
   en 2 sitios. El \`as any\` original ocultaba el bug. TS lo expuso al
   quitar el cast. Patron: \`as any\` en inserts puede ocultar bugs de
   schema. Mejorar a casts narrow o arreglar el schema.
3. Hay 100+ \`as never\` en el query builder de Supabase (mas invasivo,
   requiere analisis uno por uno). Sprint futuro: limpialos con cuidado
   verificando inferencia despues de cada cambio.
`;

writeFileSync(path, current + entry, "utf8");
console.log("Appended entry to PROJECT-LOG.md. New size:", (current + entry).length, "bytes");
