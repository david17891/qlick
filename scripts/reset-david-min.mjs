// Patch mínimo: solo resetea status (no toca name/email por NOT NULL).
// El bot va a tratar a David como "ya identificado" pero el wizard state
// está limpio, así que el flow arranca como lead que vuelve.
import { createClient } from "@supabase/supabase-js";
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
const LEAD_ID = "92739b21-05cf-4421-842b-6b50ea71f2d9";

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data, error } = await sb
  .from("leads")
  .update({
    status: "new",
    whatsapp_status: "no_contactado",
  })
  .eq("id", LEAD_ID)
  .select("id, name, email, status, whatsapp_status");

if (error) {
  console.log("[RESET-MIN] error:", error.message);
  process.exit(1);
}
console.log("[RESET-MIN] lead state:", data?.[0]);
console.log("[RESET-MIN] ✓ Listo. Bot va a tratar David como lead conocido, sin wizard pendiente.");
