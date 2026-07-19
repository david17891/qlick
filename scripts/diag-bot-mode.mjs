// scripts/diag-bot-mode.mjs
// Diagnóstico: lee y/o actualiza el setting `bot_global_mode` en system_settings.
import { readFileSync } from "node:fs";

function loadEnv() {
  const txt = readFileSync(".env.local", "utf8");
  const env = {};
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[m[1]] = v;
    }
  }
  return env;
}

const env = loadEnv();
const url = env.SUPABASE_PROJECT_REF;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Falta SUPABASE_PROJECT_REF o SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}

const restUrl = `https://${url}.supabase.co/rest/v1`;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

const targetMode = process.argv[2]; // opcional, para setear
const allowedModes = [
  "socratic_autopilot_v2",
  "socratic_no_tools_v1",
  "super_executive",
  "human_first",
  "super_executive_v2",
];

async function main() {
  // Leer valor actual.
  const sel = await fetch(`${restUrl}/system_settings?key=eq.bot_global_mode&select=key,value,updated_at`, {
    headers,
  });
  if (!sel.ok) {
    console.error("GET ERROR", sel.status, await sel.text());
    process.exit(1);
  }
  const rows = await sel.json();
  console.log("CURRENT bot_global_mode =", rows[0]?.value ?? "(null)", "| updated_at:", rows[0]?.updated_at ?? "(none)");

  if (!targetMode) {
    console.log("(no change requested — pasa el modo deseado como argv[2] para setear)");
    return;
  }
  if (!allowedModes.includes(targetMode)) {
    console.error("Modo inválido. Permitidos:", allowedModes.join(", "));
    process.exit(1);
  }

  // Upsert.
  const body = [
    {
      key: "bot_global_mode",
      value: JSON.stringify(targetMode),
      updated_at: new Date().toISOString(),
    },
  ];
  const up = await fetch(`${restUrl}/system_settings?key=eq.bot_global_mode`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!up.ok) {
    console.error("PATCH ERROR", up.status, await up.text());
    process.exit(1);
  }
  const updated = await up.json();
  console.log("UPDATED to:", updated[0]?.value, "| at:", updated[0]?.updated_at);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
