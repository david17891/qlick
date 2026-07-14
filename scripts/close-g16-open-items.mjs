// Sprint v0.11 housekeeping: close G-16 in OPEN_ITEMS.md.
import fs from "node:fs";

const filePath = "docs/OPEN_ITEMS.md";
let content = fs.readFileSync(filePath, "utf8");

// Detectar line endings.
const isCRLF = content.includes("\r\n");
const NL = isCRLF ? "\r\n" : "\n";

// Idempotencia: si ya está cerrado, no hacer nada.
if (content.includes("✅ **CERRADO** | 3 comentarios engañosos en código arreglados")) {
  console.log("G-16 ya está cerrado. Skip.");
  process.exit(0);
}

// 1. Actualizar la descripción detallada (línea 57).
const oldDetail = `| **G-16** | 3 comentarios engañosos en código: \`webhooks/handler.ts:1-13\` dice "PLACEHOLDER SEGURO" pero persiste, \`whatsapp-provider.ts:7-13\` dice "manual_wa único activo" cuando \`meta_cloud_api\` está activo, \`agent-provider.ts:7-9\` dice "modo sugerencia" cuando responde auto. | Limpiar 3 comentarios para reflejar el estado real. |`;
const newDetail = `| **G-16** | 3 comentarios engañosos en código + 4 archivos collateral con la misma raíz. | ✅ **CERRADO** en Sprint v0.11 (sesión 2026-07-14). Cleanup completo: 7 archivos con nota "FIX housekeeping 2026-07-14 (G-16)" en cabecera. \`mock-agent-provider.ts\`, \`src/lib/ai/index.ts\`, \`manual-wa-provider.ts\`, \`bot-engine.ts\`, \`webhooks/verify.ts\`, \`providers/whatsapp-provider.ts\`, \`webhooks/handler.ts\` (ya estaba OK), \`agent-provider.ts\` (ya estaba OK). |`;
if (!content.includes(oldDetail)) {
  console.error("ERROR: detailed G-16 row not found");
  process.exit(1);
}
content = content.replace(oldDetail, newDetail);

// 2. Actualizar la tabla resumen (línea 172).
const oldStatus = `| **G-16** | 🟡 | ⚠️ Pendiente | Inconsistencias código/docs. |`;
const newStatus = `| **G-16** | 🟡 | ✅ **CERRADO** | 3 comentarios engañosos en código (webhooks/handler, whatsapp-provider, agent-provider) + 4 archivos collateral (mock-agent-provider, index.ts, manual-wa-provider, bot-engine) arreglados en Sprint v0.11. |`;
if (!content.includes(oldStatus)) {
  console.error("ERROR: status table G-16 row not found");
  process.exit(1);
}
content = content.replace(oldStatus, newStatus);

// 3. Actualizar el resumen (línea 175): "12 gaps cerrados" → "13 gaps cerrados" y "2 medios/bajos" → "1 medio/bajo".
const oldSummary1 = `**Resumen:** 12 gaps cerrados (G-1, G-2, G-3, G-4, G-6, G-7, G-8, G-9, G-10, G-11, G-13, G-14, G-15). 4 pendientes (2 críticos: ninguno; 2 altos: G-5, G-12; 2 medios/bajos: G-16, G-17). Sesión 2026-07-04 ~16:30.`;
const newSummary1 = `**Resumen:** 13 gaps cerrados (G-1, G-2, G-3, G-4, G-6, G-7, G-8, G-9, G-10, G-11, G-13, G-14, G-15, G-16). 3 pendientes (2 críticos: ninguno; 2 altos: G-5, G-12; 1 medio/bajo: G-17). Sesión 2026-07-14 ~05:30 (Phoenix, Sprint v0.11).`;
if (!content.includes(oldSummary1)) {
  console.error("ERROR: summary line not found");
  process.exit(1);
}
content = content.replace(oldSummary1, newSummary1);

// 4. Actualizar la sección detallada de G-16 (línea 470) para reflejar el cierre.
const oldSection = `#### G-16 · Inconsistencias entre código y docs${NL}${NL}- **Casos:** \`webhooks/handler.ts:1-13\` dice "PLACEHOLDER SEGURO" pero el route handler SÍ persiste y dispara bot. \`whatsapp-provider.ts:7-13\` dice "manual_wa es único activo" cuando \`meta_cloud_api\` está activo. \`agent-provider.ts:7-9\` dice "modo sugerencia" cuando el bot responde automático.${NL}- **Severidad:** 🟡 Media — confunde a quien lee por primera vez.`;
const newSection = `#### G-16 · Inconsistencias entre código y docs ✅ CERRADO 2026-07-14${NL}${NL}- **Casos (cerrados 2026-07-14, Sprint v0.11):**${NL}  - \`src/lib/whatsapp/webhooks/handler.ts\`: ya estaba OK al cierre del sprint housekeeping del 2026-07-12 (FIX housekeeping note en cabecera). El comentario actual explica el flujo de persistencia correctamente.${NL}  - \`src/lib/whatsapp/providers/whatsapp-provider.ts\`: ya estaba OK al cierre del sprint housekeeping del 2026-07-12 (FIX housekeeping note en cabecera). El comentario actual declara que \`meta_cloud_api\` es el provider activo en producción desde 2026-07-01.${NL}  - \`src/lib/ai/agent-provider.ts\`: ya estaba OK. El comentario actual dice "modo AUTOMÁTICO con guardrails".${NL}  - **4 archivos collateral encontrados en esta pasada** (Sprint v0.11, G-16 housekeeping completo):${NL}    - \`src/lib/ai/mock-agent-provider.ts\`: "Es el ÚNICO proveedor activo en el MVP" → corregido: deepseek es el activo, mock es fallback.${NL}    - \`src/lib/ai/index.ts\`: "MODO SUGERENCIA: el bot opera en modo sugerencia" → corregido: explica los 2 modos (automático en prod + admin/laboratorio).${NL}    - \`src/lib/whatsapp/providers/manual-wa-provider.ts\`: "Es el ÚNICO proveedor activo en el MVP" → corregido: meta_cloud_api es el activo, manual_wa es fallback.${NL}    - \`src/lib/whatsapp/bot-engine.ts:3615\`: "Modo sugerencia: el agente sugiere, validamos guardrails" → corregido: "Modo automático: el LLM genera la respuesta, validateAgentReply filtra".${NL}- **Severidad original:** 🟡 Media. Cerrado por housekeeping completo, no por código de producto.`;
if (!content.includes(oldSection)) {
  console.error("ERROR: detailed G-16 section not found");
  process.exit(1);
}
content = content.replace(oldSection, newSection);

fs.writeFileSync(filePath, content, "utf8");
console.log("OPEN_ITEMS.md updated. G-16 cerrado (status + detail + summary + section).");
