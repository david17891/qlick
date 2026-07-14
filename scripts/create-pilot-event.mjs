// Crear el evento de pruebas del piloto.
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

async function query(q, label = "?") {
  const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
    body: JSON.stringify({ query: q })
  });
  const data = await r.json();
  if (!r.ok) {
    console.error(`[${label}] HTTP ${r.status}:`, JSON.stringify(data).slice(0, 300));
    throw new Error(`Query failed: ${label}`);
  }
  return data;
}

// Crear el evento de pruebas.
// Schema:
//   required (sin default): slug, title, starts_at, short_code
//   defaults: status='draft', requires_name=true, event_rules='{}', survey_config='{}', format='in_person'
const newEvent = await query(`
  INSERT INTO public.events (
    slug, title, description, starts_at, ends_at, location,
    status, format, short_code, requires_name, event_rules, survey_config
  )
  VALUES (
    'pilot-test-' || to_char(NOW(), 'YYYYMMDD-HH24MISS'),
    'Piloto Qlick — Evento de Pruebas',
    'Evento de prueba del bot para piloto. Cada conversación empieza como usuario nuevo (reset por número).',
    NOW() + interval '7 days',
    NOW() + interval '7 days 2 hours',
    'CDMX (Zoom)',
    'published',
    'hybrid',
    -- short_code: 4 chars en Crockford Base32 (sin I, L, O, U; sin 0, 1).
    -- Reemplazamos 0→2 y 1→2 para garantizar compliance con el CHECK.
    upper(substr(replace(replace(md5(random()::text), '0', '2'), '1', '2'), 1, 4)),
    true,
    '{}'::jsonb,
    '{}'::jsonb
  )
  RETURNING id, title, slug, short_code, status, format, starts_at, location;
`, "create-pilot");
console.log("Evento creado:");
console.log(JSON.stringify(newEvent, null, 2));

// Estado final.
console.log("\n=== Estado final ===");
const final = await query(`
  SELECT id, title, slug, short_code, status, format, starts_at,
    (SELECT COUNT(*) FROM public.event_confirmations WHERE event_id = e.id) AS confirmed,
    (SELECT COUNT(*) FROM public.event_attendees WHERE event_id = e.id) AS attendees
  FROM public.events e
  ORDER BY e.starts_at ASC;
`, "final");
console.log(JSON.stringify(final, null, 2));
console.log(`\nTotal eventos: ${final.length}`);
