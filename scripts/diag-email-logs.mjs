// scripts/diag-email-logs.mjs
// Lista los event_email_log recientes para diagnosticar.
import { readFileSync } from "node:fs";

function loadEnv() {
  const txt = readFileSync(".env.local", "utf8");
  const env = {};
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  return env;
}
const env = loadEnv();
const url = `https://${env.SUPABASE_PROJECT_REF}.supabase.co/rest/v1`;
const key = env.SUPABASE_SECRET_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// Listar todos los email logs de recipients que matchean david@x.com o pending-1784...@example.com.
const r = await fetch(`${url}/event_email_log?or=(recipient.eq.david@x.com,recipient.like.pending-1784%25)&select=id,email_type,recipient,ok,event_id,sent_at&order=sent_at.desc&limit=20`, { headers });
const rows = await r.json();
console.log("Logs de email recientes:");
for (const r of rows) {
  console.log(`  ${r.sent_at} | ${r.email_type} | ${r.recipient} | ok=${r.ok} | event=${r.event_id?.slice(0, 8)}...`);
}
