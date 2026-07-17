// Cleanup del test 2 (cleanup 807d3ac3, +526531742365).
// Borra todo el state + refund del cargo 4242.
// NO toca el test 1 (David real +526532935492, pago en puerta).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

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
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const CLEANUP_PHONE = "+526531742365";
const CLEANUP_LEAD_NAME = "Test cleanup 807d3ac3";

console.log("[CLEANUP-T2] Buscando leads del test 2...");
const { data: leads } = await sb
  .from("leads")
  .select("id, name, phone_normalized")
  .or(`phone_normalized.eq.${CLEANUP_PHONE},name.eq.${CLEANUP_LEAD_NAME}`);
if (!leads || leads.length === 0) {
  console.log("  No se encontraron leads del test 2. Probablemente ya limpios.");
  process.exit(0);
}
console.log(`  Encontrados ${leads.length} leads:`);
for (const l of leads) console.log("    -", l.id, l.phone_normalized, l.name);

const leadIds = leads.map((l) => l.id);

// 1. Buscar auth.user asociado al email del lead (si existe)
console.log("\n[CLEANUP-T2] Buscando auth.user...");
const { data: authList } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const testUsers = (authList?.users ?? []).filter((u) => {
  const leadEmails = leads.map((l) => l.email?.toLowerCase()).filter(Boolean);
  return leadEmails.includes(u.email?.toLowerCase());
});
console.log(`  ${testUsers.length} auth.users encontrados`);
for (const u of testUsers) console.log("    -", u.id, u.email);

// 2. Buscar confirmations
console.log("\n[CLEANUP-T2] Buscando event_confirmations...");
const { data: confs } = await sb
  .from("event_confirmations")
  .select("id, phone_normalized, name")
  .or(`phone_normalized.eq.${CLEANUP_PHONE},name.eq.${CLEANUP_LEAD_NAME}`);
const confIds = (confs ?? []).map((c) => c.id);
console.log(`  ${confIds.length} confirmations:`, confIds);

// 3. Refund del cargo 4242 del test 2
console.log("\n[CLEANUP-T2] Refund del cargo 4242 (test 2)...");
if (confs && confs.length > 0) {
  for (const c of confs) {
    // Buscar el payment_intent
    const { data: payment } = await sb
      .from("event_payments")
      .select("id, external_reference, idempotency_key, status")
      .eq("confirmation_id", c.id)
      .eq("method", "stripe")
      .maybeSingle();
    if (payment?.idempotency_key) {
      // El idempotency_key es `stripe_evt:evt_xxx`. El charge_id puede estar en metadata.
      // Mejor: buscar el cargo via Stripe API por metadata.
      try {
        const charges = await stripe.charges.search({
          query: `metadata:'confirmation_id':'${c.id}'`,
          limit: 1,
        });
        if (charges.data.length > 0) {
          const charge = charges.data[0];
          console.log(`  charge encontrado: ${charge.id}, amount=${charge.amount}, status=${charge.status}`);
          if (charge.status === "succeeded" && !charge.refunded) {
            const refund = await stripe.refunds.create({ charge: charge.id });
            console.log(`  refund OK: ${refund.id}, status=${refund.status}`);
          } else {
            console.log(`  charge no se puede refundar (status=${charge.status}, refunded=${charge.refunded})`);
          }
        } else {
          console.log(`  no se encontro cargo para confirmation_id=${c.id}`);
        }
      } catch (err) {
        console.log(`  error buscando cargo: ${err.message}`);
      }
    }
  }
}

// 4. Borrar event_payments
console.log("\n[CLEANUP-T2] Borrando event_payments...");
for (const cid of confIds) {
  const { data: eps } = await sb.from("event_payments").select("id").eq("confirmation_id", cid);
  if (eps && eps.length > 0) {
    await sb.from("event_payments").delete().in("id", eps.map((e) => e.id));
    console.log(`  borrados ${eps.length} event_payments de confirmation ${cid.slice(0, 8)}`);
  }
}

// 5. Borrar event_access
console.log("\n[CLEANUP-T2] Borrando event_access...");
for (const cid of confIds) {
  const { data: eas } = await sb.from("event_access").select("id").eq("confirmation_id", cid);
  if (eas && eas.length > 0) {
    await sb.from("event_access").delete().in("id", eas.map((e) => e.id));
    console.log(`  borrados ${eas.length} event_access de confirmation ${cid.slice(0, 8)}`);
  }
}

// 6. Borrar event_qr_tokens
console.log("\n[CLEANUP-T2] Borrando event_qr_tokens...");
for (const cid of confIds) {
  const { data: eqs } = await sb.from("event_qr_tokens").select("id, attendee_phone_normalized").eq("attendee_phone_normalized", CLEANUP_PHONE);
  if (eqs && eqs.length > 0) {
    await sb.from("event_qr_tokens").delete().in("id", eqs.map((e) => e.id));
    console.log(`  borrados ${eqs.length} event_qr_tokens`);
  }
}

// 7. Borrar event_confirmations
console.log("\n[CLEANUP-T2] Borrando event_confirmations...");
if (confIds.length > 0) {
  await sb.from("event_confirmations").delete().in("id", confIds);
  console.log(`  borradas ${confIds.length} confirmations`);
}

// 8. Borrar WhatsApp conversations
console.log("\n[CLEANUP-T2] Borrando lead_whatsapp_conversations...");
const { data: wcs } = await sb
  .from("lead_whatsapp_conversations")
  .select("id")
  .or(`phone_normalized.eq.${CLEANUP_PHONE},lead_id.in.(${leadIds.join(",")})`);
if (wcs && wcs.length > 0) {
  await sb.from("lead_whatsapp_conversations").delete().in("id", wcs.map((w) => w.id));
  console.log(`  borrados ${wcs.length} wa conversations`);
}

// 9. Borrar leads
console.log("\n[CLEANUP-T2] Borrando leads...");
await sb.from("leads").delete().in("id", leadIds);
console.log(`  borrados ${leadIds.length} leads`);

// 10. Borrar auth.users
console.log("\n[CLEANUP-T2] Borrando auth.users...");
for (const u of testUsers) {
  try {
    await sb.auth.admin.deleteUser(u.id);
    console.log(`  borrado auth.user ${u.id} (${u.email})`);
  } catch (err) {
    console.log(`  error borrando auth.user ${u.id}: ${err.message}`);
  }
}

console.log("\n[CLEANUP-T2] ✓ DONE. Test 2 limpiado completamente.");
console.log("NOTA: Test 1 (David real +526532935492, pago en puerta) NO se toco.");
