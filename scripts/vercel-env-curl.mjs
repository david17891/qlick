// API REST directa de Vercel — bypassea el CLI y el BOM issue.
// Uso: node scripts/vercel-env-curl.mjs <action> [args...]
//   list                                       — listar env vars
//   delete <envId>                             — borrar env var
//   set <key> <value> <target>                 — setear env var sin BOM
//   set-raw <key> <value> <target>             — setear con valor raw (lee de stdin)
//
// Updated 2026-07-16 — trigger Vercel auto-deploy para refrescar env vars en runtime.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf-8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };

// Carga el VERCEL_TOKEN del vault
const vault = (() => {
  const vaultPath = join(process.env.USERPROFILE, ".mavis", "api-box.env");
  if (!existsSync(vaultPath)) return {};
  return parseEnvFile(vaultPath);
})();
const token = process.env.VERCEL_TOKEN || vault.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN no encontrado en .env.local ni en api-box.env");
  process.exit(1);
}

const PROJECT_ID = "prj_CletxhxS5JxUWzNLhAADYnYzjckj";
const BASE = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env`;

const action = process.argv[2];

async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!r.ok) {
    console.error(`[${method} ${path}] error ${r.status}:`, JSON.stringify(parsed).slice(0, 500));
    return null;
  }
  return parsed;
}

if (action === "list") {
  const r = await api("GET", "?target=production");
  if (r?.envs) {
    for (const e of r.envs) {
      console.log(`${e.key.padEnd(40)} ${(e.type ?? "?").padEnd(10)} ${e.target?.join(",")} created=${e.createdAt} updated=${e.updatedAt} id=${e.id}`);
    }
  } else {
    console.log("No envs o respuesta vacía:", JSON.stringify(r).slice(0, 200));
  }
} else if (action === "delete") {
  const envId = process.argv[3];
  if (!envId) {
    console.error("Uso: node vercel-env-curl.mjs delete <envId>");
    process.exit(1);
  }
  const r = await api("DELETE", `/${envId}`);
  console.log("Deleted:", JSON.stringify(r).slice(0, 200));
} else if (action === "set") {
  const key = process.argv[3];
  const value = process.argv[4];
  const target = process.argv[5] || "production";
  if (!key || !value) {
    console.error("Uso: node vercel-env-curl.mjs set <key> <value> <target>");
    process.exit(1);
  }
  // Detecta BOM al inicio
  const hasBom = value.charCodeAt(0) === 0xFEFF;
  if (hasBom) {
    console.warn(`⚠ Valor tiene BOM UTF-8 al inicio. Stripping...`);
  }
  const cleanValue = hasBom ? value.slice(1) : value;
  console.log(`Key: ${key}`);
  console.log(`Value length: ${cleanValue.length} (raw: ${value.length})`);
  console.log(`Value prefix: ${cleanValue.slice(0, 12)}...`);
  const r = await api("POST", "", {
    key,
    value: cleanValue,
    type: key.includes("PRIVATE") || key.includes("SECRET") || key.includes("TOKEN") || key.includes("KEY") || key.includes("PASSWORD") ? "encrypted" : "plain",
    target: [target],
  });
  console.log("Created:", JSON.stringify(r).slice(0, 300));
} else {
  console.error(`Acción desconocida: ${action}`);
  console.error("Uso: list | delete <envId> | set <key> <value> <target>");
  process.exit(1);
}
