// Introspeccion rapida de columnas de leads.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const envText = readFileSync(join(ROOT, ".env.local"), "utf-8");
const env = { ...process.env };
for (const l of envText.split(/\r?\n/)) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, eq).trim()] = v;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

for (const table of ["leads", "event_confirmations", "event_payments", "event_access"]) {
  const { data, error } = await sb.from(table).select("*").limit(1);
  if (error) {
    console.log(`\n=== ${table} === ERROR:`, error.message);
    continue;
  }
  console.log(`\n=== ${table} (${data?.length ?? 0} rows) ===`);
  if (data && data.length > 0) {
    console.log(Object.keys(data[0]).join("\n"));
  }
}
