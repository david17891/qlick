// Append bug 21 entry al PROJECT-LOG (append-only).
import { readFileSync, writeFileSync } from "node:fs";

const path = "C:\\Users\\User\\Documents\\Click\\data\\PROJECT-LOG.md";
const current = readFileSync(path, "utf8");

const entry = `

---

## 2026-07-18 — Bug 21: guard de requires_name bloquea captura de nombre en implicit_capture

**Sintoma (audit 2026-07-18, David "audita todo, busca errores o
problemas que rompan y arregla"):** 2 tests E2E rotos en
\`tests/whatsapp-bot-implicit-capture-paid.test.mjs\` (test 985 y
986 "REGRESION implicit_capture presencial/virtual+de_pago").
El copy generado era "Antes del email necesito tu nombre
completo..." en vez del copy del implicit_capture con el precio
y opciones de pago.

**Causa raiz (verificada leyendo el codigo):**

\`bot-engine.ts:6620-6623\` tenia un guard que aplicaba el
check de "evento requiere nombre y lead no lo dio" para
\`intent === "provide_email" || intent === "provide_name"\`. El
guard pedia nombre ANTES de generar el QR (correcto para
\`provide_email\`), pero tambien se aplicaba a
\`provide_name\`. Resultado: cuando el lead mandaba nombre + email
en un solo mensaje, el guard de requires_name se ejecutaba
ANTES del case \`provide_name\`, y como
\`!lead.name?.trim()\` era true, el guard retornaba el copy de
"necesito tu nombre" sin que el case \`provide_name\` (con
implicit_capture) se ejecutara. El flow se rompia.

**Fix (1 linea + comentario):**

\`\`\`typescript
if (
  intent === "provide_email" &&  // <-- ANTES: "provide_email" || "provide_name"
  supabase
) {
  // ... cargar matchedEvent, registrationEvent, etc.
  if (
    intent === "provide_email" &&  // <-- guard explicito de requires_name
    registrationEventRequiresName &&
    !lead.name?.trim()
  ) {
    // pedir nombre antes de generar QR (solo para provide_email)
  }
}
\`\`\`

El bloque EXTERIOR sigue ejecutandose para AMBOS intents
(necesitamos cargar matchedEvent para setear
\`args.registrationEvent\` que usa el case \`provide_name\`).
El guard INTERIOR solo aplica a \`provide_email\`.

**Verificacion:**

\`\`\`
npm test
# tests 1421
# pass 1421
# fail 0
\`\`\`

Los 2 tests rotos ahora pasan. El flow de
\`provide_name\` con implicit_capture genera el copy
correcto con el precio y las opciones de pago.

**Test data update (satelite):**

Tambien actualice el \`starts_at\` del mock
\`FAKE_EVENT_PRESENCIAL\` en el test de
\`+ 5 dias\` (antes era fecha fija del 17 de julio que con el
paso del tiempo quedo en el pasado y el filtro
\`gte(now - 6h)\` de \`loadAllActiveEvents\` lo excluia).
Mismo grace que production (6h).

**Commit:** \`fix(bot): guard requires_name solo aplica a provide_email (no a provide_name)\`
`;

writeFileSync(path, current + entry, "utf8");
console.log("Appended bug 21 entry. New size:", (current + entry).length, "chars");
