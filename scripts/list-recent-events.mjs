#!/usr/bin/env node
/**
 * Lista eventos recientes para diagnóstico (Management API).
 *
 * Camino canónico: POST /v1/projects/{ref}/database/query
 * (ver docs/AGENT_SUPABASE_PROTOCOL.md §11 + memory Qlick).
 *
 * Solo lectura — safe.
 */
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error("Faltan SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const query = `
  SELECT
    e.id,
    e.title,
    e.slug,
    e.starts_at,
    e.status,
    (SELECT count(*) FROM event_confirmations ec WHERE ec.event_id = e.id) AS confirmations_count
  FROM events e
  WHERE e.starts_at > now() - interval '14 days'
  ORDER BY e.starts_at DESC
  LIMIT 12
`;

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  },
);
const status = res.status;
const data = await res.json();
console.log("HTTP", status);
if (status !== 201 && status !== 200) {
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}
const rows = Array.isArray(data) ? data : [];
if (rows.length === 0) {
  console.log("Sin eventos en los últimos 14 días.");
  process.exit(0);
}
console.log(`Eventos recientes (${rows.length}):\n`);
for (const e of rows) {
  const date = new Date(e.starts_at).toISOString().slice(0, 16).replace("T", " ");
  console.log(`  [${e.status ?? "?"}] ${date}  confs=${e.confirmations_count}`);
  console.log(`      id    = ${e.id}`);
  console.log(`      title = ${e.title}`);
  console.log(`      slug  = ${e.slug}`);
  console.log("");
}
