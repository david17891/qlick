// Sprint v0.12 hotfix: verificar que RLS quedó habilitado + policies creadas.
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error('Faltan SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}
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
  // 1. RLS habilitado?
  const table = await q(`
    SELECT
      c.relname AS tabla,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'bot_usage_daily';
  `);
  console.log('--- Tabla bot_usage_daily ---');
  console.log(JSON.stringify(table, null, 2));

  // 2. Policies
  const pols = await q(`
    SELECT policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bot_usage_daily'
    ORDER BY policyname;
  `);
  console.log('\n--- Policies ---');
  console.log(JSON.stringify(pols, null, 2));

  // 3. Sanity: ¿anon y authenticated están explícitamente bloqueados?
  const expected = ['bot_usage_daily_block_anon', 'bot_usage_daily_block_authenticated'];
  const actual = pols.map(p => p.policyname);
  const missing = expected.filter(n => !actual.includes(n));
  if (missing.length === 0 && table[0]?.rls_enabled === true && table[0]?.policies >= 2) {
    console.log('\n✅ RLS habilitado + 2 policies creadas correctamente.');
  } else {
    console.error('\n❌ Algo no cuadra. Faltan:', missing);
    process.exit(1);
  }
})().catch(e => { console.error('ERR:', e.message); process.exit(2); });
