// scripts/upsert-system-setting.mjs
/**
 * Sprint v15 PR #2.6: siembra de `bot_global_mode = 'super_executive'`
 * en `system_settings` (UPSERT idempotente).
 *
 * El modo `super_executive` YA está implementado en el provider deepseek
 * (pickSystemPromptForMode dispatchea según este valor), pero NO estaba
 * sembrado en DB. Este script lo UPSERTA para que el admin pueda
 * activarlo desde /admin?tab=bot sin tocar SQL.
 *
 * Idempotente: si el row ya existe, hace UPDATE; si no, INSERT.
 *
 * Uso:
 *   node --env-file=.env.local scripts/upsert-system-setting.mjs \
 *     upsert bot_global_mode '"super_executive"'
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // .env.local ausente — usar vars del entorno del shell.
}

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!REF || !TOKEN) {
  console.error("Faltan SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN en .env.local");
  process.exit(1);
}

const [, , cmd, key, valueRaw] = process.argv;

if (cmd !== "upsert" || !key || valueRaw === undefined) {
  console.error("Uso: node upsert-system-setting.mjs upsert <key> <value> [--json]");
  console.error("  Default: el valor se trata como string JSON-encoded (ej. \"super_executive\").");
  console.error("  --json:  el valor se trata como JSON literal (ej. true / 42 / [1,2]).");
  console.error("  Ej: node upsert-system-setting.mjs upsert bot_global_mode super_executive");
  console.error("  Ej: node upsert-system-setting.mjs upsert bot_max_active_rules 30 --json");
  process.exit(1);
}

const isJsonMode = process.argv.includes("--json");
let value;
try {
  if (isJsonMode) {
    value = JSON.parse(valueRaw);
  } else {
    // Default: el valor es un string plano; lo JSON-encodeamos.
    value = JSON.parse(JSON.stringify(valueRaw));
  }
} catch (e) {
  console.error(`value no se pudo codificar: ${valueRaw} (${e.message})`);
  process.exit(1);
}

const sql = `
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('${key}', '${JSON.stringify(value).replace(/'/g, "''")}'::jsonb, now())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();
`.trim();

const url = `https://api.supabase.com/v1/projects/${REF}/database/query`;
const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`
  },
  body: JSON.stringify({ query: sql })
});

if (!res.ok) {
  const text = await res.text();
  console.error(`HTTP ${res.status} ${res.statusText}\n${text}`);
  process.exit(1);
}

const data = await res.json();
console.log(`[upsert-system-setting] OK key=${key} value=${JSON.stringify(value)}`);
console.log(JSON.stringify(data, null, 2));
