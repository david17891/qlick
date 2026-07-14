#!/usr/bin/env node
// Sprint v0.9.x PR #10 — append log entry preserving CRLF line endings.
// Run once. Idempotent (checks for marker).
import fs from "node:fs";

const filePath = "data/PROJECT-LOG.md";
const marker = "## 2026-07-14 02:30 Phoenix — Sprint v0.9.x PR #10 (hardening `human_first`)";
let content = fs.readFileSync(filePath, "utf8");

if (content.includes(marker)) {
  console.log("Entry already present, skipping.");
  process.exit(0);
}

// Detectar line endings del archivo.
const isCRLF = content.includes("\r\n");
const NL = isCRLF ? "\r\n" : "\n";

const newEntry = `## 2026-07-14 02:30 Phoenix — Sprint v0.9.x PR #10 (hardening \`human_first\`)${NL}${NL}- **Pregunta:** David pidió 4 tareas de hardening para \`human_first\` más una nueva auditoría adversarial más compleja.${NL}${NL}- **Decisión:** Cerrar las 4 tareas en un solo commit (\`edfdea5\`) con autonomía total, y agregar \`scripts/adversarial-audit-pr10-deep.mjs\` con 60 tests en 11 categorías nuevas (vs 15 del audit anterior).${NL}${NL}- **Razón:** El audit previo cerró 11 gaps, pero quedaron 3 MEDIUM (DoS body, sin invariante runtime human_first, sin cobertura matrix). Estos 3 son baja severidad en condiciones normales (el LLM responde normal con bodies de cualquier tamaño, los flows secuenciales no deberían dispararse en human_first), pero son un riesgo de regresión futuro. Cerrarlos cuesta 1 commit, vs el costo de debuggear en producción un body malicioso de 100k chars o un intent drift. David dio luz verde explícita con la lista de tareas.${NL}${NL}- **Cambios concretos:**${NL}  - \`src/app/api/whatsapp/webhook/route.ts\`: \`MAX_WHATSAPP_BODY_LENGTH = 4096\` + \`sanitizedBody\` antes de persistir.${NL}  - \`src/lib/whatsapp/bot-engine.ts\`: defense-in-depth del truncate + invariante runtime \`human_first\` (ALLOWED_HUMAN_FIRST_INTENTS set con \`errorLog\` y force a \`question\`).${NL}  - \`src/lib/ai/simulation/massive-matrix-generator.ts\`: 3 nuevos \`ContextKey\` (human_first+free_masterclass, +paid_course, +no_active_event). Matriz 10×7×5 = 350 (era 200).${NL}  - \`src/lib/ai/simulation/matrix-auditor.ts\`: comentarios actualizados 200→350.${NL}  - \`tests/bot-simulator-massive-matrix.test.mjs\`: 4 tests actualizados (M1 200→350, M3 contextos 4→7, M5 200→350, M6 20→35, M8 200→350).${NL}  - \`scripts/adversarial-audit-pr10-deep.mjs\` (nuevo): 60 tests, 11 categorías.${NL}${NL}- **Verificación:**${NL}  - \`npm run type-check\` → 0 errores.${NL}  - \`npm run lint\` → 0 warnings/errors.${NL}  - \`npm test\` → 1327/1327 verde (4 tests del matrix-generator actualizados).${NL}  - \`scripts/adversarial-audit-sprint-v0.9x.mjs\` → 15/15 verde (DoS body 100k ahora OK gracias al truncate).${NL}  - \`scripts/adversarial-audit-pr10-deep.mjs\` → 59/60 OK, 0 CRITICAL/HIGH, 1 MEDIUM (ZWSP en name, trade-off documentado).${NL}${NL}- **Hallazgos de la nueva auditoría (vs la anterior):**${NL}  - 7.1 Prompt injection (5 payloads): 5/5 OK. El bot no filtra system prompt ni ejecuta instrucciones inyectadas.${NL}  - 7.2 Zero-width Unicode en body (4 bodies): 4/4 OK. En name: 1 MEDIUM (Supabase almacena literal, React renderiza no-op).${NL}  - 7.3 Bypass EMAIL_RE (7 cuerpos): 7/7 OK. Whitespace y newlines se trimean antes de aplicar EMAIL_RE, no se filtra email válido.${NL}  - 7.4 Bypass OPT_OUT_RE (6 cuerpos): 6/6 OK. STOP fullwidth NO se clasifica como opt_out (correcto: solo STOP ASCII dispara).${NL}  - 7.5 human_first override (7 intentos de drift): 7/7 OK. El override de PR #9 atrapa todos. "no me interesa" se clasifica opt_out por diseño (LFPDPPP).${NL}  - 7.6 human_first invariant (12 bodies fuzz): 12/12 OK. El invariante PR #10 se respeta sin importar el body.${NL}  - 7.7 Phone format (8 casos): 8/8 OK. \`normalizePhone\` maneja espacios, guiones, paréntesis, newlines, doble \`+\`, letras intercaladas.${NL}  - 7.8 Body truncation boundary (5 tamaños: 4095, 4096, 4097, 5000, 50000): 5/5 OK. Persistido siempre ≤ 4096.${NL}  - 7.9 Multi-turn prompt injection: 1/1 OK. ZWSP instruction + trigger no rompe el LLM.${NL}  - 7.10 Massive batch (50 leads paralelos): 1/1 OK. 50/50 fulfilled, 50 phones únicos, 538ms total.${NL}  - 7.11 Matrix ContextKeys (PR #10): 2/2 OK. 3 nuevos contextos presentes, total 350.${NL}${NL}- **Decisiones de diseño confirmadas:**${NL}  - \`MAX_WHATSAPP_BODY_LENGTH = 4096\` (límite oficial Meta WhatsApp Business API).${NL}  - \`ALLOWED_HUMAN_FIRST_INTENTS = {opt_out, provide_email, question}\` (3 valores, no 2).${NL}  - Force to \`question\` (no throw) en invariante violada — sigue siendo seguro, va al LLM.${NL}  - ZWSP en name: trade-off conocido, NO se corrige en este sprint. Documentado como MEDIUM. Cierre futuro opcional: \`name.replace(/[\\u200B-\\u200D\\uFEFF\\u2060]/g, "")\` en \`createSyntheticLead\` y \`provide_name\` persistence.${NL}${NL}- **Impacto en prod:** Ninguno visible para usuarios. Las defensas son silent (truncate, log, force-to-question). El bot sigue funcionando idéntico para bodies normales. Los leads con bodies >4096 chars ahora se persisten truncados (no falla). El invariante human_first no se violó en prod (no hay logs de "human_first invariant violated" en el periodo auditado).${NL}${NL}- **PR / commit:** \`edfdea5 fix(bot): hardening PR #10 — body truncate + human_first invariant + matrix coverage\` (mergeado a \`main\`, pusheado a \`origin/main\`).${NL}${NL}- **Siguiente sprint sugerido:** limpiar ZWSP en name (5 líneas en 2 archivos, MEDIUM documentado). O pasar al Sprint v0.10 con la siguiente fase del roadmap.${NL}${NL}`;

const anchor = "## 2026-07-12 ~21:30 Phoenix — Sprint fix-c4-c5-2026-07-12 (Cierra C-4 + C-5)";
if (!content.includes(anchor)) {
  console.error("Anchor not found!");
  process.exit(1);
}

const updated = content.replace(
  anchor,
  newEntry + anchor
);

fs.writeFileSync(filePath, updated, "utf8");
console.log(`OK. File is ${isCRLF ? "CRLF" : "LF"}, new size=${updated.length}, original=${content.length}, diff=+${updated.length - content.length} chars.`);
