// Baseline: counts of inbound by hour-of-day, last 7 days, vs last 4h
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const SEVEN_D_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const FOUR_H_AGO = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
const NOW = new Date().toISOString();

// 1) Inbound by hour of day (Phoenix TZ), last 7 days, excluding David's bypass phones
const { data: allIn, error } = await supabase
  .from("lead_whatsapp_conversations")
  .select("phone_normalized, created_at, body")
  .eq("direction", "inbound")
  .gte("created_at", SEVEN_D_AGO)
  .not("phone_normalized", "in", "(+526532935492,+526531742365)")
  .order("created_at", { ascending: false })
  .limit(2000);
if (error) console.error("err", error);

// Bucket by date+hour (Phoenix)
const buckets = new Map();
for (const r of allIn ?? []) {
  const d = new Date(r.created_at);
  const local = d.toLocaleString("en-US", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  // local format: "07/08/2026, 22:00"
  const [date, hour] = local.split(", ");
  const key = `${date} ${hour}:00`;
  if (!buckets.has(key)) buckets.set(key, { count: 0, sample: [] });
  const b = buckets.get(key);
  b.count++;
  if (b.sample.length < 3) b.sample.push((r.body ?? "").slice(0, 40));
}
const sorted = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
console.log("\n=== INBOUND EXCL. DAVID (last 7d, by hour Phoenix) ===");
for (const [k, v] of sorted) {
  const flag = new Date(k + " MST").getTime() >= new Date(FOUR_H_AGO).getTime() ? " <-- LAST 4H" : "";
  console.log(`${k}  count=${v.count}  samples=${JSON.stringify(v.sample)}${flag}`);
}

// 2) Today's count
const todayLocal = new Date().toLocaleDateString("en-US", { timeZone: "America/Phoenix" });
const todays = sorted.filter(([k]) => k.startsWith(todayLocal));
const todayCount = todays.reduce((s, [, v]) => s + v.count, 0);
console.log(`\n=== Today (${todayLocal}) inbound excl David: ${todayCount} ===`);

// 3) Compare to same hour window in previous days
const last4h = new Date().toLocaleString("en-US", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).split(", ")[1];
console.log(`Current hour window: ${last4h}`);
const sameHourPrev = sorted.filter(([k]) => k.endsWith(last4h)).filter(([k]) => !k.startsWith(todayLocal));
console.log(`\n=== Same hour in previous days (Phoenix ${last4h}) ===`);
for (const [k, v] of sameHourPrev) console.log(`${k}  count=${v.count}`);

// 4) Latest 10 inbound from non-David phones (any time)
const { data: latest, error: e2 } = await supabase
  .from("lead_whatsapp_conversations")
  .select("phone_normalized, body, created_at")
  .eq("direction", "inbound")
  .not("phone_normalized", "in", "(+526532935492,+526531742365)")
  .order("created_at", { ascending: false })
  .limit(10);
if (e2) console.error("e2", e2);
console.log(`\n=== LATEST 10 INBOUND excl. David (any time) ===`);
for (const r of latest ?? []) {
  const t = new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Phoenix" });
  console.log(`[${t}] ${r.phone_normalized}  body="${(r.body ?? "").slice(0, 60)}"`);
}
