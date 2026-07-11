// Probe schema of key tables
import { readFileSync } from 'fs';
const envPath = 'C:\\Users\\User\\Documents\\Click\\.env.local';
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;
const BASE = `${URL}/rest/v1`;
const r = await fetch(`${BASE}/event_attendees?select=*&limit=1`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const data = await r.json();
console.log(JSON.stringify(data, null, 2));