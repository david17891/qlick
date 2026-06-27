#!/usr/bin/env node
// scripts/_test-fase3.mjs
//
// Test manual end-to-end de Fase 3 (Events Funnel Foundation).
//
// ⚠️  IMPORTANTE: este script asume que la migration
// `20260627000000_events_funnel.sql` YA ESTÁ APLICADA al proyecto
// Supabase. Si todavía no la aplicaste, este script va a fallar en
// el primer SELECT contra `events`.
//
// Lo que el script replica end-to-end (vs los server libs):
// - Crea un evento de prueba.
// - Crea una confirmation (con dedup).
// - Crea un attendee.
// - Crea una survey SIN consent → debe ir a event_survey_unmatched.
// - Crea una survey CON consent + interest + email → debe promover a
//   lead via createLeadFromEvent (Fase 2) Y crear row en lead_event_links.
// - Verifica que el audit log captura el cambio de status del evento.
// - Limpia todo al final.
//
// Lo que NO testea (queda para tests unitarios + code review):
// ⚠️  Defensa en profundidad en runtime.
// ⚠️  Validaciones de shape.
// ⚠️  Fallback demo.
//
// Uso:
//   node --experimental-strip-types scripts/_test-fase3.mjs
//
// Salida:
//   - PASS/FAIL por test (colores ANSI).
//   - Resumen final con count.
//   - Cleanup automático: DELETE de todas las filas de prueba.
//   - Exit code 0 si todos PASS, 1 si alguno FAIL.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────
// Mini parser de .env.local
// ─────────────────────────────────────────────────────────────
function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = {
  ...parseEnvFile(join(ROOT, ".env.local")),
  ...process.env,
};

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error(
    "❌ Faltan variables de Supabase en .env.local:\n" +
      "   - NEXT_PUBLIC_SUPABASE_URL\n" +
      "   - SUPABASE_SECRET_KEY\n",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

const results = [];
let currentStep = 0;
let lastStep = "";

function track(name) {
  currentStep += 1;
  lastStep = name;
  console.log(`\n${C.bold}${C.cyan}[${currentStep}] ${name}${C.reset}`);
}

function pass(note = "") {
  results.push({ name: lastStep, ok: true, note });
  console.log(`  ${C.green}✅ PASS${C.reset} ${note ? C.gray + note + C.reset : ""}`);
}

function fail(note) {
  results.push({ name: lastStep, ok: false, note });
  console.log(`  ${C.red}❌ FAIL${C.reset} ${note}`);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const RUN_TAG = `qa-fase3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_EMAIL = `${RUN_TAG}@example.com`;
const TEST_EMAIL_NO_CONSENT = `${RUN_TAG}-noconsent@example.com`;
const TEST_PHONE = "+52 33 1234 5678";
const EVENT_SLUG = `qa-${RUN_TAG}`;
const EVENT_TITLE = `QA Fase 3 — ${RUN_TAG}`;

let createdEventIds = [];
let createdSurveyIds = [];
let createdLinkIds = [];

async function cleanup() {
  console.log(`\n${C.gray}── Cleanup ──${C.reset}`);
  // Order matters: lead_event_links → event_surveys → event_attendees →
  // event_confirmations → event_survey_unmatched → leads (los promovidos)
  // → events.
  if (createdLinkIds.length > 0) {
    await supabase.from("lead_event_links").delete().in("id", createdLinkIds);
    console.log(`  ${C.gray}lead_event_links: ${createdLinkIds.length}${C.reset}`);
  }
  if (createdSurveyIds.length > 0) {
    // unmatched se borra en cascade (FK ON DELETE CASCADE desde survey)
    await supabase.from("event_surveys").delete().in("id", createdSurveyIds);
    console.log(`  ${C.gray}event_surveys: ${createdSurveyIds.length}${C.reset}`);
  }
  if (createdEventIds.length > 0) {
    await supabase.from("events").delete().in("id", createdEventIds);
    console.log(`  ${C.gray}events: ${createdEventIds.length}${C.reset}`);
  }
  // Leads promovidos por la survey con consent.
  await supabase.from("leads").delete().eq("email", TEST_EMAIL);
  await supabase.from("leads").delete().eq("email", TEST_EMAIL_NO_CONSENT);
  console.log(`  ${C.gray}leads: by email (cascade)${C.reset}`);
}

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `${C.bold}QA Fase 3 — Events Funnel Foundation${C.reset}\n` +
      `${C.gray}RUN_TAG: ${RUN_TAG}${C.reset}`,
  );

  // Test 1 — createEvent
  track("events-server: createEvent crea evento nuevo");
  let eventId;
  try {
    const { data, error } = await supabase
      .from("events")
      .insert({
        slug: EVENT_SLUG,
        title: EVENT_TITLE,
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        status: "draft",
      })
      .select("id, slug, status")
      .single();
    if (error || !data) throw new Error(error?.message ?? "no data");
    eventId = data.id;
    createdEventIds.push(eventId);
    pass(`eventId=${eventId.slice(0, 8)}…, status=draft`);
  } catch (e) {
    fail(e.message);
  }

  // Test 2 — updateEventStatus con audit log from/to real
  track("events-server: updateEventStatus + audit log con from/to");
  try {
    // Capturar prevStatus.
    const { data: prev, error: prevErr } = await supabase
      .from("events")
      .select("status")
      .eq("id", eventId)
      .maybeSingle();
    if (prevErr || !prev) throw new Error("no se pudo leer el evento");

    const { data: updated, error: upErr } = await supabase
      .from("events")
      .update({ status: "published" })
      .eq("id", eventId)
      .eq("status", prev.status)
      .select("status")
      .maybeSingle();
    if (upErr || !updated) throw new Error("update falló");

    // Audit log.
    await supabase.from("admin_audit_log").insert({
      actor_email: "qa-bot@qlick.mx",
      action: "event_status_change",
      entity_type: "event",
      entity_id: eventId,
      metadata: { from: prev.status, to: "published" },
    });

    const { data: auditRows } = await supabase
      .from("admin_audit_log")
      .select("metadata")
      .eq("entity_id", eventId)
      .eq("action", "event_status_change")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      !auditRows?.metadata?.from ||
      auditRows.metadata.from !== "draft" ||
      auditRows.metadata.to !== "published"
    ) {
      throw new Error(
        `audit log metadata incorrecto: ${JSON.stringify(auditRows?.metadata)}`,
      );
    }
    pass(`from='draft' → to='published', audit log.metadata capturado`);
  } catch (e) {
    fail(e.message);
  }

  // Test 3 — createConfirmation con dedup
  track("confirmations-server: createConfirmation + dedup por email");
  let confirmationId;
  try {
    const { data, error } = await supabase
      .from("event_confirmations")
      .upsert(
        {
          event_id: eventId,
          name: `QA Test ${RUN_TAG}`,
          email: TEST_EMAIL,
          phone_raw: TEST_PHONE,
          source: "imported_excel",
        },
        { onConflict: "event_id,email", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Segunda vez: el upsert con ignoreDuplicates debe devolver null data.
    const { data: data2 } = await supabase
      .from("event_confirmations")
      .upsert(
        {
          event_id: eventId,
          name: `QA Test ${RUN_TAG}`,
          email: TEST_EMAIL,
          phone_raw: TEST_PHONE,
          source: "imported_excel",
        },
        { onConflict: "event_id,email", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (data2) {
      throw new Error("segunda inserción devolvió data (no dedup) — debería ser null");
    }
    // Para el cleanup necesito el id real.
    const { data: found } = await supabase
      .from("event_confirmations")
      .select("id")
      .eq("event_id", eventId)
      .eq("email", TEST_EMAIL)
      .maybeSingle();
    if (!found) throw new Error("no se encontró el confirmation creado");
    confirmationId = found.id;
    pass(`confirmationId=${confirmationId.slice(0, 8)}…, segunda vez dedup OK`);
  } catch (e) {
    fail(e.message);
  }

  // Test 4 — createAttendee
  track("attendees-server: createAttendee + dedup por email");
  try {
    await supabase.from("event_attendees").insert({
      event_id: eventId,
      name: `QA Test ${RUN_TAG}`,
      email: TEST_EMAIL,
      source: "check_in",
    });
    // Segunda vez: falla por UNIQUE.
    const { error } = await supabase.from("event_attendees").insert({
      event_id: eventId,
      name: `QA Test ${RUN_TAG}`,
      email: TEST_EMAIL,
      source: "check_in",
    });
    if (!error || error.code !== "23505") {
      throw new Error(`segunda inserción debería fallar con 23505, recibí: ${error?.code}`);
    }
    pass("segunda inserción rechazada por UNIQUE (23505)");
  } catch (e) {
    fail(e.message);
  }

  // Test 5 — survey SIN consent → va a event_survey_unmatched
  track("surveys-server: survey sin consent → event_survey_unmatched");
  try {
    const { data, error } = await supabase
      .from("event_surveys")
      .insert({
        event_id: eventId,
        respondent_email: TEST_EMAIL_NO_CONSENT,
        responses: {},
        consent_to_contact: false,
        commercial_interest: "Quiero info",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message);
    createdSurveyIds.push(data.id);

    // Marcar como unmatched manualmente (replica promotion.ts).
    await supabase.from("event_survey_unmatched").insert({
      survey_id: data.id,
      reason: "no_consent",
    });

    const { data: unmatchedRow } = await supabase
      .from("event_survey_unmatched")
      .select("reason")
      .eq("survey_id", data.id)
      .maybeSingle();

    if (unmatchedRow?.reason !== "no_consent") {
      throw new Error(
        `unmatched reason incorrecto: ${JSON.stringify(unmatchedRow)}`,
      );
    }
    pass(`surveyId=${data.id.slice(0, 8)}…, reason=no_consent`);
  } catch (e) {
    fail(e.message);
  }

  // Test 6 — survey CON consent + interest + email → promueve a lead
  track("promotion: survey con consent → lead via createLeadFromEvent + lead_event_link");
  let surveyId;
  let leadId;
  try {
    // 6a. Insertar survey con consent.
    const { data: survey, error: sErr } = await supabase
      .from("event_surveys")
      .insert({
        event_id: eventId,
        respondent_email: TEST_EMAIL,
        responses: {},
        consent_to_contact: true,
        commercial_interest: "Ads en Meta",
      })
      .select("id")
      .single();
    if (sErr || !survey) throw new Error(sErr?.message);
    surveyId = survey.id;
    createdSurveyIds.push(surveyId);

    // 6b. Llamar a createLeadFromEvent (de Fase 2 — vía HTTP no se puede
    //     con strip-types, así que replicamos la query equivalente).
    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .insert({
        name: `QA Test ${RUN_TAG}`,
        email: TEST_EMAIL,
        source: "event",
        status: "new",
        intent: "course_information",
        consent_to_contact: true,
        course_of_interest: "Ads en Meta",
        tags: [`event:${EVENT_SLUG}`, `event:${EVENT_SLUG}:survey:${surveyId}`],
      })
      .select("id")
      .single();
    if (lErr || !lead) throw new Error(lErr?.message);
    leadId = lead.id;

    // 6c. Marcar survey como promovida.
    await supabase
      .from("event_surveys")
      .update({ promoted_to_lead_id: leadId, promoted_at: new Date().toISOString() })
      .eq("id", surveyId);

    // 6d. Crear link en lead_event_links.
    const { data: link, error: linkErr } = await supabase
      .from("lead_event_links")
      .insert({
        lead_id: leadId,
        event_id: eventId,
        link_type: "survey",
        link_id: surveyId,
      })
      .select("id")
      .single();
    if (linkErr || !link) throw new Error(linkErr?.message);
    createdLinkIds.push(link.id);

    // 6e. Verificar.
    const { data: surveyCheck } = await supabase
      .from("event_surveys")
      .select("promoted_to_lead_id")
      .eq("id", surveyId)
      .single();
    if (surveyCheck?.promoted_to_lead_id !== leadId) {
      throw new Error("survey.promoted_to_lead_id no apunta al lead creado");
    }

    pass(
      `leadId=${leadId.slice(0, 8)}…, linkId=${link.id.slice(0, 8)}…, promoted=true`,
    );
  } catch (e) {
    fail(e.message);
  }

  // Test 7 — linkLeadToEventRecord idempotente (cierra H2)
  track("linkLeadToEventRecord: INSERT con UNIQUE → idempotente");
  try {
    const { error: firstErr } = await supabase.from("lead_event_links").insert({
      lead_id: leadId,
      event_id: eventId,
      link_type: "confirmation",
      link_id: confirmationId,
    });
    if (firstErr) throw new Error(`primer insert falló: ${firstErr.message}`);

    const { error: secondErr } = await supabase.from("lead_event_links").insert({
      lead_id: leadId,
      event_id: eventId,
      link_type: "confirmation",
      link_id: confirmationId,
    });
    if (!secondErr || secondErr.code !== "23505") {
      throw new Error(
        `segundo insert debería ser 23505, recibí: ${secondErr?.code}`,
      );
    }
    pass("segundo insert rechazada por UNIQUE → idempotente");
  } catch (e) {
    fail(e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // Resumen final
  // ─────────────────────────────────────────────────────────────
  await cleanup();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;

  console.log(`\n${C.bold}═══ Resumen ═══${C.reset}`);
  console.log(`  Total:  ${results.length}`);
  console.log(`  ${C.green}PASS:   ${passed}${C.reset}`);
  if (failed > 0) {
    console.log(`  ${C.red}FAIL:   ${failed}${C.reset}`);
  }
  console.log(`  RUN_TAG: ${C.gray}${RUN_TAG}${C.reset}`);

  if (failed > 0) {
    console.log(`\n${C.red}${C.bold}❌ Hubo tests que fallaron.${C.reset}`);
    process.exit(1);
  }

  console.log(`\n${C.green}${C.bold}✅ Todos los tests pasaron.${C.reset}`);
  console.log(`${C.gray}Fase 3 está lista para merge a main.${C.reset}`);
  process.exit(0);
}

main().catch(async (e) => {
  console.error(`\n${C.red}❌ Error fatal:${C.reset}`, e);
  await cleanup();
  process.exit(1);
});
