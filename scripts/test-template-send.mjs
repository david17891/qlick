/**
 * scripts/test-template-send.mjs
 *
 * Test E2E del template de Meta 'recordatorio_evento_24h' aprobado.
 * Manda UN SOLO mensaje a un número de prueba (no a los confirmados
 * reales), a elección de David.
 *
 * **Uso:**
 *   node scripts/test-template-send.mjs
 *
 * Variables (definidas acá, sin tocar .env ni hacer commit):
 *   - PHONE : número destino en formato internacional, ej "+5216538494002"
 *   - NAME  : nombre del destinatario (para {{1}} del template)
 *   - TITLE : título del evento (para {{2}})
 *   - WHEN  : fecha + hora legible (para {{3}})
 *
 * El script usa el provider activo (`metaCloudApiProvider` si está
 * configurado, si no `manualWaProvider` que devuelve demo: true y NO manda).
 * Lee .env.local vía `node --env-file=.env.local`.
 */

import { readFileSync, existsSync } from "node:fs";

const ROOT = process.cwd();

function parseEnv(p) {
  const out = {};
  if (!existsSync(p)) return out;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...parseEnv(`${ROOT}/.env.local`), ...process.env };

const PHONE = "5216538494002"; // +52 1 653 849 4002 — Ady (hermana de David), número de prueba NO confirmado del evento
const NAME  = "Ady";
const TITLE = "Marketing + IA para Emprendedores";
const WHEN  = "sábado, 11 de julio · 11:00 a.m.";
const TEMPLATE_NAME = "recordatorio_evento_24h";
const TEMPLATE_LANGUAGE = "es_MX";

console.log("=== Test E2E Meta template ===");
console.log(`phone     : ${PHONE.slice(0, 6)}*** (Ady, prueba)`);
console.log(`template  : ${TEMPLATE_NAME} (${TEMPLATE_LANGUAGE})`);
console.log(`vars      :`);
console.log(`  {{1}} = ${NAME}`);
console.log(`  {{2}} = ${TITLE}`);
console.log(`  {{3}} = ${WHEN}`);
console.log();

// Para Meta Cloud API: el `body` se parte en variables (una por linea).
// El provider activo (metaCloudApiProvider) hace el split en components[].
const bodyForTemplate = `${NAME}\n${TITLE}\n${WHEN}`;

const { getActiveWhatsAppProvider } = await import("../src/lib/whatsapp/index.ts");

const provider = getActiveWhatsAppProvider();
console.log(`provider  : ${provider.name} (${provider.displayName})`);
console.log(`stub      : ${provider.stub}`);
console.log(`active    : ${provider.active}`);
console.log();

const result = await provider.send({
  to: PHONE,
  body: bodyForTemplate,
  templateName: TEMPLATE_NAME,
  templateLanguage: TEMPLATE_LANGUAGE,
});

console.log("=== Resultado ===");
console.log(JSON.stringify({
  ok: result.ok,
  provider: result.provider,
  demo: result.demo,
  externalId: result.externalId,
  note: result.note,
}, null, 2));

if (result.ok && !result.demo) {
  console.log("\n✅ Mensaje enviado. externalId =", result.externalId);
  console.log("Ady debería recibir el WhatsApp con el body aprobado en Meta.");
} else if (result.demo) {
  console.log("\n⚠️ Modo demo (provider sin env vars reales). NO se envió nada.");
} else {
  console.log("\n❌ Error:");
  console.log("   ", result.note);
  process.exit(1);
}
