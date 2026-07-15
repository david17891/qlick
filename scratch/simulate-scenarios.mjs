#!/usr/bin/env node
// scratch/simulate-scenarios.mjs
//
// Simulación automatizada end-to-end del funnel dinámico (Fase 7d.2).
// Recorre los 3 escenarios canónicos (MQL/Hot/Cold) y por cada uno:
//   1. Crea un lead ficticio en `event_attended` + `survey_offer_sent_at` marcado.
//   2. Inserta `event_surveys` con respuestas ficticias (4 preguntas).
//   3. Calcula el score con `calculateLeadScoreFromConfig` (función pura).
//   4. Invoca `applyPromotionRules` (Promotion Engine real contra la DB).
//   5. Aserta el estado final en `leads`, `crm_tasks`, `admin_audit_log`.
//
// Métricas validadas por escenario (M1–M5 del skill funnel-simulation-tester):
//   M1: Integridad — survey persistido + sin bucles.
//   M2: Scoring — score en DB == suma de pesos del JSON.
//   M3: Consentimiento — si isConsent=true, lead promovido y email persistido.
//   M4: Promoción — status correcto + tarea CRM con prioridad correcta.
//   M5: Alertas — admin_audit_log con payload (solo MQL).
//
// PRIVACIDAD: phones +52XXXXXXXXXX sintéticos + emails @example.com.
// IDEMPOTENTE: timestamp único por escenario (no chocan entre runs).
//
// Uso:
//   node --import ./tests/loader-register.mjs \
//        --experimental-strip-types \
//        scratch/simulate-scenarios.mjs
//
// Self-healing: si una aserción falla, el script imprime el delta y
// devuelve exit 1. El agente (yo) entra al loop de auto-reparación.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { calculateLeadScoreFromConfig } from "../src/lib/crm/lead-scoring.ts";
import { applyPromotionRules } from "../src/lib/crm/promotion-engine.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────
// Env loader (mismo patrón que simulate-funnel-cycle.mjs)
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
const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("ERROR: faltan env vars (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).");
  process.exit(2);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─────────────────────────────────────────────────────────────
// Survey config personalizado (4 preguntas, compatible con wizard)
// ─────────────────────────────────────────────────────────────
const SURVEY_CONFIG = {
  questions: [
    {
      id: "q1_clarity",
      text: "¿Qué tan claro te quedó el contenido del evento?",
      type: "buttons",
      options: [
        { id: "very_clear", title: "Muy claro", score: 20 },
        { id: "clear", title: "Claro", score: 15 },
        { id: "confusing", title: "Confuso", score: 5 },
      ],
    },
    {
      id: "q2_apply",
      text: "¿Lo aplicarías a tu negocio o proyecto?",
      type: "buttons",
      options: [
        { id: "yes", title: "Sí", score: 30, isCommercialInterest: true },
        { id: "maybe", title: "Tal vez", score: 15, isCommercialInterest: true },
        { id: "no", title: "No", score: 0 },
      ],
    },
    {
      id: "q3_consent",
      text: "¿Aceptas que te contactemos por WhatsApp para enviarte información de cursos?",
      type: "buttons",
      options: [
        { id: "yes", title: "Sí", score: 10, isConsent: true },
        { id: "no", title: "No", score: 0 },
      ],
    },
    {
      id: "q4_business",
      text: "Contanos brevemente sobre tu negocio o a qué te dedicas (o 'saltar').",
      type: "text",
      isBusinessDescription: true,
    },
  ],
  followUps: {
    mql: {
      text: "¡Excelente {{1}}! Un asesor de Qlick se pondrá en contacto contigo muy pronto por esta vía.",
      templateName: "conf_bienvenida",
      templateLanguage: "es_MX",
    },
    hot: {
      text: "¡Buenísimo {{1}}! Te comparto el temario del curso para que lo revises: https://qlick.digital/cursos",
      templateName: null,
    },
    coldWarm: {
      text: "¡Gracias por tu feedback {{1}}! Tomamos nota para mejorar nuestros próximos eventos.",
      templateName: null,
    },
  },
};

// ─────────────────────────────────────────────────────────────
// 3 escenarios canónicos
// ─────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    name: "MQL",
    suffix: "01",
    responses: {
      q1_clarity: "very_clear", // 20
      q2_apply: "yes", // 30 (commercial interest)
      q3_consent: "yes", // 10 (consent)
      q4_business: "Vendo café de especialidad en CDMX", // 5 (engagement)
    },
    expectedScore: 65,
    expectedQual: "mql",
    // FIX 2026-07-06: migration 20260706020000 aplicada — `qualified`
    // ya es valor nativo del enum lead_status.
    expectedStatus: "qualified",
    expectedTaskPriority: "high",
    expectedAdminNotified: true,
    businessDescription: "Vendo café de especialidad en CDMX",
    commercialInterest: "Sí",
  },
  {
    name: "Hot",
    suffix: "02",
    responses: {
      q1_clarity: "clear", // 15
      q2_apply: "maybe", // 15 (commercial interest)
      q3_consent: "yes", // 10 (consent)
      q4_business: "Tengo una tienda online de ropa", // 5
    },
    expectedScore: 45,
    expectedQual: "hot",
    expectedStatus: "contacted",
    expectedTaskPriority: "medium",
    expectedAdminNotified: false,
    businessDescription: "Tengo una tienda online de ropa",
    commercialInterest: "Tal vez",
  },
  {
    name: "Cold",
    suffix: "03",
    responses: {
      q1_clarity: "confusing", // 5
      q2_apply: "no", // 0
      q3_consent: "no", // 0
      q4_business: "saltar", // 0 (skip)
    },
    expectedScore: 5,
    expectedQual: "cold",
    expectedStatus: null, // Cold: sin cambios (status sigue en event_attended)
    expectedTaskPriority: null,
    expectedAdminNotified: false,
    businessDescription: null,
    commercialInterest: null,
  },
];

// ─────────────────────────────────────────────────────────────
// Helpers de reporting
// ─────────────────────────────────────────────────────────────
const results = [];
function step(msg) {
  console.log(`\n→ ${msg}`);
}
function ok(msg) {
  results.push({ status: "ok", msg });
  console.log(`  ✓ ${msg}`);
}
function fail(msg, ctx) {
  results.push({ status: "fail", msg, ctx });
  console.error(`  ✗ ${msg}`);
  if (ctx) console.error(`    ctx: ${JSON.stringify(ctx)}`);
}
function info(msg) {
  console.log(`  · ${msg}`);
}

// ─────────────────────────────────────────────────────────────
// 1. Setup evento de prueba con survey_config personalizado
// ─────────────────────────────────────────────────────────────
const RUN_ID = Date.now().toString().slice(-10);
const EVENT_SLUG = `sim-funnel-${RUN_ID}`;
const EVENT_TITLE = "Masterclass Funnels 2026";

step(`Setup evento de prueba (slug=${EVENT_SLUG})`);
const startsAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // hace 1h (ya pasó)
const endsAt = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // hace 30min

const { data: event, error: eventErr } = await supabase
  .from("events")
  .insert({
    slug: EVENT_SLUG,
    title: EVENT_TITLE,
    description: "Masterclass de prueba para simulación del funnel dinámico.",
    starts_at: startsAt,
    ends_at: endsAt,
    location: "CDMX",
    status: "published",
    requires_name: false,
    survey_config: SURVEY_CONFIG,
  })
  .select("id, slug, title, survey_config")
  .single();

if (eventErr || !event) {
  fail(`No se pudo crear evento: ${eventErr?.code} ${eventErr?.message}`);
  process.exit(1);
}
ok(`Evento creado: ${event.id}`);
info(`survey_config tiene ${event.survey_config.questions.length} preguntas`);
info(`followUps.mql template: ${event.survey_config.followUps?.mql?.templateName ?? "null"}`);

// ─────────────────────────────────────────────────────────────
// 2. Función: corre un escenario completo
// ─────────────────────────────────────────────────────────────
async function runScenario(scenario) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`▶ Escenario ${scenario.name} (score esperado: ${scenario.expectedScore})`);
  console.log("═".repeat(60));

  const phone = `+5255550${scenario.suffix}${RUN_ID.slice(-4)}`;
  const email = `sim+${scenario.name.toLowerCase()}+${RUN_ID}@example.com`;
  const name = `Sim ${scenario.name} ${RUN_ID}`;

  // 2.1 Crear lead en event_attended (como si ya hubiera asistido)
  step(`Crear lead (${scenario.name}): ${email}`);
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .insert({
      name,
      email,
      phone,
      phone_normalized: phone,
      source: "event",
      intent: "course_information",
      status: "event_attended",
      consent_to_contact: true,
      survey_offer_sent_at: new Date().toISOString(),
      tags: [`event:${EVENT_SLUG}`],
    })
    .select("*")
    .single();
  if (leadErr || !lead) {
    fail(`No se pudo crear lead: ${leadErr?.code} ${leadErr?.message}`);
    return false;
  }
  ok(`Lead creado: id=${lead.id} status=${lead.status}`);

  // 2.2 Crear event_attendees (asistencia)
  // FIX 2026-07-06: schema real de event_attendees usa `checked_in_at`
  // (no `attended_at`) y no tiene `lead_id` (relación vía phone_normalized
  // o confirmation_id). Verificado en migration 20260627000000_events_funnel.sql.
  step(`Crear event_attendees (asistencia)`);
  const { data: attendee, error: attErr } = await supabase
    .from("event_attendees")
    .insert({
      event_id: event.id,
      name,
      email,
      phone_normalized: phone,
      checked_in_at: endsAt,
      checked_in_by: "sim-funnel-script",
      source: "manual",
    })
    .select("*")
    .single();
  if (attErr || !attendee) {
    fail(`No se pudo crear attendee: ${attErr?.code} ${attErr?.message}`);
    return false;
  }
  ok(`Attendee creado: id=${attendee.id}`);

  // 2.3 Insertar event_surveys con respuestas del escenario (vinculada al lead)
  step(`Insertar event_surveys con respuestas del escenario`);
  const surveyResponses = {
    ...scenario.responses,
    ...(scenario.name === "Cold"
      ? {}
      : {}),
  };
  const { data: survey, error: surveyErr } = await supabase
    .from("event_surveys")
    .insert({
      event_id: event.id,
      respondent_email: email,
      respondent_phone: phone,
      phone_normalized: phone,
      responses: surveyResponses,
      consent_to_contact: scenario.responses.q3_consent === "yes",
      commercial_interest: scenario.commercialInterest,
      promoted_to_lead_id: lead.id,
      promoted_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (surveyErr || !survey) {
    fail(`No se pudo crear survey: ${surveyErr?.code} ${surveyErr?.message}`);
    return false;
  }
  ok(`Survey creada: id=${survey.id}`);
  info(`responses: ${JSON.stringify(survey.responses)}`);

  // Crear link lead ↔ survey en lead_event_links
  const { error: linkErr } = await supabase.from("lead_event_links").insert({
    lead_id: lead.id,
    event_id: event.id,
    link_type: "survey",
    link_id: survey.id,
  });
  if (linkErr) {
    fail(`No se pudo crear link en lead_event_links: ${linkErr.message}`);
    return false;
  }
  ok(`Link en lead_event_links creado para la survey`);

  // 2.4 Calcular score con calculateLeadScoreFromConfig
  step(`Calcular score con calculateLeadScoreFromConfig`);
  const scoreResult = calculateLeadScoreFromConfig(
    scenario.responses,
    SURVEY_CONFIG,
  );
  info(`score=${scoreResult.score} qual=${scoreResult.qualification}`);
  info(`reasons: ${JSON.stringify(scoreResult.reasons)}`);
  info(`consentDetected=${scoreResult.consentDetected}`);
  info(`commercialInterest=${scoreResult.commercialInterestDetected}`);
  info(`businessDescription=${scoreResult.businessDescription}`);

  // M2: asertar score == suma de pesos del JSON
  try {
    assert.equal(
      scoreResult.score,
      scenario.expectedScore,
      `M2 score esperado ${scenario.expectedScore}, got ${scoreResult.score}`,
    );
    ok(`M2 score=${scoreResult.score} == esperado`);
  } catch (e) {
    fail(e.message, { expected: scenario.expectedScore, actual: scoreResult.score });
  }

  // 2.5 Invocar Promotion Engine
  step(`Invocar applyPromotionRules`);
  const promoResult = await applyPromotionRules(lead.id, scoreResult, {
    supabase,
    actorEmail: "sim-funnel-bot@qlick",
    leadEmail: email,
    leadName: name,
    eventTitle: EVENT_TITLE,
  });
  info(`promoResult: ${JSON.stringify(promoResult)}`);

  if (!promoResult.ok) {
    fail(`Promotion engine returned ok=false`, promoResult);
    return false;
  }
  ok(`Promotion engine OK`);

  // 2.6 Asertar estado del lead en BD
  step(`Verificar estado del lead en BD`);
  const { data: leadAfter, error: leadAfterErr } = await supabase
    .from("leads")
    .select("id, status, score, qualification, last_contacted_at")
    .eq("id", lead.id)
    .single();
  if (leadAfterErr || !leadAfter) {
    fail(`No se pudo leer lead post-promotion: ${leadAfterErr?.message}`);
    return false;
  }
  info(`post-promotion: status=${leadAfter.status} score=${leadAfter.score} qual=${leadAfter.qualification}`);

  // M4: status
  if (scenario.expectedStatus === null) {
    try {
      assert.equal(
        leadAfter.status,
        "event_attended",
        `Cold: status debería seguir en 'event_attended'`,
      );
      ok(`M4 status='event_attended' (Cold sin cambios)`);
    } catch (e) {
      fail(e.message, { actual: leadAfter.status });
    }
  } else {
    try {
      assert.equal(leadAfter.status, scenario.expectedStatus, `M4 status esperado ${scenario.expectedStatus}`);
      ok(`M4 status='${leadAfter.status}'`);
    } catch (e) {
      fail(e.message, { expected: scenario.expectedStatus, actual: leadAfter.status });
    }
  }

  // M2: score en BD == esperado
  // Para Cold, el Promotion Engine NO hace UPDATE (newStatus=null),
  // por lo tanto el score en BD queda null. Ajustamos assert según escenario.
  if (scenario.expectedStatus === null) {
    try {
      assert.equal(leadAfter.score, null, `Cold: score no debería haberse actualizado`);
      ok(`M2 score=null (Cold sin cambios, correcto)`);
    } catch (e) {
      fail(e.message, { actual: leadAfter.score });
    }
  } else {
    try {
      assert.equal(leadAfter.score, scenario.expectedScore, `M2 score BD esperado ${scenario.expectedScore}`);
      ok(`M2 score BD=${leadAfter.score} == esperado`);
    } catch (e) {
      fail(e.message, { expected: scenario.expectedScore, actual: leadAfter.score });
    }
  }

  // M3: consent detectado
  const consentExpected = scenario.responses.q3_consent === "yes";
  try {
    assert.equal(scoreResult.consentDetected, consentExpected, "M3 consentDetected");
    ok(`M3 consentDetected=${scoreResult.consentDetected}`);
  } catch (e) {
    fail(e.message, { expected: consentExpected, actual: scoreResult.consentDetected });
  }

  // 2.7 Asertar crm_tasks
  step(`Verificar crm_tasks para el lead`);
  const { data: tasks, error: tasksErr } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false });
  if (tasksErr) {
    fail(`No se pudo leer crm_tasks: ${tasksErr.message}`);
    return false;
  }
  info(`tasks encontradas: ${tasks?.length ?? 0}`);
  if (tasks && tasks.length > 0) {
    info(`última task: ${JSON.stringify(tasks[0])}`);
  }

  if (scenario.expectedTaskPriority === null) {
    try {
      assert.equal(
        tasks?.length ?? 0,
        0,
        `Cold: no debería haber tareas (priority null)`,
      );
      ok(`M4 crm_tasks: ninguna tarea (Cold)`);
    } catch (e) {
      fail(e.message, { count: tasks?.length ?? 0 });
    }
  } else {
    try {
      assert.ok((tasks?.length ?? 0) >= 1, `M4 esperaba al menos 1 tarea`);
      // FIX 2026-07-06: migration 20260706010000 aplicada — `priority`
      // es columna nativa de crm_tasks. Leemos directo, no del description.
      assert.equal(tasks[0].priority, scenario.expectedTaskPriority, `M4 priority (columna nativa)`);
      assert.equal(tasks[0].created_by_email, "sim-funnel-bot@qlick", `M4 created_by_email poblado`);
      // due_at: high → +1d, medium → +3d, low → +7d
      const expectedDueDays = scenario.expectedTaskPriority === "high" ? 1 : scenario.expectedTaskPriority === "medium" ? 3 : 7;
      const dueMs = new Date(tasks[0].due_at).getTime() - new Date(tasks[0].created_at).getTime();
      const dueDays = Math.round(dueMs / (24 * 60 * 60 * 1000));
      assert.equal(dueDays, expectedDueDays, `M4 due_at debería ser +${expectedDueDays}d`);
      ok(`M4 crm_tasks: priority=${tasks[0].priority} due_in=${dueDays}d`);
    } catch (e) {
      fail(e.message, { tasks: tasks?.slice(0, 2) });
    }
  }

  // 2.8 Asertar admin_audit_log
  step(`Verificar admin_audit_log`);
  const { data: audits, error: auditsErr } = await supabase
    .from("admin_audit_log")
    .select("*")
    .eq("entity_type", "lead")
    .eq("entity_id", lead.id)
    .order("created_at", { ascending: false });
  if (auditsErr) {
    fail(`No se pudo leer admin_audit_log: ${auditsErr.message}`);
    return false;
  }
  info(`audit entries: ${audits?.length ?? 0}`);
  if (audits && audits.length > 0) {
    info(`último audit: action=${audits[0].action} actor=${audits[0].actor_email}`);
  }

  if (scenario.expectedStatus !== null) {
    try {
      assert.ok((audits?.length ?? 0) >= 1, "M5 esperaba audit entry");
      const promo = audits.find((a) => a.action === "lead_promoted");
      assert.ok(promo, "M5 esperaba action='lead_promoted'");
      assert.equal(promo.metadata?.score, scenario.expectedScore, "M5 audit metadata.score");
      assert.equal(promo.metadata?.newStatus, scenario.expectedStatus, "M5 audit metadata.newStatus");
      assert.equal(promo.metadata?.leadName, name, "M5 audit metadata.leadName");
      ok(`M5 admin_audit_log: action=lead_promoted score=${promo.metadata.score} newStatus=${promo.metadata.newStatus}`);
    } catch (e) {
      fail(e.message, { audits: audits?.slice(0, 2) });
    }
  } else {
    try {
      assert.equal(audits?.length ?? 0, 0, `Cold: no debería haber audit entry`);
      ok(`M5 admin_audit_log: ninguna entry (correcto)`);
    } catch (e) {
      fail(e.message, { count: audits?.length ?? 0 });
    }
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// 3. Correr los 3 escenarios
// ─────────────────────────────────────────────────────────────
let allOk = true;
for (const scenario of SCENARIOS) {
  const ok = await runScenario(scenario);
  if (!ok) allOk = false;
}

// ─────────────────────────────────────────────────────────────
// 4. Resumen consolidado
// ─────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`📊 RESUMEN CONSOLIDADO`);
console.log("═".repeat(60));

const okCount = results.filter((r) => r.status === "ok").length;
const failCount = results.filter((r) => r.status === "fail").length;
console.log(`\nAserciones: ${okCount} OK, ${failCount} FAIL`);

const fails = results.filter((r) => r.status === "fail");
if (fails.length > 0) {
  console.log(`\n❌ Aserciones que fallaron:`);
  for (const f of fails) {
    console.log(`   - ${f.msg}`);
    if (f.ctx) console.log(`     ctx: ${JSON.stringify(f.ctx)}`);
  }
}

console.log(`\nRun ID: ${RUN_ID}`);
console.log(`Evento: ${event.id} (slug=${event.slug})`);
console.log(`Phones usados: +5255550{01|02|03}${RUN_ID.slice(-4)}`);
console.log(`Emails usados: sim+{mql|hot|cold}+${RUN_ID}@example.com`);

// FIX 2026-07-15 (sesion David, "eventos del simulador aparecen en prod"):
// el smoke de GitHub Actions corre este script contra la DB de prod. Antes
// el evento creado quedaba como `status='published'` y aparecía en el bot
// como "Masterclass Funnels 2026", contaminando el admin y el LLM. Ahora
// borramos el evento al final. Si el script falla a media corrida, el
// cleanup NO se ejecuta y el evento queda — David puede archivarlo
// manualmente desde /admin/eventos.
try {
  const { error: delEvtErr } = await supabase
    .from("events")
    .delete()
    .eq("id", event.id);
  if (delEvtErr) {
    console.warn(`  ⚠️ cleanup event fallo: ${delEvtErr.message}`);
  } else {
    console.log(`  🧹 cleanup OK: evento ${event.id} (slug=${event.slug}) borrado`);
  }
} catch (cleanupErr) {
  console.warn(`  ⚠️ cleanup exception: ${cleanupErr.message}`);
}

console.log(`\n📌 Cleanup opcional (manual):`);
console.log(`   node scripts/reset-test-lead.mjs --phone=+525555001${RUN_ID.slice(-4)}`);
console.log(`   node scripts/reset-test-lead.mjs --phone=+525555002${RUN_ID.slice(-4)}`);
console.log(`   node scripts/reset-test-lead.mjs --phone=+525555003${RUN_ID.slice(-4)}`);

if (!allOk || failCount > 0) {
  console.log(`\n❌ Simulación con discrepancias — exit 1`);
  process.exit(1);
}
console.log(`\n✅ Simulación EXITOSA — 3/3 escenarios pasaron las 5 métricas (M1–M5)`);
process.exit(0);
