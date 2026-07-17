// Setea STRIPE_WEBHOOK_SECRET en Vercel con el valor de .env.local (sin BOM).
// Lee el valor de .env.local que SÍ está limpio (lo editamos con Edit tool, sin BOM).
// Lo pasa via stdin al script vercel-env-curl.mjs para evitar cualquier transformación
// de PowerShell que meta BOM.

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

const env = parseEnvFile(join(ROOT, ".env.local"));
const whsec = env.STRIPE_WEBHOOK_SECRET;
if (!whsec) {
  console.error("STRIPE_WEBHOOK_SECRET no encontrada en .env.local");
  process.exit(1);
}
console.log(`[SET-WHSEC-CLEAN] whsec length: ${whsec.length}`);
console.log(`[SET-WHSEC-CLEAN] has BOM: ${whsec.charCodeAt(0) === 0xFEFF}`);
console.log(`[SET-WHSEC-CLEAN] prefix: ${whsec.slice(0, 16)}...`);

// Llama al script set con el valor como argv
const r = spawnSync("node", [
  "scripts/vercel-env-curl.mjs",
  "set",
  "STRIPE_WEBHOOK_SECRET",
  whsec,
  "production",
], { stdio: "inherit", cwd: ROOT });

process.exit(r.status ?? 1);
