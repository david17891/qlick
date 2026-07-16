// Encuentra el evento activo publicado para el flow de pago.
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

const now = new Date().toISOString();
const { data: events, error } = await sb
  .from("events")
  .select("id, slug, title, status, price_mxn, format, starts_at, streaming_url")
  .eq("status", "published")
  .gt("starts_at", now)
  .order("starts_at", { ascending: true })
  .limit(5);

if (error) {
  console.error("error:", error);
  process.exit(1);
}

console.log(`Eventos activos (${events?.length ?? 0}):`);
for (const ev of events ?? []) {
  console.log(`  - ${ev.title}`);
  console.log(`    slug: ${ev.slug}`);
  console.log(`    id: ${ev.id}`);
  console.log(`    status: ${ev.status}`);
  console.log(`    format: ${ev.format}`);
  console.log(`    starts_at: ${ev.starts_at}`);
  console.log(`    price_mxn: ${ev.price_mxn}`);
    console.log(`    venue: (n/a)`);
  console.log(`    streaming: ${ev.streaming_url ?? "(none)"}`);
  console.log();
}
