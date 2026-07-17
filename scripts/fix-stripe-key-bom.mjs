// Fix: re-setear STRIPE_SECRET_KEY sin BOM (mismo bug que whsec_).
// Usa la API REST de Vercel (no la CLI) para evitar BOM.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const envText = readFileSync(join(process.env.USERPROFILE || "", ".mavis", "api-box.env"), "utf-8");
const env = {};
for (const l of envText.split(/\r?\n/)) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const VERCEL_TOKEN = env.VERCEL_TOKEN;
const PROJECT_ID = "prj_CletxhxS5JxUWzNLhAADYnYzjckj";

const localText = readFileSync(join(ROOT, ".env.local"), "utf-8");
const m = localText.match(/STRIPE_SECRET_KEY="([^"]+)"/);
const cleanKey = m?.[1];
if (!cleanKey) {
  console.error("STRIPE_SECRET_KEY no encontrada en .env.local");
  process.exit(1);
}

console.log("[FIX-BOM] STRIPE_SECRET_KEY local:");
console.log("  bytes (primeros 4):", Buffer.from(cleanKey).slice(0, 4));
console.log("  hex (primeros 8):", Buffer.from(cleanKey).slice(0, 8).toString("hex"));
console.log("  length:", cleanKey.length);
console.log("  prefix:", cleanKey.slice(0, 20));

const hasBom = Buffer.from(cleanKey)[0] === 0xef && Buffer.from(cleanKey)[1] === 0xbb && Buffer.from(cleanKey)[2] === 0xbf;
console.log("  tiene BOM UTF-8?", hasBom);

// Re-seteamos via el script vercel-env-curl.mjs que ya existe.
// Primero borramos la env var actual.
console.log("\n[FIX-BOM] Borrando STRIPE_SECRET_KEY actual de Vercel...");
const delResult = spawnSync("node", [join(ROOT, "scripts", "vercel-env-curl.mjs"), "delete", "CXpfRi0CGYEOnLu6"], { encoding: "utf-8" });
console.log(delResult.stdout || delResult.stderr);

// Creamos de nuevo con el valor limpio (sin BOM).
console.log("\n[FIX-BOM] Seteando STRIPE_SECRET_KEY sin BOM via API REST directa...");

// El script vercel-env-curl.mjs espera los args <command> [args]. Vamos a usar set.
const setResult = spawnSync(
  "node",
  [join(ROOT, "scripts", "vercel-env-curl.mjs"), "set", "STRIPE_SECRET_KEY", cleanKey, "production"],
  { encoding: "utf-8", input: "" }
);
console.log("set stdout:", setResult.stdout);
console.log("set stderr:", setResult.stderr);
console.log("set status:", setResult.status);

if (setResult.status === 0) {
  console.log("\n[FIX-BOM] ✓ STRIPE_SECRET_KEY re-seteada sin BOM en Vercel.");
  console.log("NOTA: el cambio requiere redeploy para que el serverless use el valor nuevo.");
}
