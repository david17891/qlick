// Qlick watcher — raw fetch with service-role key, schema-correct (probed 2026-07-09)
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

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${path}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

async function count(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { ...H, Prefer: 'count=exact' } });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${path}: ${t.slice(0, 200)}`);
  }
  await r.text();
  const cr = r.headers.get('content-range');
  if (!cr) return null;
  const m = cr.match(/\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

const out = {};
const todayIso = new Date().toISOString();
const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const fortyEightHoursAgoIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

// === TARGET EVENT: Marketing + IA (11 jul) ===
const targetEvent = await get('/events?select=id,slug,title,short_code,starts_at,ends_at,status,location,description&slug=eq.marketing-ia-para-emprendedores&limit=1');
out.target_event = targetEvent[0] || null;

if (out.target_event) {
  const ev = out.target_event;

  // Counts
  const ev_q = `event_id=eq.${ev.id}`;
  ev._stats = {
    total_attendees: await count(`/event_attendees?${ev_q}`),
    checked_in: await count(`/event_attendees?${ev_q}&checked_in_at=not.is.null`),
    qr_tokens_issued: await count(`/event_qr_tokens?${ev_q}`),
    qr_tokens_checked_in: await count(`/event_qr_tokens?${ev_q}&checked_in_at=not.is.null`),
    emails_sent: await count(`/event_email_log?${ev_q}`),
    emails_failed: await count(`/event_email_log?${ev_q}&ok=eq.false`),
    consents_logged: await count(`/lead_consent_log?metadata->>eventSlug=eq.${ev.slug}`),
    consents_granted: await count(`/lead_consent_log?metadata->>eventSlug=eq.${ev.slug}&consent_granted=eq.true`),
  };

  // Attendees full list (max 500)
  const attendees = await get(`/event_attendees?select=id,name,email,phone_normalized,checked_in_at,checked_in_by,source,confirmation_id&${ev_q}&limit=500`);
  ev._stats.attendees = attendees;

  // Source breakdown
  const srcMap = {};
  for (const a of attendees) {
    const s = a.source || 'unknown';
    srcMap[s] = (srcMap[s] || 0) + 1;
  }
  ev._stats.source_breakdown = srcMap;

  // QR tokens detail (max 500)
  const qrTokens = await get(`/event_qr_tokens?select=id,attendee_phone_normalized,attendee_name,attendee_email,token,checked_in_at,expires_at,created_at&${ev_q}&order=created_at.desc&limit=500`);
  ev._stats.qr_tokens = qrTokens;
  ev._stats.qr_tokens_by_day = (() => {
    const m = {};
    for (const t of qrTokens) {
      const d = t.created_at?.substring(0, 10);
      if (d) m[d] = (m[d] || 0) + 1;
    }
    return m;
  })();

  // Emails log (last 50)
  const emails = await get(`/event_email_log?select=id,email_type,recipient,attendee_name,ok,error,sent_at,subject&${ev_q}&order=sent_at.desc&limit=50`);
  ev._stats.emails_recent = emails;
  ev._stats.emails_failures = emails.filter(e => !e.ok);
}

// === GLOBAL FUNNEL HEALTH ===
out.global = {
  total_leads: await count('/leads?select=id'),
  total_attendees: await count('/event_attendees?select=id'),
  total_qr_tokens: await count('/event_qr_tokens?select=id'),
  total_events: await count('/events?select=id'),
  published_events: await count('/events?select=id&status=eq.published'),
};

// === NEW LEADS LAST 24H ===
const leads24 = await get(`/leads?select=id,name,phone_normalized,email,status,source,intent,created_at,whatsapp_status,consent_to_contact&created_at=gte.${yesterdayIso}&order=created_at.desc&limit=200`);
out.new_leads_last_24h_count = leads24.length;
out.new_leads_last_24h = leads24;

// === NEW LEADS LAST 48H (broader sweep) ===
const leads48 = await get(`/leads?select=id&created_at=gte.${fortyEightHoursAgoIso}&limit=1000`);
out.new_leads_last_48h_count = leads48.length;

// === LEADS BY STATUS (last 30 days) ===
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const leads30d = await get(`/leads?select=status&created_at=gte.${thirtyDaysAgo}&limit=5000`);
const byStatus = {};
for (const l of leads30d) {
  const s = l.status || 'none';
  byStatus[s] = (byStatus[s] || 0) + 1;
}
out.leads_by_status_30d = byStatus;

// === WHATSAPP CONVERSATIONS LAST 24H ===
const wa = await get(`/lead_whatsapp_conversations?select=id,phone_normalized,direction,message_type,body,related_event_id,created_at&created_at=gte.${yesterdayIso}&order=created_at.desc&limit=100`);
out.whatsapp_conversations_last_24h_count = wa.length;
out.whatsapp_conversations_sample = wa.slice(0, 20);

// WhatsApp by event (which event is generating traffic)
const waEventMap = {};
for (const w of wa) {
  const eid = w.related_event_id || 'no_event';
  waEventMap[eid] = (waEventMap[eid] || 0) + 1;
}
out.whatsapp_conversations_by_event = waEventMap;

// === CONSENT LOG ===
const consents24 = await get(`/lead_consent_log?select=id,phone_normalized,consent_granted,consent_source,created_at&created_at=gte.${yesterdayIso}&order=created_at.desc&limit=50`);
out.consents_last_24h_count = consents24.length;
out.consents_recent = consents24.slice(0, 10);

// === UP-COMING EVENTS ===
const upcoming = await get(`/events?select=id,slug,title,short_code,starts_at,ends_at,status,location&starts_at=gte.${todayIso}&order=starts_at.asc&limit=20`);
out.upcoming_events = upcoming;

// === ALL PUBLISHED EVENTS (context) ===
const published = await get(`/events?select=id,slug,title,short_code,starts_at,status&status=eq.published&order=starts_at.asc&limit=20`);
out.published_events = published;

// === TIMING ===
out.run_at = new Date().toISOString();
out.run_at_phoenix = new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' });
out.event_starts_at_phoenix = out.target_event ? new Date(out.target_event.starts_at).toLocaleString('en-US', { timeZone: 'America/Phoenix' }) : null;
if (out.target_event) {
  const hoursToEvent = (new Date(out.target_event.starts_at).getTime() - Date.now()) / (1000 * 60 * 60);
  out.hours_to_event = Math.round(hoursToEvent * 10) / 10;
}

console.log(JSON.stringify(out, null, 2));