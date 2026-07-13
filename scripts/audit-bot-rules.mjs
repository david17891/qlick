import { readFileSync } from "node:fs";

// Cargar .env.local manualmente (sin dependencia de --env-file en PS)
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const ref = env.SUPABASE_PROJECT_REF;
const token = env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error("Faltan SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: r.status, body: await r.json() };
}

console.log("=== Conteo total vs activas ===");
console.log(JSON.stringify(await q(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM ai_bot_rules`), null, 2));

console.log("\n=== Estructura real de ai_bot_rules ===");
console.log(JSON.stringify(await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ai_bot_rules' ORDER BY ordinal_position`), null, 2));

console.log("\n=== Estructura real de events ===");
console.log(JSON.stringify(await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'events' ORDER BY ordinal_position`), null, 2));

console.log("\n=== Estructura real de courses ===");
console.log(JSON.stringify(await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'courses' ORDER BY ordinal_position`), null, 2));

console.log("\n=== Cursos publicados (catálogo LMS) ===");
console.log(JSON.stringify(await q(`SELECT slug, title, price_mxn, status FROM courses WHERE status = 'published' ORDER BY display_order ASC LIMIT 10`), null, 2));

console.log("\n=== Eventos futuros (últimas 6h hacia adelante) ===");
console.log(JSON.stringify(await q(`SELECT id, title, status::text AS status, starts_at, ends_at FROM events WHERE starts_at > NOW() - INTERVAL '6 hours' ORDER BY starts_at ASC LIMIT 5`), null, 2));
