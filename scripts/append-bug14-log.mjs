// Append bug 14 documentation to PROJECT-LOG.md
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const LOG_PATH = join(ROOT, "data/PROJECT-LOG.md");

const content = readFileSync(LOG_PATH, "utf-8");

const APPEND = `

### Bug 14: admin muestra "Juan Perez" no pagado aunque SÍ pagó (confirmation con email mal guardado)

David reporto: "ya vi, están habiendo problemas en los registros, mira,
yo registre a Juan Perez, con david17891@gmail.com, pero Juan Perez
no aparece pagado, pero 'erre' sí". El admin de Qlick mostraba
dos confirmations del mismo David:

  - Juan Perez (david17891@gmail.com, whatsapp_bot, pending) — NO pagado
  - erre (david17891@gmail.com, public_form, paid) — SÍ pagado

Mismo phone (+526532935492), mismo email (david17891@gmail.com),
mismo evento (Marketing + IA). Pero una estaba "Pagado" y la otra
no.

**Causa raiz (confirmations-server.ts, createConfirmation):**

El upsert hace \`onConflict: "event_id,email"\` que SOLO cubre la
UNIQUE constraint de email. La tabla tiene ADEMAS una UNIQUE
constraint \`(event_id, phone_normalized)\` (FK del flow
whatsapp_bot que matchea por phone).

Cuando el bot crea una confirmation con email="david17891@gmail.com"
pero YA EXISTE otra con mismo \`(event_id, phone_normalized)\` y
email="juan perez" (mal guardado), el upsert choca con la UNIQUE
de phone (NO la de email) y retorna 23505. El codigo del bloque
23505 buscaba el existing por \`(email OR phone)\` y retornaba el
existing SIN actualizar el email. Resultado: la confirmation
quedaba con email mal guardado, y el webhook de Stripe no la
encontraba por email (el cargo quedaba sin registrar).

**Por que se guardo "juan perez" en el campo email:**

El bot-engine del flow normal (case "provide_email") llama
\`createConfirmation({ name, email, ... })\` con email =
\`extractEmailFromText(body) ?? body.trim().toLowerCase()\`. Para
body="david17891@gmail.com", el email deberia ser
"david17891@gmail.com". Pero el upsert que vimos arriba choco
con la UNIQUE de phone. Cuando la BD ya tenia una confirmation
con ese phone (de un flow anterior) y email mal guardado
("juan perez"), el createConfirmation retornó el existing
sin actualizar.

Pero el bug del bot-engine que guardo "juan perez" inicialmente
sigue existiendo. Hay dos bugs:

  1. (Raiz, ya fixeado) createConfirmation no actualiza email
     cuando choca con UNIQUE de phone.
  2. (Histórico) El bot-engine del flow anterior guardo
     "juan perez" en el campo email. Probablemente el primer
     `createConfirmation` de ese flow (sin existing por
     phone) uso `email="juan perez"` por algun otro bug
     (posiblemente extractEmailFromText con un body que no
     era email, o el caller paso name en lugar de email).

**Fix (commit \`eff6b87\`, confirmations-server.ts):**

En el bloque 23505 (existing por phone), si el input.email es
valido (regex basica) Y el existing.email es invalido
(placeholder, sin @, o duplicado con el name), ACTUALIZAMOS el
email del existing al valor del input via UPDATE. Tambien
aplicado en el bloque data=null (ignoreDuplicates=true sin
error) que tenia el mismo bug.

Pattern matching: \`existing.email === existing.name\` detecta el
caso especifico de David/Juan donde el bot-engine guardo el
nombre en el campo email.

**Cleanup:**

- Borrada la confirmation duplicada de Juan
  (\`c31b0202-41c9-4206-aceb-7b162454d6a4\`, email="juan perez").
- Borrado el QR token huerfano asociado
  (\`5937c7a0-5ece-4de0-aee8-05beb20864d3\`, attendee_email="juan perez").
- La confirmation de "erre" (\`4fb48102-34aa-4ab0-ae8d-f7a8816ba643\`)
  SÍ tiene \`event_payment\` y \`event_access\` correctos del
  cargo de David.

**Verificacion:**

- type-check OK.
- lint OK.
- 1420/1420 tests pasan.
- BD limpia: 1 sola confirmation de David (erre, paid,
  public_form) + event_payment \`71ec7720\` (amount=1000, stripe,
  approved) + event_access \`826dd15a\` (event_purchase, active).
- Deploy: \`qlick-ba1cj1sro\` ready (commit \`eff6b87\`).

**Archivos tocados:**

- \`src/lib/events/confirmations-server.ts\` — fix del bloque
  23505 y data=null en \`createConfirmation\`.

Commit: \`eff6b87 fix(confirmations): createConfirmation actualiza email placeholder en duplicados por phone\`.

**Sprint future (TODO):**

- Investigar bug del bot-engine que guardo "juan perez" en el
  campo email originalmente (no en este sprint).
- Tests live con Supabase para el fix de createConfirmation
  (requieren setup de test isolation con phone+email unicos).
- Regenerar typegen (payment_status sigue dando errores en
  event_confirmations).

**Leccion aprendida (cross-project):**

Cuando un upsert tiene un \`onConflict\` que NO cubre TODAS las
UNIQUE constraints de la tabla, los duplicados por las otras
constraints escapan del upsert y caen al codigo de error
(23505) o al bloque data=null. Esos bloques deben detectar
"el input trae un valor valido y el existing tiene un
placeholder" y actualizar el existing. Caso contrario, el
placeholder se queda para siempre.
`;

const updated = content + APPEND;
writeFileSync(LOG_PATH, updated, "utf-8");
console.log("Appended bug 14 to PROJECT-LOG.md");
