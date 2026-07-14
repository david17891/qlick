// Verificar que el backend (service_role) sigue escribiendo a bot_usage_daily
// después del hotfix de RLS.
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;

async function q(sql) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

(async () => {
  // Schema
  const cols = await q(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bot_usage_daily'
    ORDER BY ordinal_position;
  `);
  console.log('--- Columnas de bot_usage_daily ---');
  console.log(JSON.stringify(cols, null, 2));

  // Total
  const total = await q(`SELECT count(*)::int AS n FROM public.bot_usage_daily;`);
  console.log('\n--- Total filas ---');
  console.log(JSON.stringify(total, null, 2));

  // Últimas 5
  const recent = await q(`
    SELECT *
    FROM public.bot_usage_daily
    ORDER BY date DESC
    LIMIT 5;
  `);
  console.log('\n--- Últimas 5 filas ---');
  console.log(JSON.stringify(recent, null, 2));
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
