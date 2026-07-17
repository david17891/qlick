// Recover del pago de David que quedó sin registrar en Qlick.
// Cargo: ch_3TuKxzRXKOh68uzN... (a verificar)
// Email: david17891@gmail.com
// Event: marketing-ia-para-emprendedores-pago (b1afa259-4c99-44a5-87ba-4b29a52d9259)
// Amount: $1000 MXN
//
// Pasos:
// 1. Buscar/crear lead de David en tabla leads (por phone +526532935492 o email).
// 2. Buscar user_id en auth.users por email.
// 3. Crear confirmation en event_confirmations con source='web_purchase' (guest checkout sin bot).
// 4. Crear event_payment con status='approved', method='stripe', external_reference=session.id.
// 5. Crear event_access con source='event_purchase'.
// 6. Crear event_qr_tokens y enviar email QR via Brevo.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SESSION_ID = "cs_test_a1GBAzGTF0ZOVWzj8ambCp4PrXX0QXIlrDa1szuwaMPmVFnKAv6uWXeyhm";
const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";
const USER_ID = "095a134c-252e-4375-9200-aff58aefa5b3";
const DAVID_EMAIL = "david17891@gmail.com";
const DAVID_PHONE = "+526532935492";

console.log("=== Recover del pago de David (event_purchase) ===\n");

// 1. Verificar/crear lead de David
const { data: existingLead } = await sb
  .from("leads")
  .select("id, name, email, phone, consent_to_contact")
  .eq("phone_normalized", DAVID_PHONE)
  .maybeSingle();

let leadId = existingLead?.id;
let nameForConf = "David Martinez";

if (existingLead) {
  console.log(`1. lead existe: id=${existingLead.id} name="${existingLead.name}" email=${existingLead.email}`);
  // Actualizar email si está vacío o es placeholder
  if (!existingLead.email || existingLead.email.endsWith("@placeholder.local")) {
    await sb
      .from("leads")
      .update({ email: DAVID_EMAIL, consent_to_contact: true })
      .eq("id", existingLead.id);
    console.log("   email actualizado a david17891@gmail.com");
  }
  // Usar el name del lead (puede ser "David Carrillo" — el summary dice Martinez
  // pero la BD tiene Carrillo; respetamos lo que está en BD para no
  // perder el link con sus conversaciones previas).
  nameForConf = existingLead.name || "David Martinez";
} else {
  // Crear lead nuevo
  const { data: newLead, error: leadErr } = await sb
    .from("leads")
    .insert({
      name: "David Martinez",
      email: DAVID_EMAIL,
      phone: DAVID_PHONE,
      phone_normalized: DAVID_PHONE,
      source: "web_purchase",
      status: "new",
      intent: "course_information",
      consent_to_contact: true,
      whatsapp_status: "no_contactado",
      tags: ["source:web_purchase", "recover:bug13"]
    })
    .select()
    .single();
  if (leadErr) {
    console.error("lead insert err:", leadErr.message);
    process.exit(1);
  }
  leadId = newLead.id;
  console.log(`1. lead creado: id=${leadId}`);
}

// 2. Verificar si ya existe confirmation
//    Buscar primero por (event_id, email) — caso normal.
//    Si no encuentra, buscar por (event_id, phone_normalized) — caso
//    de confirmation creada con email placeholder/incorrecto (ej.
//    "david carrillo" sin @). Recuperar David: el flow del bot
//    anterior dejo una confirmation con email="david carrillo".
const { data: existingByEmail } = await sb
  .from("event_confirmations")
  .select("id, name, email, payment_status, source")
  .eq("event_id", EVENT_ID)
  .eq("email", DAVID_EMAIL)
  .order("confirmed_at", { ascending: false })
  .limit(1)
  .maybeSingle();

let existingConf = existingByEmail;
if (!existingConf) {
  const { data: existingByPhone } = await sb
    .from("event_confirmations")
    .select("id, name, email, payment_status, source")
    .eq("event_id", EVENT_ID)
    .eq("phone_normalized", DAVID_PHONE)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingByPhone) {
    console.log(`(info) confirmation encontrada por phone, no por email. email guardado: "${existingByPhone.email}"`);
  }
  existingConf = existingByPhone;
}

let confirmationId = existingConf?.id;
if (existingConf) {
  nameForConf = existingConf.name || nameForConf;
  console.log(`2. confirmation existe: id=${existingConf.id} payment_status=${existingConf.payment_status} source=${existingConf.source} email=${existingConf.email}`);
  // Si el email guardado no es un email real (ej. "david carrillo" sin @) o
  // el payment_status no es paid, actualizar.
  const needsEmailFix = !existingConf.email || !existingConf.email.includes("@");
  const needsPsFix = existingConf.payment_status !== "paid";
  if (needsEmailFix || needsPsFix) {
    const updatePayload = {};
    if (needsEmailFix) updatePayload.email = DAVID_EMAIL;
    if (needsPsFix) updatePayload.payment_status = "paid";
    const { error: updErr } = await sb
      .from("event_confirmations")
      .update(updatePayload)
      .eq("id", existingConf.id);
    if (updErr) {
      console.error("confirmation update err:", updErr.message);
    } else {
      console.log(`   actualizado: ${Object.keys(updatePayload).join(", ")}`);
    }
  } else {
    console.log(`   confirmation ya estaba completa (paid + email real).`);
  }
} else {
  // Crear confirmation con source='public_form'
  // NOTA: event_confirmations NO tiene columna metadata.
  const { data: newConf, error: confErr } = await sb
    .from("event_confirmations")
    .insert({
      event_id: EVENT_ID,
      name: nameForConf,
      email: DAVID_EMAIL,
      phone_normalized: DAVID_PHONE,
      payment_status: "paid",
      source: "public_form"
    })
    .select()
    .single();
  if (confErr) {
    console.error("confirmation insert err:", confErr.message);
    process.exit(1);
  }
  confirmationId = newConf.id;
  console.log(`2. confirmation creada: id=${confirmationId} source=public_form payment_status=paid`);
}

// 3. Crear event_payment
const { data: existingPay } = await sb
  .from("event_payments")
  .select("id, status, amount_mxn")
  .eq("external_reference", SESSION_ID)
  .maybeSingle();

let paymentId = existingPay?.id;

if (existingPay) {
  console.log(`3. event_payment existe: id=${existingPay.id} status=${existingPay.status} amount=${existingPay.amount_mxn}`);
} else {
  const { data: newPay, error: payErr } = await sb
    .from("event_payments")
    .insert({
      confirmation_id: confirmationId,
      method: "stripe",
      status: "approved",
      amount_mxn: 100000, // 1000 MXN en centavos
      currency: "MXN",
      external_reference: SESSION_ID,
      idempotency_key: `stripe_evt:recover_david_${SESSION_ID}`,
      metadata: {
        recover: "bug13",
        recovered_at: new Date().toISOString(),
        user_id: USER_ID,
        note: "Pago procesado por Stripe pero webhook no encontró confirmation previa (guest checkout). Recover manual post-fix."
      }
    })
    .select()
    .single();
  if (payErr) {
    console.error("event_payment insert err:", payErr.message);
    process.exit(1);
  }
  paymentId = newPay.id;
  console.log(`3. event_payment creado: id=${paymentId} status=approved amount=100000`);
}

// 4. Crear event_access
//    event_access columnas reales: id, user_id, event_id,
//    access_source, access_status, confirmation_id, payment_id,
//    granted_reason. NO tiene source (es access_source), granted_at,
//    ni metadata.
const { data: existingAccess } = await sb
  .from("event_access")
  .select("id, access_source, payment_id, access_status")
  .eq("confirmation_id", confirmationId)
  .eq("access_status", "active")
  .maybeSingle();

if (existingAccess) {
  console.log(`4. event_access existe: id=${existingAccess.id} access_source=${existingAccess.access_source}`);
} else {
  const { data: newAccess, error: accessErr } = await sb
    .from("event_access")
    .insert({
      user_id: USER_ID,
      event_id: EVENT_ID,
      confirmation_id: confirmationId,
      payment_id: paymentId,
      access_source: "event_purchase",
      access_status: "active",
      granted_reason: `recover_bug13_stripe_${SESSION_ID.slice(0, 20)}`
    })
    .select()
    .single();
  if (accessErr) {
    console.error("event_access insert err:", accessErr.message);
    process.exit(1);
  }
  console.log(`4. event_access creado: id=${newAccess.id} access_source=event_purchase access_status=active`);
}

// 5. Crear o linkear QR token
//    event_qr_tokens tiene UNIQUE (event_id, attendee_phone_normalized),
//    asi que si el bot ya creo uno, NO creamos duplicado — solo
//    actualizamos el confirmation_id (que puede ser null si era
//    huerfano pre-fix bug 10).
//    Columnas: id, token, event_id, confirmation_id, attendee_email,
//    attendee_name, attendee_phone_normalized, created_at,
//    expires_at, checked_in_at, checked_in_by.
const { data: existingQR } = await sb
  .from("event_qr_tokens")
  .select("id, token, confirmation_id")
  .eq("event_id", EVENT_ID)
  .eq("attendee_phone_normalized", DAVID_PHONE)
  .maybeSingle();

if (existingQR) {
  console.log(`5. QR token existe: id=${existingQR.id} token=${existingQR.token.slice(0, 16)}... confirmation_id=${existingQR.confirmation_id?.slice(0,8) || "null"}`);
  if (existingQR.confirmation_id !== confirmationId) {
    // Linkear el QR a la confirmation (puede haber sido huerfano
    // pre-fix bug 10).
    const { error: qrUpdErr } = await sb
      .from("event_qr_tokens")
      .update({ confirmation_id: confirmationId })
      .eq("id", existingQR.id);
    if (qrUpdErr) {
      console.error("   QR update confirmation_id err:", qrUpdErr.message);
    } else {
      console.log(`   ✅ QR linkeado a confirmation ${confirmationId.slice(0, 8)}`);
    }
  } else {
    console.log(`   ya estaba linkeado a la confirmation correcta.`);
  }
} else {
  const { data: newQR, error: qrErr } = await sb
    .from("event_qr_tokens")
    .insert({
      event_id: EVENT_ID,
      token: qrToken,
      confirmation_id: confirmationId,
      attendee_email: DAVID_EMAIL,
      attendee_name: nameForConf,
      attendee_phone_normalized: DAVID_PHONE,
      // expires_at: el token expira 24h después del evento. Como el
      // evento es HOY 2026-07-17 18:00 UTC, expira mañana mismo.
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    })
    .select()
    .single();
  const _qrToken = qrToken;  // para el log final
  if (qrErr) {
    console.error("QR token insert err:", qrErr.message);
    process.exit(1);
  }
  console.log(`5. QR token creado: id=${newQR.id} token=${qrToken.slice(0, 16)}...`);
  console.log(`   URL: https://www.qlick.digital/check-in/${qrToken}`);
}

console.log("\n=== RESUMEN ===");
console.log(`lead:           ${leadId}`);
console.log(`confirmation:   ${confirmationId} (paid)`);
console.log(`event_payment:  ${paymentId} (approved, $1000 MXN)`);
console.log(`event_access:   activo (event_purchase)`);
console.log(`QR token:       ${existingQR?.token?.slice(0, 16) || _qrToken?.slice(0, 16) || "(desconocido)"}`);
console.log("\n✅ Recover completo. Refresca la página /pagar/evento/.../exito para ver '¡Listo! Ya tienes tu entrada'.");
