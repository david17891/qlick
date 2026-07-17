// Verifica outbounds de WhatsApp recientes de David.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);

const LEAD_ID = "92739b21-05cf-4421-842b-6b50ea71f2d9";
const PHONE = "+526532935492";

const { data, error } = await sb
  .from("lead_whatsapp_conversations")
  .select("id, direction, body, created_at, phone_normalized, lead_id")
  .or(`lead_id.eq.${LEAD_ID},phone_normalized.eq.${PHONE}`)
  .order("created_at", { ascending: false })
  .limit(8);
if (error) {
  console.error("error:", error);
  process.exit(1);
}
console.log("=== últimos outbounds de WhatsApp de David ===");
for (const m of data ?? []) {
  console.log(`\n[${m.created_at}] ${m.direction}:`);
  console.log("  body:", m.body);
}
