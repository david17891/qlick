// Fixed: discover schema first, then query correctly
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Discover leads schema
const { data: leadSample, error: e1 } = await supabase
  .from("leads")
  .select("*")
  .limit(1);
if (e1) { console.error("leads err", e1); process.exit(1); }
const leadCols = leadSample?.[0] ? Object.keys(leadSample[0]) : [];
console.log("=== leads columns ===");
console.log(leadCols.join(", "));

// Discover event_email_log schema
const { data: emailSample, error: e2 } = await supabase
  .from("event_email_log")
  .select("*")
  .limit(1);
const emailCols = emailSample?.[0] ? Object.keys(emailSample[0]) : [];
console.log("\n=== event_email_log columns ===");
console.log(emailCols.join(", "));

// Recent leads (correct cols)
const ONE_D_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
console.log("\n=== Recent leads (last 24h) ===");
const { data: leads, error: e3 } = await supabase
  .from("leads")
  .select("*")
  .gte("created_at", ONE_D_AGO)
  .order("created_at", { ascending: false })
  .limit(20);
if (e3) console.error("e3", e3);
for (const l of leads ?? []) {
  const t = new Date(l.created_at).toLocaleString("en-US", { timeZone: "America/Phoenix" });
  const name = l.name ?? l.full_name ?? l.first_name ?? "(no name)";
  const utm = l.utm_campaign ?? l.utm_source ?? "";
  console.log(`[${t}] ${name}  phone=${l.phone_normalized ?? l.phone}  utm="${utm}"  status=${l.status}  score=${l.lead_score}`);
}

// event_email_log
console.log("\n=== event_email_log (last 24h) ===");
const { data: emails, error: e4 } = await supabase
  .from("event_email_log")
  .select("*")
  .gte("sent_at", ONE_D_AGO)
  .order("sent_at", { ascending: false })
  .limit(30);
if (e4) console.error("e4", e4);
for (const r of emails ?? []) {
  const t = new Date(r.sent_at).toLocaleString("en-US", { timeZone: "America/Phoenix" });
  console.log(`[${t}] type=${r.email_type}  ok=${r.ok}  to=${r.recipient}  err="${(r.error ?? "").slice(0, 60)}"`);
}
