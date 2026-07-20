// scripts/diag-notify-payment-repro.mjs
// Reproduce el flow de notifyLeadPaymentConfirmed con un confirmationId
// de prueba (NO toca a David). Aísla si el bug del WhatsApp no enviado
// es sistemático o específico de ese run de Stripe.
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
for (const k of Object.keys(env)) process.env[k] = env[k];

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const ts = Date.now();
const phone = `+5255999${String(700 + (ts % 100)).padStart(4, "0")}`;
const email = `notif-test-${ts}@example.com`;
const eventId = "5ca65576-19de-4ad0-b3a9-19175e21761e";

console.log(`[STEP 1] Creando lead de prueba: phone=${phone}`);
const { data: lead, error: leadErr } = await supabase.from("leads").insert({
  phone, phone_normalized: phone,
  name: "Notif Test",
  email: `pending-${ts}@example.com`,
  source: "whatsapp",
  status: "new",
  consent_to_contact: true,
}).select().single();
if (leadErr) { console.error("lead err:", leadErr.message); process.exit(1); }
console.log(`[STEP 1] lead creado: ${lead.id}`);

console.log(`[STEP 2] Creando confirmation de prueba...`);
const { data: conf, error: confErr } = await supabase.from("event_confirmations").insert({
  event_id: eventId,
  name: "Notif Test",
  email,
  phone_raw: phone,
  phone_normalized: phone,
  source: "whatsapp_bot",
  payment_status: "pending",
}).select().single();
if (confErr) { console.error("conf err:", confErr.message); process.exit(1); }
console.log(`[STEP 2] confirmation creada: ${conf.id} (payment_status: ${conf.payment_status})`);

console.log(`[STEP 3] Llamando notifyLeadPaymentConfirmed con confirmationId=${conf.id}...`);
const { notifyLeadPaymentConfirmed } = await import("../src/lib/payments/notify-lead-payment-confirmed.ts");
await notifyLeadPaymentConfirmed({
  confirmationId: conf.id,
  eventId,
  amountTotalMXN: 1000,
  logSource: "diag-repro",
});

console.log(`[STEP 4] Verificando outbound WhatsApp...`);
await new Promise((r) => setTimeout(r, 3000)); // dar tiempo al async
const { data: waLog } = await supabase
  .from("lead_whatsapp_log")
  .select("id, new_status, message_preview, created_at")
  .eq("lead_id", lead.id)
  .order("created_at", { ascending: false })
  .limit(5);
console.log(`[STEP 4] outbound log entries:`, waLog);

console.log(`[STEP 5] Verificando event_email_log...`);
const { data: emailLog } = await supabase
  .from("event_email_log")
  .select("id, email_type, ok, sent_at")
  .eq("recipient", email)
  .order("sent_at", { ascending: false })
  .limit(5);
console.log(`[STEP 5] email log entries:`, emailLog);

console.log(`\n[STEP 6] Verificando si el QR se linkeó a la confirmation...`);
const { data: qr } = await supabase
  .from("event_qr_tokens")
  .select("token, confirmation_id, attendee_phone_normalized")
  .eq("attendee_phone_normalized", phone);
console.log(`[STEP 6] QR tokens:`, qr);

// Cleanup.
console.log(`\n[CLEANUP] Borrando datos de prueba...`);
await supabase.from("event_qr_tokens").delete().eq("attendee_phone_normalized", phone);
await supabase.from("event_confirmations").delete().eq("id", conf.id);
await supabase.from("event_email_log").delete().eq("recipient", email);
await supabase.from("leads").delete().eq("id", lead.id);
console.log("[CLEANUP] ok");
