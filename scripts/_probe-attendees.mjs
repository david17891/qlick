// scripts/_probe-attendees.mjs — quick schema probe
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const env = {};
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// Try a simple query with just id to see if table is reachable at all
const r1 = await sb.from("event_attendees").select("id").limit(1);
console.log("event_attendees.id-only:", JSON.stringify({ data: r1.data, error: r1.error?.message }));

// Try a more selective probe to detect column presence
for (const col of ["created_at", "registered_at", "updated_at", "attended_at", "event_id", "lead_id"]) {
  const r = await sb.from("event_attendees").select(col).limit(1);
  console.log(`event_attendees.${col}:`, JSON.stringify({ hasError: !!r.error, errorMsg: r.error?.message || null, sample: r.data?.[0] || null }));
}