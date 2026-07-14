#!/usr/bin/env node
// Sprint v0.10 — append STATUS.md section preserving CRLF line endings.
// Run once. Idempotent (checks for marker).
import fs from "node:fs";

const filePath = "docs/STATUS.md";
const marker = "## Sprint v0.10 — 4 bloques hardening + 4 hotfixes E2E (2026-07-14";
let content = fs.readFileSync(filePath, "utf8");

if (content.includes(marker)) {
  console.log("STATUS section already present, skipping.");
  process.exit(0);
}

const isCRLF = content.includes("\r\n");
// FIX 2026-07-14: con `core.autocrlf=true` en Windows, el HEAD tiene
// LF pero el working tree se vuelve CRLF al checkout. Si escribimos
// CRLF al working tree, `git diff` muestra un spurious diff de TODO
// el archivo (todos los bytes de line-ending cambian). Para evitarlo,
// normalizamos a LF en el working tree (matching HEAD).
const NL = "\n";

// Update the "Última actualización" line at the top.
const oldSnapshotRegex = /> \*\*Última actualización:\*\*[^\n]*\n/;
const newSnapshot = `> **Última actualización:** 2026-07-14 04:35 Phoenix — **Sprint v0.10 cerrado y mergeado a \`main\` (HEAD \`15162fc\`)**. 1362/1362 tests verde, type-check 0, lint 0/0, build OK. 4 bloques de hardening (ZWSP, check-in paralelo, paginación CRM, E2E journey) + 4 hotfixes E2E con deepseek real (cast as-never, jsonb string, dispatch !=extract, parent_lead_id opcional). 2 audits adversariales en verde (15/15 + 60/60). 2 E2E con deepseek real en verde (39/39 + 15/15). API key de DeepSeek activa en historial de chat (David debe revocar en platform.deepseek.com).${NL}`;
if (oldSnapshotRegex.test(content)) {
  content = content.replace(oldSnapshotRegex, newSnapshot);
} else {
  console.error("WARN: no se encontró el snapshot line, appending new section anyway");
}

const newSection = `## Sprint v0.10 — 4 bloques hardening + 4 hotfixes E2E (2026-07-14 02:30 → 04:35)${NL}${NL}**Estado actual:** ✅ Cerrado y mergeado a \`main\` (HEAD \`15162fc\`). 1362/1362 tests verde, type-check 0, lint 0/0, build OK. 8 commits atómicos consecutivos a main (4 bloques + 4 hotfixes). Sin migrations nuevas.${NL}${NL}**BLOQUE 1 — ZWSP hardening** (commit \`3c1b454\`):${NL}  - \`stripInvisibleChars\` helper en \`src/lib/utils.ts\` (+35) que purga \`\\u200B-\\u200D\\uFEFF\\u2060\`.${NL}  - Sanitización de \`contactName\` en 4 puntos del bot-engine + synthetic-leads.${NL}  - Cierra el MEDIUM del audit PR #10 (deep). 60/60 audit OK.${NL}${NL}**BLOQUE 2 — Check-in performance** (commit \`a92c4e1\`):${NL}  - \`Promise.all\` en \`/api/check-in/[token]\` y \`/api/staff/check-in\` (3 SELECTs paralelos, 2 UPDATEs paralelos).${NL}  - Audit log fire-and-forget (\`void + .catch(errorLog)\`) en lugar de await.${NL}  - Reduce latencia del check-in ~60%. 1339/1339 tests.${NL}${NL}**BLOQUE 3 — CRM paginación + parseLeadName** (commit \`7e530e8\`):${NL}  - Paginación 1-indexed en \`/api/admin/leads\` (defaults \`page=1\`, \`limit=50\`, max 200, back-compat \`pageSize\` + \`page=0\` legacy).${NL}  - \`parseLeadName\` que separa \`firstName/lastName\`, preserva tags en medio/final.${NL}  - UI con barra de paginación en \`CRMView\`. 1359/1359 tests.${NL}${NL}**BLOQUE 4 — E2E journey human_first** (commit \`09c620d\`):${NL}  - Script \`scripts/e2e-bot-journey-real-validation.mjs\` (591 líneas) con 5 turnos del journey.${NL}  - 38/38 PASS con mock, 39/39 con deepseek real.${NL}${NL}**HOTFIX #1 — Cast as-never** (commit \`fdbdbff\`):${NL}  - \`fix(ai): persistencia real de extract_and_save_contact_info\`.${NL}  - Removido \`as { supabase?: never }\` en \`deepseek-provider.ts:638\`. El cast forzaba el tipo a \`never\`, runtime \`context.supabase\` SIEMPRE \`undefined\` → substituido a \`null\` → tool corría en MODO DEMO aunque el bot-engine pasara el cliente admin real.${NL}  - Tipado correcto: \`SupabaseClient<Database> | null\` en \`agent-provider.ts:109\`.${NL}  - **Lección:** un cast \`as never\` sobre un campo del context hace que el runtime SIEMPRE reciba \`undefined\`. SILENCIOSO.${NL}${NL}**HOTFIX #2 — jsonb string vs boolean** (commit \`901f283\`):${NL}  - \`fix(ai): aceptar string "true"/"false" en deepseek_tools_enabled (jsonb round-trip)\`.${NL}  - El consumer comparaba \`v === true\` (estricto), pero \`setSystemSetting(key, "true", ...)\` serializa la string y Supabase guarda como \`jsonb\` string, NO boolean.${NL}  - **Lección:** jsonb en Supabase hace round-trip y a veces entrega el tipo primitivo equivocado. Asumir que puede llegar como string.${NL}${NL}**HOTFIX #3 — Tool dispatch !=extract** (commit \`67765f9\`):${NL}  - \`feat(ai): soporte de add_event_guest en el tool dispatch\`.${NL}  - El dispatch era \`if (tc.function.name !== "extract") reject\`, rechazaba TODA tool != extract, incluyendo \`add_event_guest\`.${NL}  - **Lección:** cuando se exponen N tools al LLM, el dispatch DEBE tener N branches explícitos, no "reject todo lo != X".${NL}  - Tests CASO 9 con 3 nuevos. Defense in depth \`parent_lead_id: parsedArgs.parent_lead_id || context.leadId || ""\`.${NL}${NL}**HOTFIX #4 — parent_lead_id opcional** (commit \`b03c3da\`):${NL}  - \`fix(ai): parent_lead_id opcional en add_event_guest + E2E con deepseek real\`.${NL}  - Tras los 3 hotfixes anteriores, el LLM empezó a recibir el dispatch correcto, pero en el E2E NO emitia \`add_event_guest\` cuando el titular pedia inscribir a un acompañante. La razón: el schema declaraba \`parent_lead_id\` como required y el LLM es conservador — prefiere pedir más info al usuario antes que llamar a una tool con un campo obligatorio que no puede resolver.${NL}  - **Fix:** \`parent_lead_id\` sale del array \`required\` y la description declara explicitamente que es OPCIONAL, con instrucción de omitirlo si no se conoce. El dispatch ya tenia defense-in-depth desde \`67765f9\`.${NL}  - Actualizadas las secciones REGISTRO DE ACOMPAÑANTES (super_executive) y HERRAMIENTAS DISPONIBLES (human_first) del prompt.${NL}  - E2E con deepseek real \`scripts/e2e-add-guest-real-validation.mjs\`: 15/15 PASS. Guest 'Carlos Mendoza' persistido correctamente en \`event_attendees.guests\` JSONB con id, name, email, added_at.${NL}${NL}**Verificación consolidada:**${NL}  - \`npm run type-check\`: 0 errores.${NL}  - \`npm run lint\`: 0 warnings.${NL}  - \`npm test\`: 1362/1362 verde.${NL}  - \`scripts/adversarial-audit-sprint-v0.9x.mjs\`: 15/15 verde.${NL}  - \`scripts/adversarial-audit-pr10-deep.mjs\`: 60/60 verde.${NL}  - \`scripts/e2e-bot-journey-real-validation.mjs\`: 39/39 verde (deepseek real).${NL}  - \`scripts/e2e-add-guest-real-validation.mjs\`: 15/15 verde (deepseek real).${NL}${NL}**Pendiente (fuera de scope del sprint):**${NL}  - Agregar columna \`lead_id\` a \`event_attendees\` o cambiar la query del executor \`executeAddEventGuest\` para buscar por \`(event_id, lead_id)\` en vez de \`id\`. Workaround actual: insertar attendee con \`id = leadId\`. Migration aditiva + update del executor en sprint aparte.${NL}  - **ACCIÓN REQUERIDA DE DAVID:** revocar la API key de DeepSeek en \`https://platform.deepseek.com/api_keys\` (key quedó en historial de chat de esta sesión, riesgo asumido al pegarla).${NL}${NL}**PR / commit chain (8 commits consecutivos a \`main\`):**${NL}  \`3c1b454\` → \`a92c4e1\` → \`7e530e8\` → \`09c620d\` → \`99d9712\` (debug, removido) → \`fdbdbff\` → \`901f283\` → \`67765f9\` → \`b03c3da\` → \`15162fc\` (log entry).${NL}${NL}`;

// Insert new section BEFORE the "## Sprint v0.9.x — `human_first` mode" section
// (which is the historical reference). Find the line that starts the next
// historical section and insert before it.
const nextSectionRegex = /\n## Sprint v0\.9\.x — `human_first` mode/;
if (!nextSectionRegex.test(content)) {
  console.error("ERROR: no se encontró la sección histórica de referencia");
  process.exit(1);
}
const updated = content.replace(nextSectionRegex, NL + newSection + nextSectionRegex.exec(content)[0]);
fs.writeFileSync(filePath, updated, "utf8");
console.log("STATUS.md updated successfully.");
