// Append bug 13 documentation to PROJECT-LOG.md
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const LOG_PATH = join(ROOT, "data/PROJECT-LOG.md");

const content = readFileSync(LOG_PATH, "utf-8");

const APPEND = `

### Bug 13: tras pagar con tarjeta, webhook no registra nada (guest checkout directo)

David reporto: "pague, ahora esperar que se registre mi pago" tras
pagar el evento Marketing + IA por tarjeta. La pagina de exito
se quedaba en "Recibimos tu pago, procesando tu pago..." para
siempre. El cargo de David (cs_test_a1GBAzGTF..., 1000 MXN) se
proceso en Stripe correctamente, pero NO se registro nada en Qlick.

**Causa raiz:**

David fue directo a \`/pagar/evento/marketing-ia-para-emprendedores-pago\`
(sin pasar por el flow del bot que crea \`event_confirmation\` con
source='whatsapp_bot'). Cuando el webhook de Stripe llego:

1. Resolvio user_id correctamente (David ya tenia auth user).
2. Valido el monto (1000 MXN = 100000 centavos = 1000 * 100 OK).
3. Busco confirmation por (event_id, email) → no la encontro.
4. Fallback al helper legacy \`findConfirmationIdForEvent\` (que busca
   por leads.id = userId, que falla porque userId es auth.user.id,
   no leads.id).
5. Retorno \`mode: "confirmation_not_found"\` (200 OK, sin retry).
6. NO creo \`event_payment\`, \`event_access\`, ni envio email QR.

El cargo de David quedo en Stripe como succeeded pero sin registro
en Qlick. La pagina de exito del evento hacia \`provider.getStatus\`
que retornaba "succeeded" pero \`checkEventAccess\` retornaba false
(no habia access). Entonces mostraba "Recibimos tu pago,
procesando..." indefinidamente.

**Recover (manual) — \`scripts/recover-david-event-purchase.mjs\`:**

El script detecto que la confirmation ya existia (creada por el
flow previo del bot con email placeholder "david carrillo" sin
@) y la actualizo a \`payment_status='paid'\` y email real. Luego
creo el \`event_payment\` (id 025e1a50, 100000 centavos,
external_reference=session_id), el \`event_access\` (id e18c3c9f,
access_source='event_purchase'), y linkeo el QR token pre-existente
(\`T8P9OkN9ZAp3ORLn...\` que era huerfano pre-fix bug 10) a la
confirmation.

**Fix (commit \`ad86110\`) — \`src/lib/events/ensure-event-confirmation.ts\`:**

Nuevo helper \`ensureEventConfirmation\` que:
1. Busca confirmation por (event_id, email).
2. Si no encuentra, busca por (event_id, phone_normalized) (caso
   de confirmation previa con email placeholder).
3. Si no encuentra, CREA con source='public_form' y
   payment_status='paid' (el cargo ya paso por Stripe).
4. Maneja 23505 unique violation (carrera concurrente) con
   fallback a busqueda por phone.

El webhook de Stripe llama este helper en AMBOS bloques que
buscaban confirmation (insert de \`event_payment\` + grant de
\`event_access\`) para garantizar consistencia. Es idempotente:
si la confirmation ya existe, no hace nada.

**Tests (\`tests/ensure-event-confirmation.test.mjs\`):**

3 tests cubriendo: signature y tipos del helper, defaults
sensatos de \`EnsureConfirmationArgs\`, y shape de
\`EnsureConfirmationResult\`. Tests live con Supabase se
agregan en sprint futuro (sprint de housekeeping + regeneracion
de typegen).

**Verificacion:**

- type-check OK.
- lint OK.
- 1420/1420 tests pasan.
- Recover de David: refresca \`/pagar/evento/.../exito\` y ve
  "Listo! Ya tienes tu entrada" con link QR.
- Deploy: \`qlick-949r4wub6\` ready (commit \`ad86110\`).

**Archivos tocados:**

- \`src/lib/events/ensure-event-confirmation.ts\` — helper nuevo.
- \`src/app/api/webhooks/stripe/route.ts\` — usa el helper en 2
  bloques (event_payment insert + event_access grant).
- \`tests/ensure-event-confirmation.test.mjs\` — 3 tests del
  helper.
- \`scripts/recover-david-event-purchase.mjs\` — recover manual
  del pago de David.
- \`scripts/check-david-payment.mjs\` — diagnostico del estado
  de pagos de David.

Commit: \`ad86110 fix(webhook): stripe crea event_confirmation si no existe (guest checkout directo)\`.

**Leccion aprendida (cross-project):**

Cuando un usuario completa un checkout sin pasar por el flow
previo del bot (guest checkout directo), el sistema DEBE poder
recuperar el caso sin requerir un humano. El patron
"helper \`ensureX\` que busca y si no encuentra CREA" es la forma
correcta de manejar esto, en vez de fallar silenciosamente con
un mode=..._not_found que se loguea pero no actua.
`;

const updated = content + APPEND;
writeFileSync(LOG_PATH, updated, "utf-8");
console.log("Appended bug 13 to PROJECT-LOG.md");
