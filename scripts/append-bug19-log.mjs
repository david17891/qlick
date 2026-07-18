// Append bug 19 entry al PROJECT-LOG (append-only).
import { readFileSync, writeFileSync } from "node:fs";

const path = "C:\\Users\\User\\Documents\\Click\\data\\PROJECT-LOG.md";
const current = readFileSync(path, "utf8");

const entry = `

---

## 2026-07-18 — Bug 19: LLM alucina "ahora tu email" cuando lead hace pregunta libre con awaiting_field activo

**Síntoma (David probando V4 con 2 números, 2026-07-18 07:13):** Después
de clickear "Inscribirme" (que setea \`awaiting_field="email"\` en
metadata del outbound), cuando David escribió preguntas libres
("Costo", "Cuando", "Lugar", "Más info") el bot respondía con
info... excepto "Más info" donde respondió "Gracias. Ahora mándame
tu email y te paso tu QR de entrada." en vez de dar más detalles
del evento.

**Causa raíz (verificada leyendo el código):**

En el case \`question\` (linea 4093-4099), cuando el último outbound
del bot tenía \`pendingAwaitingField\` (name/email), el código
inyectaba un sufijo en el body del lead ANTES de mandarlo al LLM:

\`\`\`typescript
const lastIncomingMessageWithReminder = pendingAwaitingField
  ? body + "\\n\\n[Recordatorio interno: el bot está esperando que el
    lead entregue su " + pendingAwaitingField + ". Después de
    responder la duda, cierra el mensaje pidiendo ese dato.]"
  : body;
\`\`\`

El sufijo se inyectaba SIEMPRE, independientemente de si el body del
lead era una respuesta al flow (email válido, nombre válido) o una
pregunta libre ("Más info", "Qué incluye", "Quién expone").

El LLM priorizaba el sufijo y generaba "Gracias, ahora mándame tu
email..." pisando la respuesta a la pregunta. Las preguntas con
keywords (Costo, Cuando, Lugar) funcionaban porque el LLM
reconocía la palabra clave y respondía con info antes del sufijo;
pero "Más info" no tenía keyword reconocible, así que el sufijo ganaba.

**Por qué NO es un parche (David pidió fix de fondo):**

Agregar intents deterministas para cada pregunta común ("Más info",
"Qué incluye", etc.) es un parche que no escala. La solución de
fondo es condicionar la inyección del sufijo al contenido del body:
solo inyectar si el body PARECE una respuesta al flow.

**Fix aplicado:**

\`\`\`typescript
const bodyLooksLikeEmail = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(body.trim());
const bodyWordCount = body.trim().split(/\\s+/).filter(Boolean).length;
const bodyLooksLikeName = bodyWordCount >= 2 && isValidHumanName(body.trim());
const bodyLooksLikeAck = isAckOnly(body);
const bodyLooksLikeFlowResponse =
  bodyLooksLikeEmail || bodyLooksLikeName || bodyLooksLikeAck;
const lastIncomingMessageWithReminder =
  pendingAwaitingField && bodyLooksLikeFlowResponse
    ? body + "[Recordatorio interno: ...]"
    : body;
\`\`\`

Si el body NO parece respuesta al flow (es una pregunta libre, texto
random, etc.), NO inyectar el sufijo → el LLM responde SOLO a la
pregunta y deja el \`awaiting_field\` intacto para el próximo turno.

**Verificación del fix:**

Una vez deployado, el bot NO debe pisar la respuesta de preguntas
libres con copy de "ahora tu email". Test E2E pendiente para validar
en producción. Esperado:
- Lead pregunta "Más info" → bot responde con descripción del evento.
- Lead pregunta "Qué incluye" → bot responde con detalles.
- Lead contesta con email → bot procesa como provide_email (no cambia).
- Lead contesta con "Sí" → bot procesa como ack y cierra turno.

**Commit:** \`fix(bot): inyectar recordatorio LLM solo si body parece respuesta al flow\`
`;

writeFileSync(path, current + entry, "utf8");
console.log("Appended bug 19 entry. New size:", (current + entry).length, "chars");
