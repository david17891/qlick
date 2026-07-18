// Append bug 17 entry al PROJECT-LOG (append-only).
// Lee el archivo actual y concatena al final.
import { readFileSync, writeFileSync } from "node:fs";

const path = "C:\\Users\\User\\Documents\\Click\\data\\PROJECT-LOG.md";
const current = readFileSync(path, "utf8");

const entry = `

---

## 2026-07-18 — Bug 17: \`survey_q4_skip\` guard no acepta step 5 (Saltar repite + LLM alucina)

**Sintoma:** David reporto que en la encuesta post-evento V2, el boton
**Saltar** repetia la pregunta 2 veces. En la segunda repeticion, el bot
termino diciendo "Entendido, David. Ya tienes tu lugar registrado con
QR para el evento del 20 de julio. Solo falta definir el pago:
¿prefieres liquidar en linea ahora por $1,000 MXN o pagar en puerta
el dia del evento?" — copy incorrecto porque David ya habia pagado.

**Causa raiz (verificada leyendo el codigo):**

En el wizard dinamico de 5 preguntas (q1/q2/q3/q_consent/q_business),
\`q_business\` es **step 5**, no step 4. El case \`survey_q4_skip\`
(linea 3472) tenia el guard:

\`\`\`typescript
if (
  !args.surveyState ||
  args.surveyState.step !== 4   // <-- solo aceptaba step 4
) {
  return nudgeToResendWizard(...)
}
\`\`\`

Cuando David clickeaba "Saltar" en q_business, \`intent = survey_q4_skip\`
pero \`args.surveyState.step === 5\` → guard fallaba → caia a
\`nudgeToResendWizard\` que re-enviaba la pregunta actual. La segunda
pulsacion, con el wizard ya corrupto, el intent NO matcheaba
\`survey_q4_skip\` → caia al LLM (\`intent = question\`), que generaba
copy plausible sobre "definir el pago" sin consultar \`event_access\`
ni \`event_payments\`.

El case hermano \`survey_q4_text\` (linea 3362) SI aceptaba
\`step === 4 || step === 5\` para retrocompat con config legacy de 4
preguntas. El skip se quedo inconsistente.

**Fix (1 linea + comentario):**

\`\`\`typescript
if (
  !args.surveyState ||
  (args.surveyState.step !== 4 && args.surveyState.step !== 5)
) {
  return nudgeToResendWizard(...)
}
\`\`\`

Cierra el wizard con thank-you en lugar de re-enviar la pregunta.
El caso "fallo a LLM" desaparece porque el primer Saltar funciona.

**Por que no afecta retrocompat:** el case ya aceptaba el buttonId
\`survey_q_business_skip\` via intent detection; el unico bloqueo era
el state.step.

**Sprint futuro (NO bloquea, anotado por David 2026-07-18):**

El LLM en \`case "question"\` no consulta el estado de pago del lead.
Si en algun otro flow el bot cae a LLM y se genera copy de pago, puede
ser incorrecto (mostrar "puedes pagar" cuando ya pago, o al reves).

**Regla dura de David:** el estado de pago debe estar **relacionado con
x evento solamente**, no global. Si David tiene \`event_access\` active
para V2, NO significa que tenga access a V3. El LLM debe consultar pago
POR evento en contexto (el \`registrationEvent\` que ya esta en el
bot-engine), no "pago global" del lead.

**Plan concreto (sprint futuro, NO este commit):**
1. Pasar al system prompt del LLM un \`paymentContext\` con la lista
   de \`(event_id, payment_status, access_status)\` del lead.
2. El LLM genera copy coherente con el evento en contexto, no copy
   generico sobre pagos.
3. Audit completo del case \`question\` para asegurar que NO genera
   copy de pago sin consultar primero \`event_payments\`.
`;

writeFileSync(path, current + entry, "utf8");
console.log("Appended bug 17 entry. New size:", (current + entry).length, "chars");
