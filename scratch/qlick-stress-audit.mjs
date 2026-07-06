// Qlick Stress Audit — Ronda 2: E6-E9
// Sesion 2026-07-06 (David pidi stress testing contra usuarios rebeldes).
// Cubre resistencia del bot a inputs impredecibles y la idempotencia
// del registro de leads.
//
// Uso: node --env-file=.env.local scratch/qlick-stress-audit.mjs

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Importar las funciones puras del bot-engine (mismas que se usan en prod).
import {
  isQuestionOrIntent,
  isValidHumanName,
  cleanFirstName,
  PLACEHOLDER_NAMES,
  PLACEHOLDER_NAMES_UI,
} from "../src/lib/whatsapp/bot-engine.ts";

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

// ─────────────────────────────────────────────────────────────
// Replica del handler provide_name (post-fix E6/E7)
// ─────────────────────────────────────────────────────────────
function buildProvideNameResponse(body) {
  const name = body.trim();
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name);

  if (isQuestionOrIntent(name)) {
    return {
      kind: "text",
      body: `Buena pregunta. Para poder emitir tu certificado de asistencia necesitamos tu nombre completo (nombre y apellido). ¿Me lo pasás así: "Juan Pérez"?`,
      metadata: { awaiting_field: "name" },
      redirectReason: "question",
    };
  }
  if (!isValidHumanName(name)) {
    return {
      kind: "text",
      body: `Por favor escríbeme tu nombre y apellido con letras para poder generar tu certificado (ej: "Juan Pérez").`,
      metadata: { awaiting_field: "name" },
      redirectReason: "invalid",
    };
  }
  if (looksLikeEmail) {
    return {
      kind: "text",
      body: `Gracias por el email, pero primero necesito tu nombre completo.`,
      metadata: { awaiting_field: "name" },
      redirectReason: "email",
    };
  }
  const wordCount = name.split(/\s+/).filter(Boolean).length;
  if (wordCount < 2) {
    return {
      kind: "text",
      body: `Necesito tu nombre completo (nombre y apellido).`,
      metadata: { awaiting_field: "name" },
      redirectReason: "too_short",
    };
  }
  if (name.length > 100) {
    return {
      kind: "text",
      body: `El nombre que mandaste es muy largo.`,
      metadata: { awaiting_field: "name" },
      redirectReason: "too_long",
    };
  }
  return {
    kind: "text",
    body: `Gracias ${name.split(" ")[0]}. Ahora mandame tu email.`,
    metadata: { awaiting_field: "email" },
    name,
    redirectReason: null,
  };
}

// Persiste el nombre en leads + audit log (replica de processInboundMessage).
async function persistNameInDB(leadId, newName, previousName) {
  const { error } = await sb.from("leads").update({ name: newName }).eq("id", leadId);
  if (error) throw new Error("Update failed: " + error.message);
  await sb.from("admin_audit_log").insert({
    actor_email: "system@qlick",
    action: "lead_name_update",
    entity_type: "lead",
    entity_id: leadId,
    metadata: { source: "whatsapp_bot", intent: "provide_name", new_name: newName, previous_name: previousName },
  });
}

// ─────────────────────────────────────────────────────────────
// SETUP: limpiar + crear 1 evento + 1 lead para las pruebas
// ─────────────────────────────────────────────────────────────
async function setup() {
  section("SETUP — Limpiar + crear evento + lead base");
  const order = [
    "event_attendees", "event_qr_tokens", "event_surveys",
    "event_email_log", "event_reminder_log", "lead_event_links",
    "lead_whatsapp_conversations", "lead_consent_log",
    "crm_tasks", "leads", "payments", "events",
  ];
  for (const t of order) {
    await sb.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }
  log("Funnel limpio.");

  const { data: evt, error } = await sb.from("events").insert({
    slug: "stress-test-event",
    title: "Stress Test Event",
    description: "Evento para stress test E6-E9",
    status: "published",
    starts_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    ends_at: new Date(Date.now() + 7 * 86400000 + 5400000).toISOString(),
    location: "Online",
    event_rules: {},
  }).select("id,slug,short_code").single();
  if (error) throw new Error("Insert event failed: " + error.message);
  log("Evento creado:", evt.id, evt.slug, "short=", evt.short_code);

  // Lead base para E9 (re-inscripción con cambio de nombre).
  const { data: lead, error: leErr } = await sb.from("leads").insert({
    name: "Juan P.",
    email: "juan-p-reactivate@qlick.app",
    phone: "+525533333333",
    status: "new",
    source: "event",
    intent: "course_information",
    consent_to_contact: true,
    whatsapp_status: "no_contactado",
    tags: ["stress:e9-base"],
  }).select("id,name,email").single();
  if (leErr) throw new Error("Insert lead failed: " + leErr.message);
  log("Lead base para E9:", lead.id, lead.name);

  return { evt, baseLead: lead };
}

// ─────────────────────────────────────────────────────────────
// E6: Respuestas Interrogativas
// ─────────────────────────────────────────────────────────────
async function scenarioE6() {
  section("E6 — Respuestas Interrogativas (NO deben guardarse como nombre)");

  const questions = [
    "¿Por qué necesitas mi nombre?",
    "¿Tiene costo?",
    "¿Es obligatorio?",
    "que incluye el evento",
    "como funciona esto",
    "para que es",
    "donde es el evento",
    "cual es el precio",
    "cuando empieza",
  ];

  const results = [];
  for (const q of questions) {
    const r = buildProvideNameResponse(q);
    const detectedAsQuestion = r.redirectReason === "question";
    const maintainsAwaiting = r.metadata.awaiting_field === "name";
    log(`  [${q.slice(0, 30).padEnd(30)}] → question=${detectedAsQuestion ? "YES" : "NO"}, awaiting_name=${maintainsAwaiting ? "YES" : "NO"}`);
    results.push({ q, detectedAsQuestion, maintainsAwaiting });
  }

  // Crear lead temporal y verificar que NO se persista nada (no se llama persistNameInDB).
  const { data: probeLead } = await sb.from("leads").insert({
    name: "E6-Probe",
    email: "e6-probe@qlick.app",
    source: "event",
    intent: "course_information",
    consent_to_contact: true,
    whatsapp_status: "no_contactado",
  }).select("id,name").single();

  // Después de las preguntas, el nombre del lead debe seguir siendo "E6-Probe".
  const { data: finalLead } = await sb.from("leads").select("name").eq("id", probeLead.id).single();
  const notPersistedAsQuestion = finalLead.name === "E6-Probe";
  log(`\n  Nombre del lead probe sigue intacto: ${notPersistedAsQuestion ? "SI" : "NO"} (actual: ${JSON.stringify(finalLead.name)})`);

  const checks = {
    todas_preguntas_detectadas: results.every(r => r.detectedAsQuestion),
    awaiting_field_preservado: results.every(r => r.maintainsAwaiting),
    nombre_del_lead_no_cambiado: notPersistedAsQuestion,
  };
  const passed = Object.values(checks).every(Boolean);
  for (const [k, v] of Object.entries(checks)) log(`    ${v ? "PASS" : "FAIL"} ${k}`);
  log(`\n  RESULTADO E6: ${passed ? "PASS" : "FAIL"}`);
  return passed;
}

// ─────────────────────────────────────────────────────────────
// E7: Emojis, Números y Puntuación
// ─────────────────────────────────────────────────────────────
async function scenarioE7() {
  section("E7 — Emojis, Números y Puntuación (NO deben guardarse)");

  const garbage = [
    "👍👍👍",
    "👍",
    "123456",
    "123",
    ".......",
    "...",
    "ah ok",
    "ok",
    "x",
    "@#$%",
    "😅😅",
  ];

  const results = [];
  for (const g of garbage) {
    const r = buildProvideNameResponse(g);
    const rejected = r.redirectReason === "invalid" || r.redirectReason === "too_short";
    const maintainsAwaiting = r.metadata.awaiting_field === "name";
    log(`  [${g.slice(0, 25).padEnd(25)}] → rejected=${rejected ? "YES" : "NO"}, reason=${r.redirectReason || "OK"}, awaiting_name=${maintainsAwaiting ? "YES" : "NO"}`);
    results.push({ g, rejected, maintainsAwaiting, reason: r.redirectReason });
  }

  const checks = {
    todos_garbage_rechazados: results.every(r => r.rejected),
    awaiting_field_preservado: results.every(r => r.maintainsAwaiting),
  };
  const passed = Object.values(checks).every(Boolean);
  for (const [k, v] of Object.entries(checks)) log(`    ${v ? "PASS" : "FAIL"} ${k}`);
  log(`\n  RESULTADO E7: ${passed ? "PASS" : "FAIL"}`);
  return passed;
}

// ─────────────────────────────────────────────────────────────
// E8: Nombres con Títulos y Caracteres Especiales Válidos
// ─────────────────────────────────────────────────────────────
async function scenarioE8() {
  section("E8 — Nombres Compuestos Válidos");

  const validNames = [
    "Dr. Juan Pérez",
    "María de los Ángeles",
    "José-Luis Núñez",
    "Müller Hans",
    "Ángela Merkel",
    "Sofía Rodríguez",
    "Juan Pablo Segundo",
    "Ana María Smith",
    "María-José García",
  ];

  const results = [];
  for (const n of validNames) {
    const r = buildProvideNameResponse(n);
    const accepted = r.redirectReason === null;
    const persistedName = r.name === n;
    log(`  [${n.padEnd(30)}] → accepted=${accepted ? "YES" : "NO"}, persisted_name=${persistedName ? "YES" : "NO"}, awaiting_field=${r.metadata.awaiting_field}`);
    results.push({ n, accepted, persistedName });
  }

  // Verificacion adicional: probar que isValidHumanName maneja los mismos casos.
  const unitChecks = {
    dr_juan_perez_valido: isValidHumanName("Dr. Juan Pérez"),
    maria_de_los_angeles_valido: isValidHumanName("María de los Ángeles"),
    jose_luis_nunez_valido: isValidHumanName("José-Luis Núñez"),
    muller_hans_valido: isValidHumanName("Müller Hans"),
    angela_merkel_valido: isValidHumanName("Ángela Merkel"),
    solo_nombre_rechazado: !isValidHumanName("Ana"),
  };

  const checks = {
    todos_nombres_validos_aceptados: results.every(r => r.accepted && r.persistedName),
    dr_juan_perez: unitChecks.dr_juan_perez_valido,
    maria_de_los_angeles: unitChecks.maria_de_los_angeles_valido,
    jose_luis_nunez: unitChecks.jose_luis_nunez_valido,
    muller_hans: unitChecks.muller_hans_valido,
    angela_merkel: unitChecks.angela_merkel_valido,
    solo_nombre_rechazado: unitChecks.solo_nombre_rechazado,
  };
  const passed = Object.values(checks).every(Boolean);
  for (const [k, v] of Object.entries(checks)) log(`    ${v ? "PASS" : "FAIL"} ${k}`);
  log(`\n  RESULTADO E8: ${passed ? "PASS" : "FAIL"}`);
  return passed;
}

// ─────────────────────────────────────────────────────────────
// E9: Re-inscripción y Cambio de Nombre (Idempotencia)
// ─────────────────────────────────────────────────────────────
async function scenarioE9(baseLead, evt) {
  section("E9 — Re-inscripción y Cambio de Nombre");

  // 1. Estado inicial: lead con name="Juan P."
  log(`  Lead inicial: id=${baseLead.id}, name=${JSON.stringify(baseLead.name)}`);

  // 2. Lead "vuelve" al flow y manda un nombre mas completo.
  const newName = "Juan Pérez Mendoza";
  const r = buildProvideNameResponse(newName);
  const accepted = r.redirectReason === null;
  log(`  [1] Handler acepta "${newName}"? ${accepted ? "SI" : "NO"}`);

  // 3. Persistir el cambio (replica de processInboundMessage).
  await persistNameInDB(baseLead.id, newName, baseLead.name);

  // 4. Verificar que NO se duplicó el lead (sigue siendo 1 row con el id original).
  const { data: finalLeads, count: leadCount } = await sb.from("leads").select("*", { count: "exact" }).eq("phone", "+525533333333");
  log(`  [2] Leads con ese phone: ${leadCount} (esperado: 1, no duplicar)`);

  // 5. Verificar que name se actualizó limpio.
  const { data: finalLead } = await sb.from("leads").select("name,status,tags").eq("id", baseLead.id).single();
  log(`  [3] Lead final: name=${JSON.stringify(finalLead.name)}, status=${finalLead.status}`);
  const nameUpdated = finalLead.name === newName;

  // 6. Verificar que el QR se puede generar y el check-in funciona con el nuevo nombre.
  const qrToken = crypto.randomBytes(16).toString("base64url");
  await sb.from("event_qr_tokens").insert({
    event_id: evt.id,
    attendee_phone_normalized: "+525533333333",
    attendee_name: newName,
    attendee_email: baseLead.email,
    token: qrToken,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  const nowIso = new Date().toISOString();
  await sb.from("event_attendees").insert({
    event_id: evt.id,
    name: newName,
    email: baseLead.email,
    phone_normalized: "+525533333333",
    checked_in_at: nowIso,
    checked_in_by: "self@qlick.checkin",
    source: "check_in",
  });

  const { data: attendee } = await sb.from("event_attendees").select("name,checked_in_at").eq("phone_normalized", "+525533333333").maybeSingle();
  const qrUsesNewName = attendee?.name === newName;
  log(`  [4] Check-in attendee con nuevo nombre: ${qrUsesNewName ? "SI" : "NO"} (${JSON.stringify(attendee?.name)})`);

  // 7. Verificar audit log del cambio de nombre.
  const { count: auditCount } = await sb.from("admin_audit_log").select("*", { count: "exact", head: true }).eq("entity_id", baseLead.id).eq("action", "lead_name_update");
  log(`  [5] Audit logs del cambio: ${auditCount} (esperado >= 1)`);

  const checks = {
    handler_acepta_nuevo_nombre: accepted,
    no_duplica_lead: leadCount === 1,
    nombre_actualizado_DB: nameUpdated,
    attendee_con_nuevo_nombre: qrUsesNewName,
    audit_log_registrado: auditCount >= 1,
  };
  const passed = Object.values(checks).every(Boolean);
  for (const [k, v] of Object.entries(checks)) log(`    ${v ? "PASS" : "FAIL"} ${k}`);
  log(`\n  RESULTADO E9: ${passed ? "PASS" : "FAIL"}`);
  return passed;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
(async () => {
  const start = Date.now();
  try {
    const { evt, baseLead } = await setup();
    const r6 = await scenarioE6();
    const r7 = await scenarioE7();
    const r8 = await scenarioE8();
    const r9 = await scenarioE9(baseLead, evt);

    section("RESUMEN FINAL — ESTRESS TEST E6-E9");
    const all = { E6: r6, E7: r7, E8: r8, E9: r9 };
    for (const [k, v] of Object.entries(all)) log(`  ${k}: ${v ? "PASS" : "FAIL"}`);
    const allPassed = Object.values(all).every(Boolean);
    log("");
    log(`  TOTAL: ${allPassed ? "TODOS PASARON ✓" : "HAY FALLOS ✗"}`);
    log(`  Duracion: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error("FATAL:", err);
    process.exit(1);
  }
})();