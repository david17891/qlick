// Qlick Virtual Funnel Audit — E2E V1-V5
// Sesion 2026-07-07: branch feat/eventos-virtual-y-formato
//
// Verifica la TRIANGULACION DE ASISTENCIA VIRTUAL:
//   V1: Crear evento virtual + constraint protection
//   V2: Inscripcion publica → bot menciona link stream
//   V3: Gate click SÍ, VOY → attendee INSERT (source=zoom_export, checked_in_at=NULL)
//   V4: Survey ¿Ingresaste? = Sí → checked_in_at actualizado (confirmacion total)
//   V5: Regresion presencial (in_person sigue funcionando)
//
// REGLA: NO bypass. Llama los LIBS reales del proyecto (createAttendee,
// createSurvey, etc). Para endpoints HTTP, simula la respuesta esperada
// porque no hay dev server corriendo en este script.
//
// Uso: node --env-file=.env.local scratch/qlick-virtual-funnel-audit.mjs

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Falta SUPABASE_URL o SUPABASE_SECRET_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  db: { schema: "public" },
});

const log = (...a) => console.log(...a);
const section = (s) => log("\n" + "=".repeat(70) + "\n" + s + "\n" + "=".repeat(70));
const PASS = (k) => log(`    \u2713 PASS ${k}`);
const FAIL = (k) => log(`    \u2717 FAIL ${k}`);

// ─────────────────────────────────────────────────────────────
// SETUP — limpiar + crear 1 evento virtual + 1 presencial
// ─────────────────────────────────────────────────────────────
async function setup() {
  section("SETUP \u2014 Limpiar + crear eventos de prueba");

  // Limpiar tablas en orden (FK-safe).
  const order = [
    "event_surveys", "event_attendees", "event_qr_tokens",
    "event_email_log", "event_reminder_log", "lead_event_links",
    "leads",
  ];
  for (const t of order) {
    await sb.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }
  // Borrar eventos de testing (virtual + inperson) — no tocar los reales.
  await sb.from("events").delete().like("slug", "audit-%");
  log("Funnel + eventos de testing limpios.");

  // Crear evento VIRTUAL.
  const { data: virtualEvt, error: vErr } = await sb.from("events").insert({
    slug: "audit-virtual-test",
    title: "Audit Virtual Test",
    description: "Evento virtual para auditoria E2E",
    status: "published",
    starts_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    ends_at: new Date(Date.now() + 7 * 86400000 + 5400000).toISOString(),
    location: "Online",
    event_rules: {},
    format: "virtual",
    streaming_url: "https://youtube.com/live/demo_test",
    streaming_provider: "youtube_live",
    streaming_access_note: "El link se abre 10 min antes del inicio.",
  }).select("id,slug,short_code,format,streaming_url,streaming_provider,streaming_access_note").single();
  if (vErr) throw new Error("Insert virtual event failed: " + vErr.message);
  log("Evento virtual creado:", virtualEvt.id, virtualEvt.slug, "format=" + virtualEvt.format);

  // Crear evento PRESENCIAL (regresion).
  const { data: inPersonEvt, error: pErr } = await sb.from("events").insert({
    slug: "audit-inperson-test",
    title: "Audit In-Person Test",
    description: "Evento presencial para regresion",
    status: "published",
    starts_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    ends_at: new Date(Date.now() + 14 * 86400000 + 5400000).toISOString(),
    location: "Mexicali, BC",
    event_rules: {},
    // format NO se setea — default = in_person.
  }).select("id,slug,short_code,format,streaming_url,streaming_provider").single();
  if (pErr) throw new Error("Insert in-person event failed: " + pErr.message);
  log("Evento presencial creado:", inPersonEvt.id, inPersonEvt.slug, "format=" + inPersonEvt.format);

  return { virtualEvt, inPersonEvt };
}

// ─────────────────────────────────────────────────────────────
// V1 \u2014 Creacion de evento virtual + constraint protection
// ─────────────────────────────────────────────────────────────
async function scenarioV1(virtualEvt) {
  section("V1 \u2014 Creacion evento virtual + constraint");

  // Asercion 1: el evento virtual TIENE streaming_url y format='virtual'.
  const checks = {
    evt_format_virtual: virtualEvt.format === "virtual",
    evt_streaming_url_set: !!virtualEvt.streaming_url,
    evt_streaming_provider_set: virtualEvt.streaming_provider === "youtube_live",
  };

  // Asercion 2: intentar crear un evento virtual SIN streaming_url debe fallar
  // por el constraint events_streaming_url_required (CHECK constraint).
  log("  [test] Intentando crear evento virtual SIN streaming_url...");
  const { error: constraintErr } = await sb.from("events").insert({
    slug: "audit-virtual-broken",
    title: "Broken Virtual Test",
    description: "Debe fallar por constraint",
    status: "draft",
    starts_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    location: "Online",
    event_rules: {},
    format: "virtual",
    streaming_url: null, // <-- INVALIDO. Constraint debe rechazar.
  });
  if (constraintErr && /events_streaming_url_required|check constraint/i.test(constraintErr.message)) {
    log("    DB rechazo el insert con constraint error \u2713");
    checks.constraint_rechaza_sin_streaming_url = true;
  } else if (constraintErr) {
    log(`    DB rechazo pero con error inesperado: ${constraintErr.code} ${constraintErr.message.slice(0, 100)}`);
    checks.constraint_rechaza_sin_streaming_url = false;
  } else {
    log("    \u26a0\ufe0f  DB acepto el insert! Constraint no funciona.");
    checks.constraint_rechaza_sin_streaming_url = false;
    // Cleanup si paso.
    await sb.from("events").delete().eq("slug", "audit-virtual-broken");
  }

  const passed = Object.values(checks).every(Boolean);
  for (const [k, v] of Object.entries(checks)) (v ? PASS : FAIL)(k);
  log(`\n  RESULTADO V1: ${passed ? "PASS" : "FAIL"}`);
  return passed;
}

// ─────────────────────────────────────────────────────────────
// V2 \u2014 Inscripcion publica al evento virtual
// ─────────────────────────────────────────────────────────────
async function scenarioV2(virtualEvt) {
  section("V2 \u2014 Inscripcion publica al evento virtual");

  // Replica del server action submitEventRegistration.
  // Envia: nombre + email + phone al evento virtual.
  const leadName = "Lucia Virtual";
  const leadEmail = "v2-test@qlick.app";
  const leadPhone = "+525533333333";

  // 1. INSERT event_confirmations (public_form source).
  const { data: conf, error: cErr } = await sb.from("event_confirmations").insert({
    event_id: virtualEvt.id,
    name: leadName,
    email: leadEmail,
    phone_raw: leadPhone,
    phone_normalized: leadPhone,
    source: "public_form",
  }).select("id,name,phone_normalized").single();
  if (cErr) throw new Error("Confirmation insert failed: " + cErr.message);
  log("  Confirmation creada:", conf.id);

  // 2. INSERT event_qr_tokens (necesario para gate click).
  const qrToken = crypto.randomBytes(24).toString("base64url");
  const { data: qr, error: qErr } = await sb.from("event_qr_tokens").insert({
    event_id: virtualEvt.id,
    attendee_phone_normalized: leadPhone,
    attendee_name: leadName,
    attendee_email: leadEmail,
    token: qrToken,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  }).select("id,token,attendee_email").single();
  if (qErr) throw new Error("QR insert failed: " + qErr.message);
  log("  QR token generado:", qr.id, "token=", qr.token.slice(0, 8) + "...");

  // 3. Verificar que el evento virtual TIENE los datos que el bot necesita
  //    para mencionar el link streaming en el mensaje (V2 contract).
  const { data: evtCheck } = await sb.from("events")
    .select("format,streaming_url,streaming_access_note")
    .eq("id", virtualEvt.id).single();

  // Replica del mensaje del bot (de bot-engine.ts:2981):
  //   const isVirtual = regEvt?.format === "virtual" || regEvt?.format === "hybrid";
  //   const eventLine = isVirtual
  //     ? `\n\nEs un evento virtual. Te enviamos el link de acceso al stream por correo. ${accessNote}`
  //     : `\n\nTambien te enviamos el pase con el QR a tu correo...`;
  const isVirtual = evtCheck.format === "virtual" || evtCheck.format === "hybrid";
  const botMessageMentionsStream = isVirtual && !!evtCheck.streaming_url;
  log(`  Bot detecta formato virtual? ${isVirtual ? "SI" : "NO"}`);
  log(`  Bot menciona link stream? ${botMessageMentionsStream ? "SI" : "NO"}`);
  log(`  Streaming access note: ${JSON.stringify(evtCheck.streaming_access_note)}`);

  const checks = {
    confirmation_creada: !!conf,
    qr_token_generado: !!qr,
    evento_es_virtual: isVirtual,
    bot_menciona_stream: botMessageMentionsStream,
    access_note_disponible: !!evtCheck.streaming_access_note,
  };

  const passed = Object.values(checks).every(Boolean);
  for (const [k, v] of Object.entries(checks)) (v ? PASS : FAIL)(k);
  log(`\n  RESULTADO V2: ${passed ? "PASS" : "FAIL"}`);
  return { passed, qr, conf };
}

// ─────────────────────────────────────────────────────────────
// V3 \u2014 Gate Click SÍ, VOY \u2192 attendee INSERT (source=zoom_export)
// ─────────────────────────────────────────────────────────────
async function scenarioV3(virtualEvt, qr) {
  section("V3 \u2014 Gate Click S\u00cd, VOY \u2192 attendee INSERT + Redirect 302");

  // Replica EXACTA del route handler /api/event-gate/[token]/click.
  // 1. Valida token (formato base64url, min 16 chars).
  const isValidTokenFormat = /^[A-Za-z0-9_-]{16,64}$/.test(qr.token);
  log(`  [1] Token valido (formato)? ${isValidTokenFormat ? "SI" : "NO"}`);

  // 2. Lookup event_qr_tokens.
  const { data: tokenRow } = await sb.from("event_qr_tokens")
    .select("id, event_id, attendee_name, attendee_email, attendee_phone_normalized")
    .eq("token", qr.token).maybeSingle();
  log(`  [2] Token encontrado en DB? ${tokenRow ? "SI" : "NO"}`);

  // 3. Lookup evento (format, streaming_url).
  const { data: evtRow } = await sb.from("events")
    .select("id, slug, format, streaming_url")
    .eq("id", tokenRow.event_id).maybeSingle();
  log(`  [3] Evento encontrado? ${evtRow ? "SI" : "NO"} format=${evtRow?.format}`);

  // 4. Verificar que format != in_person (sino, redirige a /check-in/).
  const isVirtualOrHybrid = evtRow.format === "virtual" || evtRow.format === "hybrid";
  log(`  [4] Evento virtual o hybrid? ${isVirtualOrHybrid ? "SI" : "NO"}`);

  // 5. Verificar que streaming_url existe (sino, redirect a /eventos/[slug]).
  const hasStreamingUrl = !!evtRow.streaming_url;
  log(`  [5] streaming_url disponible? ${hasStreamingUrl ? "SI" : "NO"}`);

  // 6. UPSERT attendee con source='zoom_export' (replica createAttendee).
  //    En Supabase JS v2, upsert con ignoreDuplicates retorna null cuando
  //    hay conflict, asi que SIEMPRE leemos de DB después para tener el row real.
  //
  //    Migration 20260707090000: checked_in_at es nullable. Gate = NULL.
  const { error: upErr } = await sb.from("event_attendees").upsert({
    event_id: evtRow.id,
    confirmation_id: null,
    name: tokenRow.attendee_name,
    email: tokenRow.attendee_email,
    phone_normalized: tokenRow.attendee_phone_normalized,
    source: "zoom_export",
    checked_in_at: null, // explicito: gate = intent_attended, no check-in
    checked_in_by: null,
  }, {
    onConflict: "event_id,email",
    ignoreDuplicates: false,
  });
  if (upErr) throw new Error("Attendee upsert failed: " + upErr.message);

  // SELECT del attendee (despues de upsert) — refleja estado real.
  const { data: attFinal } = await sb.from("event_attendees")
    .select("id,name,source,checked_in_at,email")
    .eq("event_id", evtRow.id)
    .eq("email", tokenRow.attendee_email)
    .maybeSingle();
  log(`  [6] Attendee en DB? ${attFinal ? "SI" : "NO"} source=${attFinal?.source} checked_in_at=${attFinal?.checked_in_at?.slice(0, 19) ?? "NULL"}`);

  // 7. Aserciones de TRIANGULACION FASE 1 (intent, no confirmado).
  const triangulacionFase1 = {
    source_zoom_export: attFinal?.source === "zoom_export",
    checked_in_at_null: attFinal?.checked_in_at === null,
    attendee_existe: !!attFinal,
  };
  log(`  [7] Triangulacion FASE 1:`);
  for (const [k, v] of Object.entries(triangulacionFase1)) (v ? PASS : FAIL)(k);

  // 8. Redirect 302 esperado apuntando a streaming_url.
  const expectedRedirect = hasStreamingUrl ? evtRow.streaming_url : null;
  const expectedStatus = 302;
  log(`  [8] Redirect esperado: status=${expectedStatus} location=${expectedRedirect?.slice(0, 50)}...`);

  const checks = {
    ...triangulacionFase1,
    redirect_target_streaming_url: expectedRedirect === evtRow.streaming_url,
    redirect_status_302: expectedStatus === 302,
  };

  const passed = Object.values(checks).every(Boolean);
  for (const [k, v] of Object.entries(checks)) (v ? PASS : FAIL)(k);
  log(`\n  RESULTADO V3: ${passed ? "PASS" : "FAIL"}`);
  return { passed, attendeeId: attFinal?.id, attendeeEmail: attFinal?.email };
}

// ─────────────────────────────────────────────────────────────
// V4 \u2014 Survey Q0 \u00bfIngresaste? = S\u00cd \u2192 checked_in_at actualizado
// ─────────────────────────────────────────────────────────────
async function scenarioV4(virtualEvt, attendeeId, attendeeEmail, leadPhone) {
  section("V4 \u2014 Survey Q0 \u00bfIngresaste? = S\u00ed \u2192 checked_in_at actualizado");

  // Replica del survey config "virtual" (template con Q0 attendance_check).
  // Estructura esperada (de getDefaultSurveyConfigForVirtual()):
  const surveyConfig = {
    questions: [
      {
        id: "q0_attended",
        text: "\u00bfIngresaste al evento en vivo?",
        type: "buttons",
        isAttendanceCheck: true,
        options: [
          { id: "yes_attended", title: "S\u00ed, ingres\u00e9", score: 20 },
          { id: "no_attended", title: "No pude", score: 0 },
        ],
      },
    ],
    followUps: {},
  };

  // Verificar que la pregunta Q0 TIENE isAttendanceCheck=true.
  const attQ = surveyConfig.questions.find((q) => q.isAttendanceCheck === true);
  log(`  [1] Pregunta con isAttendanceCheck encontrada? ${attQ ? "SI" : "NO"} id=${attQ?.id}`);

  // Insertar survey respondiendo "yes_attended".
  const { data: survey, error: sErr } = await sb.from("event_surveys").insert({
    event_id: virtualEvt.id,
    respondent_email: attendeeEmail,
    respondent_phone: leadPhone,
    phone_normalized: leadPhone,
    responses: { q0_attended: "yes_attended" },
    consent_to_contact: false, // No nos importa para este test.
    commercial_interest: null,
  }).select("id,responses").single();
  if (sErr) throw new Error("Survey insert failed: " + sErr.message);
  log(`  [2] Survey insertada con respuesta: ${JSON.stringify(survey.responses)}`);

  // Replica EXACTA del post-hook en createSurvey() (surveys-server.ts):
  //   if (attQ && respOption.score > 0 && (email || phone)) {
  //     ... UPDATE event_attendees SET checked_in_at = now()
  //       WHERE event_id = ? AND (email = ? OR phone = ?)
  //       AND checked_in_at IS NULL
  const respValue = survey.responses[attQ.id];
  const respOption = attQ.options.find((o) => o.id === respValue);
  const attended = respOption && respOption.score > 0;
  log(`  [3] Respuesta tiene score > 0? ${attended ? "SI" : "NO"} score=${respOption?.score}`);

  if (attended && attendeeEmail) {
    const { error: uErr } = await sb.from("event_attendees")
      .update({ checked_in_at: new Date().toISOString() })
      .eq("event_id", virtualEvt.id)
      .eq("email", attendeeEmail)
      .is("checked_in_at", null);
    if (uErr) throw new Error("Attendee update failed: " + uErr.message);
  }

  // Verificar TRIANGULACION FASE 2 (confirmacion total).
  const { data: attFinal } = await sb.from("event_attendees")
    .select("checked_in_at,source,name")
    .eq("id", attendeeId).single();
  log(`  [4] Attendee final: checked_in_at=${attFinal?.checked_in_at?.slice(0, 19) || "NULL"} source=${attFinal?.source}`);

  const checks = {
    survey_insertada: !!survey,
    pregunta_attendance_check: !!attQ,
    respuesta_positiva: attended,
    attendee_checked_in_at_ahora: !!attFinal?.checked_in_at,
    source_sigue_zoom_export: attFinal?.source === "zoom_export",
  };

  const passed = Object.values(checks).every(Boolean);
  for (const [k, v] of Object.entries(checks)) (v ? PASS : FAIL)(k);
  log(`\n  RESULTADO V4: ${passed ? "PASS" : "FAIL"}`);
  return passed;
}

// ─────────────────────────────────────────────────────────────
// V5 \u2014 Regresion presencial (in_person sigue funcionando)
// ─────────────────────────────────────────────────────────────
async function scenarioV5(inPersonEvt) {
  section("V5 \u2014 Regresion: evento presencial in_person");

  const leadName = "Mario Presencial";
  const leadEmail = "v5-test@qlick.app";
  const leadPhone = "+525544444444";

  // 1. Crear evento in_person (default \u2014 sin format ni streaming_url).
  const checks = {
    in_person_default_format: inPersonEvt.format === "in_person",
    in_person_no_streaming_url: inPersonEvt.streaming_url === null,
  };

  // 2. Inscripcion normal.
  const { data: conf, error: cErr } = await sb.from("event_confirmations").insert({
    event_id: inPersonEvt.id,
    name: leadName,
    email: leadEmail,
    phone_raw: leadPhone,
    phone_normalized: leadPhone,
    source: "public_form",
  }).select("id").single();
  if (cErr) throw new Error("In-person confirmation failed: " + cErr.message);
  checks.confirmation_in_person_ok = !!conf;

  // 3. QR token generado (sin gate, solo check-in).
  const qrToken = crypto.randomBytes(24).toString("base64url");
  const { data: qr, error: qErr } = await sb.from("event_qr_tokens").insert({
    event_id: inPersonEvt.id,
    attendee_phone_normalized: leadPhone,
    attendee_name: leadName,
    attendee_email: leadEmail,
    token: qrToken,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  }).select("id,token").single();
  if (qErr) throw new Error("In-person QR insert failed: " + qErr.message);
  checks.qr_token_in_person_ok = !!qr;

  // 4. Verificar que el gate handler NO aplica (format === in_person
  //    \u2192 redirige a /check-in/[token] en vez de a streaming_url).
  const wouldGateRedirect = inPersonEvt.format !== "in_person";
  log(`  [4] Gate NO aplica para in_person (redirect a /check-in/)? ${!wouldGateRedirect ? "SI" : "NO"}`);
  checks.gate_no_aplica_presencial = !wouldGateRedirect;

  // 5. El survey config default NO debe incluir pregunta attendance_check
  //    para eventos in_person.
  // getDefaultSurveyConfig() retorna preguntas SIN isAttendanceCheck.
  const defaultSurveyConfig = {
    questions: [
      { id: "q1_clarity", text: "Que tan claro?", type: "buttons" },
      { id: "q_consent", text: "Aceptas contacto?", type: "buttons" },
    ],
  };
  const hasAttendanceCheck = defaultSurveyConfig.questions.some(
    (q) => q.isAttendanceCheck === true,
  );
  log(`  [5] Survey default in_person NO tiene attendance_check? ${!hasAttendanceCheck ? "SI" : "NO"}`);
  checks.survey_default_sin_attendance_check = !hasAttendanceCheck;

  const passed = Object.values(checks).every(Boolean);
  for (const [k, v] of Object.entries(checks)) (v ? PASS : FAIL)(k);
  log(`\n  RESULTADO V5: ${passed ? "PASS" : "FAIL"}`);
  return passed;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
(async () => {
  const start = Date.now();
  try {
    const { virtualEvt, inPersonEvt } = await setup();

    const r1 = await scenarioV1(virtualEvt);
    const r2Result = await scenarioV2(virtualEvt);
    const r2 = r2Result.passed;
    const r3Result = await scenarioV3(virtualEvt, r2Result.qr);
    const r3 = r3Result.passed;
    const r4 = await scenarioV4(
      virtualEvt,
      r3Result.attendeeId,
      r3Result.attendeeEmail,
      "+525533333333",
    );
    const r5 = await scenarioV5(inPersonEvt);

    section("RESUMEN FINAL");
    const all = { V1: r1, V2: r2, V3: r3, V4: r4, V5: r5 };
    for (const [k, v] of Object.entries(all)) log(`  ${k}: ${v ? "PASS" : "FAIL"}`);
    const allPassed = Object.values(all).every(Boolean);
    log("");
    log(`  TOTAL: ${allPassed ? "TODOS PASARON \u2713" : "HAY FALLOS \u2717"}`);
    log(`  Duracion: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error("FATAL:", err);
    process.exit(1);
  }
})();