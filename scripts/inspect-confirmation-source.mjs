// Inspecciona valores válidos del enum event_confirmation_source.
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
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Probar insert con valores comunes hasta que uno pegue
const candidates = [
  "bot", "whatsapp", "web", "landing", "registration_form",
  "admin", "manual", "api", "pay_at_door", "qr",
];

for (const source of candidates) {
  const { error } = await sb
    .from("event_confirmations")
    .insert({
      event_id: "00000000-0000-0000-0000-000000000000",
      name: "_test_",
      email: `enum-probe-${source}@example.com`,
      phone_normalized: `+5299999${Date.now().toString().slice(-4)}`,
      payment_status: "not_required",
      source,
    });
  if (!error) {
    console.log(`✓ "${source}" VÁLIDO`);
    // cleanup
    await sb.from("event_confirmations").delete().eq("email", `enum-probe-${source}@example.com`);
  } else if (error.code === "23503") {
    console.log(`✓ "${source}" VÁLIDO (FK fallo, pero el enum lo aceptó)`);
  } else {
    console.log(`✗ "${source}": ${error.message.slice(0, 80)}`);
  }
}

// También payment_status enum
console.log("\n--- payment_status ---");
for (const ps of ["pending", "paid", "paid_manual", "not_required", "refunded"]) {
  const { error } = await sb
    .from("event_confirmations")
    .select("id")
    .limit(0);
  // Skip — ya sabemos que pending funciona del reset anterior
  console.log(`  ${ps}: probable (no testeado aquí)`);
}
