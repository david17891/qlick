// Auditoria del estado actual despues del flow manual de David.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const envText = readFileSync(join(ROOT, ".env.local"), "utf-8");
const env = {};
for (const l of envText.split(/\r?\n/)) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, eq).trim()] = v;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

console.log("=== 1. Leads (David + cleanup) ===");
const { data: leads } = await sb
  .from("leads")
  .select("id, name, email, phone_normalized, source, status, tags, message")
  .or("phone_normalized.in.(+526532935492,+526531742365),email.eq.david17891@gmail.com");
for (const l of leads ?? []) console.log("  -", l.phone_normalized, "name=" + l.name, "email=" + l.email, "source=" + l.source, "tags=" + JSON.stringify(l.tags));

console.log("\n=== 2. event_confirmations de David y cleanup ===");
const { data: ecs } = await sb
  .from("event_confirmations")
  .select("id, name, email, phone_normalized, source, payment_status, confirmed_at, event_id")
  .or("email.eq.david17891@gmail.com,phone_normalized.in.(+526532935492,+526531742365)");
for (const c of ecs ?? []) console.log("  -", c.id.slice(0, 8), "phone=" + c.phone_normalized, "name=" + c.name, "src=" + c.source, "ps=" + c.payment_status, "confirmed=" + c.confirmed_at);

console.log("\n=== 3. event_payments de David y cleanup ===");
const { data: eps } = await sb
  .from("event_payments")
  .select("id, confirmation_id, amount_mxn, status, method, external_reference, created_at, idempotency_key")
  .or("idempotency_key.like.%807d3ac3%,external_reference.like.%807d3ac3%");
console.log("  matches 807d3ac3:", eps?.length ?? 0);
for (const e of eps ?? []) console.log("    -", e.id.slice(0, 8), "amount=" + e.amount_mxn, "status=" + e.status, "method=" + e.method, "ext=" + e.external_reference);
const { data: allEps } = await sb
  .from("event_payments")
  .select("id, confirmation_id, amount_mxn, status, method, external_reference, created_at")
  .order("created_at", { ascending: false })
  .limit(20);
console.log("  ultimos 20 event_payments totales:");
for (const e of allEps ?? []) {
  const confMatch = ecs?.find((c) => c.id === e.confirmation_id);
  console.log("    -", e.id.slice(0, 8), "conf=" + (confMatch?.phone_normalized ?? "?"), "amount=" + e.amount_mxn, "status=" + e.status, "method=" + e.method, "created=" + e.created_at);
}

console.log("\n=== 4. event_access activos ===");
const { data: eas } = await sb
  .from("event_access")
  .select("id, user_id, confirmation_id, event_id, access_status, access_source, payment_id, granted_reason")
  .order("created_at", { ascending: false })
  .limit(10);
for (const a of eas ?? []) {
  const confMatch = ecs?.find((c) => c.id === a.confirmation_id);
  console.log("  -", a.id.slice(0, 8), "user=" + (a.user_id?.slice(0, 8) ?? "null"), "conf_phone=" + (confMatch?.phone_normalized ?? "?"), "status=" + a.access_status, "source=" + a.access_source, "payment=" + (a.payment_id?.slice(0, 8) ?? "null"));
}

console.log("\n=== 5. WhatsApp conversations (David y cleanup) ===");
const { data: wcs } = await sb
  .from("lead_whatsapp_conversations")
  .select("id, direction, body, created_at, lead_id, phone_normalized")
  .or("phone_normalized.in.(+526532935492,+526531742365)")
  .order("created_at", { ascending: false })
  .limit(15);
for (const m of wcs ?? []) {
  console.log("\n  [" + m.created_at + "] " + m.direction + " (phone=" + m.phone_normalized + "):");
  console.log("    " + (m.body ?? "").slice(0, 120));
}

console.log("\n=== 6. event_qr_tokens ===");
const { data: eqs } = await sb
  .from("event_qr_tokens")
  .select("id, attendee_phone_normalized, attendee_email, event_id, expires_at, checked_in_at")
  .or("attendee_phone_normalized.in.(+526532935492,+526531742365),attendee_email.eq.david17891@gmail.com");
for (const q of eqs ?? []) console.log("  -", q.id.slice(0, 8), "phone=" + q.attendee_phone_normalized, "email=" + q.attendee_email, "checked_in=" + (q.checked_in_at ?? "no"));
