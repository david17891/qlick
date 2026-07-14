// Sprint v0.11 verification: confirm event_attendees has the new lead_id column
// after applying the migration.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error("Falta SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN en .env.local");
  process.exit(1);
}

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    query: `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_attendees'
        AND column_name IN ('id', 'lead_id', 'guests', 'phone_normalized', 'event_id')
      ORDER BY column_name;
    `
  })
});

const rows = await r.json();
console.log("event_attendees columns (filtered):");
console.log(JSON.stringify(rows, null, 2));

// Verificar que lead_id existe.
const hasLeadId = Array.isArray(rows) && rows.some((c) => c.column_name === "lead_id");
if (!hasLeadId) {
  console.error("\n✗ FAIL: la columna lead_id NO existe en event_attendees");
  process.exit(1);
}
console.log("\n✓ PASS: columna lead_id existe en event_attendees");

// Contar filas con lead_id poblado vs null (backfill effectiveness).
const backfill = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    query: `
      SELECT
        COUNT(*) FILTER (WHERE lead_id IS NOT NULL) AS with_lead_id,
        COUNT(*) FILTER (WHERE lead_id IS NULL) AS without_lead_id,
        COUNT(*) AS total
      FROM public.event_attendees;
    `
  })
});
const bf = await backfill.json();
console.log("\nBackfill stats:");
console.log(JSON.stringify(bf, null, 2));
