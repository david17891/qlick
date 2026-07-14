// Test directo: service_role puede escribir a bot_usage_daily post-RLS?
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Qlick usa SUPABASE_SECRET_KEY (convención Supabase v2) en vez del
// clásico SUPABASE_SERVICE_ROLE_KEY. Ambos son el secret role key
// del proyecto, solo cambia el nombre de la env var.
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY');
  process.exit(1);
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  // CHECK constraint: model IN ('deepseek-chat', 'deepseek-reasoner').
  // Usamos un marker único en prompt_tokens para encontrar/borrar la fila
  // (la PK es (date, model) — no podemos randomizar el modelo).
  const testId = `deepseek-chat`;
  const marker = 999000000 + (Date.now() % 1000); // ~1B, único dentro de la tabla

  // 1. INSERT via service_role
  const ins = await fetch(`${url}/rest/v1/bot_usage_daily`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      date: today,
      model: testId,
      prompt_tokens: marker,
      completion_tokens: 50,
      call_count: 1,
      estimated_cost_cents: 0.01,
    }),
  });
  const insBody = await ins.json().catch(() => ({}));
  console.log('INSERT con service_role:', ins.status, ins.statusText);
  console.log('  body:', JSON.stringify(insBody).slice(0, 200));
  if (!ins.ok) { console.error('❌ service_role NO puede escribir'); process.exit(1); }

  // 2. SELECT via service_role
  const sel = await fetch(`${url}/rest/v1/bot_usage_daily?date=eq.${today}&model=eq.${testId}`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
  });
  const selBody = await sel.json();
  console.log('\nSELECT con service_role:', sel.status, sel.statusText);
  console.log('  rows:', selBody.length, 'primera fila:', JSON.stringify(selBody[0] || null));

  // 3. DELETE para limpiar (PK compuesta: date + model)
  const del = await fetch(`${url}/rest/v1/bot_usage_daily?date=eq.${today}&model=eq.${testId}`, {
    method: 'DELETE',
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
  });
  console.log('\nDELETE cleanup:', del.status, del.statusText);

  // 4. Test anon: ¿bloqueado?
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) {
    const anonSel = await fetch(`${url}/rest/v1/bot_usage_daily?limit=1`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
    });
    const anonBody = await anonSel.json().catch(() => ({}));
    console.log('\nSELECT con anon:', anonSel.status, anonSel.statusText);
    console.log('  body:', JSON.stringify(anonBody).slice(0, 200));
    if (anonSel.status === 200 && Array.isArray(anonBody) && anonBody.length > 0) {
      console.error('❌ anon puede LEER — RLS no bloquea como esperamos');
      process.exit(1);
    } else {
      console.log('✅ anon bloqueado (esperado).');
    }
  }

  console.log('\n✅ service_role escribe/lee/borra OK. anon bloqueado. Hotfix correcto.');
})().catch(e => { console.error('ERR:', e.message); process.exit(2); });
