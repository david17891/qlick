// Mostrar CHECK constraints de bot_usage_daily
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;

const sql = `
SELECT conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname = 'bot_usage_daily' AND c.contype = 'c'
ORDER BY conname;
`;

fetch(url, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
  .then(r => r.json())
  .then(j => console.log(JSON.stringify(j, null, 2)));
