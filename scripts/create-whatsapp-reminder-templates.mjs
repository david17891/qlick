/**
 * scripts/create-whatsapp-reminder-templates.mjs
 *
 * Crea los 3 templates de WhatsApp Cloud API para recordatorios de eventos:
 *   - recordatorio_evento_24h (UTILITY) — "mañana es el evento..."
 *   - recordatorio_evento_2h  (UTILITY) — "en 2 horas..."
 *   - recordatorio_evento_1h  (UTILITY) — "en 1 hora..."
 *
 * Categoría UTILITY (no MARKETING) — Meta aprueba más rápido y sin
 * restricciones de opt-out agresivo. Transaccional: te recordamos el
 * evento al que confirmaste asistencia.
 *
 * Variables esperadas por el provider activo:
 *   {{1}} nombre del asistente
 *   {{2}} título del evento
 *   {{3}} fecha + hora formateada
 *   {{4}} línea de lugar (vacía si no hay)
 *   {{5}} URL del pase (check-in)
 *
 * **Ejecutar UNA vez cuando el token del System User tenga acceso a la WABA:**
 *   node scripts/create-whatsapp-reminder-templates.mjs
 *
 * Si el token actual no tiene acceso a la WABA, este script devuelve
 * un error 100/403 y se necesitará regenerar el token desde Meta
 * Business Manager con `whatsapp_business_management` + `whatsapp_business_messaging`.
 *
 * Status esperado: PENDING al crear → APPROVED minutos-horas después.
 * Meta responde con 200 + { id, status: "PENDING" } al crear.
 *
 * Lee .env.local (WHATSAPP_CLOUD_ACCESS_TOKEN + WHATSAPP_CLOUD_WABA_ID).
 *
 * Server-only / manual-run only. NO incluir en CI ni cron.
 */

import { readFileSync, existsSync } from "node:fs";

const ROOT = process.cwd();

// Parse .env.local simple (sin quotes).
function parseEnv(p) {
  const out = {};
  if (!existsSync(p)) return out;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...parseEnv(`${ROOT}/.env.local`), ...process.env };
const TOKEN = env.WHATSAPP_CLOUD_ACCESS_TOKEN;
const WABA = env.WHATSAPP_CLOUD_WABA_ID;

if (!TOKEN || !WABA) {
  console.error("Faltan WHATSAPP_CLOUD_ACCESS_TOKEN o WHATSAPP_CLOUD_WABA_ID en .env.local.");
  process.exit(1);
}

const API_VERSION = env.WHATSAPP_CLOUD_API_VERSION ?? "v20.0";

/**
 * Estructura exacta que pide Meta para cada template.
 * Mantener `example.body_text` con valores plausibles (Meta valida
 * formato durante el POST).
 */
const TEMPLATES = [
  {
    name: "recordatorio_evento_24h",
    body:
      "Hola {{1}} 👋\n\n" +
      "Te recordamos que mañana es *{{2}}*.\n" +
      "🗓 {{3}}\n" +
      "{{4}}\n\n" +
      "Abrí tu pase para tener todo a mano: {{5}}",
    example: [
      ["David", "Marketing + IA para Emprendedores", "sábado, 11 de julio · 11:00 a.m.", "Zoom (link 24h antes)", "https://qlick.digital/check-in/abc123"],
    ],
  },
  {
    name: "recordatorio_evento_2h",
    body:
      "¡Hola {{1}}! ⏰\n\n" +
      "En 2 horas empieza *{{2}}*\n" +
      "🗓 {{3}}\n" +
      "{{4}}\n\n" +
      "Abrí tu pase: {{5}}",
    example: [
      ["David", "Marketing + IA para Emprendedores", "sábado, 11 de julio · 11:00 a.m.", "Zoom (link por email)", "https://qlick.digital/check-in/abc123"],
    ],
  },
  {
    name: "recordatorio_evento_1h",
    body:
      "¡Hola {{1}}! ⏰\n\n" +
      "En 1 hora empieza *{{2}}*\n" +
      "🗓 {{3}}\n" +
      "{{4}}\n\n" +
      "Abrí tu pase: {{5}}",
    example: [
      ["David", "Marketing + IA para Emprendedores", "sábado, 11 de julio · 11:00 a.m.", "Zoom (link por email)", "https://qlick.digital/check-in/abc123"],
    ],
  },
];

async function createTemplate(tpl) {
  const url = `https://graph.facebook.com/${API_VERSION}/${WABA}/message_templates`;
  const body = {
    name: tpl.name,
    category: "UTILITY",
    language: "es_MX",
    components: [
      {
        type: "BODY",
        text: tpl.body,
        example: { body_text: tpl.example },
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

console.log(`[Meta] Creando ${TEMPLATES.length} templates en WABA=${WABA} (API ${API_VERSION})…\n`);

let created = 0;
let failed = 0;
for (const tpl of TEMPLATES) {
  process.stdout.write(`  - ${tpl.name} … `);
  const { status, body } = await createTemplate(tpl);
  if (status >= 200 && status < 300) {
    const parsed = JSON.parse(body);
    console.log(`ok (status=${parsed.status ?? "?"}, id=${parsed.id ?? "?"})`);
    created += 1;
  } else {
    console.log(`FAIL (HTTP ${status}): ${body.slice(0, 200)}`);
    failed += 1;
  }
}

console.log(`\nResumen: ${created} creados, ${failed} fallidos.`);
console.log(
  "Si todos fallaron con error 100/403, el token no tiene acceso a la WABA. " +
    "Solución: regenerar System User token en Meta Business Manager con permisos " +
    "`whatsapp_business_management` + `whatsapp_business_messaging` sobre esta WABA.",
);

process.exit(failed === 0 ? 0 : 2);
