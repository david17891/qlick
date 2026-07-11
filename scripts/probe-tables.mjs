// Probe schema of all relevant tables
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function probe(t) {
  try {
    const r = await fetch(`${BASE}/${t}?select=*&limit=1`, { headers: H });
    if (!r.ok) {
      console.log(`${t}: ERROR ${r.status} ${(await r.text()).slice(0, 150)}`);
      return;
    }
    const data = await r.json();
    if (data.length === 0) {
      console.log(`${t}: EMPTY (no rows)`);
    } else {
      console.log(`${t} (1 row sample):`, JSON.stringify(data[0], null, 2));
    }
  } catch (e) {
    console.log(`${t}: THROW ${e.message}`);
  }
}

const tables = ['events', 'leads', 'lead_whatsapp_conversations', 'lead_consent_log', 'event_qr_tokens', 'event_email_log', 'event_access', 'course_access', 'payments', 'event_short_links', 'bot_errors', 'survey_responses', 'attendees'];
for (const t of tables) await probe(t);