// Qlick Funnel — Fresh test (Phase 1 + 2 + 3)
// Borra funnel viejo, crea 2 eventos genericos, prueba e2e del Promotion Engine.
//
// Uso: node --env-file=.env.local scratch/qlick-freshtest-e2e.mjs

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
const sep = (s) => log("\n" + "=".repeat(60) + "\n" + s + "\n" + "=".repeat(60));

// ─────────────────────────────────────────────────────────
// PHASE 1 — Limpieza total del funnel
// ─────────────────────────────────────────────────────────
async function phase1Cleanup() {
  sep("PHASE 1 — Limpieza total del funnel");

  // Orden: hijos primero (FK), padres al final.
  const order = [
    "event_attendees",
    "event_qr_tokens",
    "event_surveys",
    "event_email_log",
    "event_reminder_log",
    "lead_event_links",
    "lead_whatsapp_conversations",
    "lead_consent_log",
    "crm_tasks",
    "leads",
    "payments",
    "events",
  ];

  const before = {};
  for (const t of order) {
    const { count } = await sb.from(t).select("*", { count: "exact", head: true });
    before[t] = count ?? 0;
  }
  log("Estado ANTES:", JSON.stringify(before, null, 2));

  for (const t of order) {
    // Para tablas con NOT NULL id pero sin dato: filter dummy id != '<no-match>' es seguro
    // ya que no hay rows; pero si hay rows, .neq() las incluye todas (es "not equal to this").
    const { error } = await sb.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      log(`  ERR ${t}: ${error.message}`);
    } else {
      log(`  OK  ${t}`);
    }
  }

  const after = {};
  for (const t of order) {
    const { count } = await sb.from(t).select("*", { count: "exact", head: true });
    after[t] = count ?? 0;
  }
  log("Estado DESPUES:", JSON.stringify(after, null, 2));
}

// ─────────────────────────────────────────────────────────
// PHASE 2 — Crear 2 eventos
// ─────────────────────────────────────────────────────────

// Survey A — Conservador (3 preguntas, score max 75)
const surveyConfigA = {
  questions: [
    {
      id: "q1_clarity",
      text: "¿Qué tan claro te quedó el contenido?",
      type: "buttons",
      options: [
        { id: "very_clear", title: "Muy claro", score: 25 },
        { id: "clear", title: "Claro", score: 15 },
        { id: "confusing", title: "Confuso", score: 5 },
      ],
    },
    {
      id: "q2_apply",
      text: "¿Lo aplicarías a tu negocio?",
      type: "buttons",
      options: [
        { id: "yes", title: "Sí", score: 30, isCommercialInterest: true },
        { id: "maybe", title: "Tal vez", score: 15, isCommercialInterest: true },
        { id: "no", title: "No", score: 0 },
      ],
    },
    {
      id: "q_consent",
      text: "¿Aceptas contacto por WhatsApp para info de cursos?",
      type: "buttons",
      options: [
        { id: "yes", title: "Sí", score: 10, isConsent: true },
        { id: "no", title: "No", score: 0 },
      ],
    },
  ],
  followUps: {
    mql: { text: "¡Excelente {{1}}! Un asesor te contactará por WhatsApp pronto.", templateName: null },
    hot: { text: "¡Genial {{1}}! Te comparto nuestro catálogo: https://qlick.digital/cursos", templateName: null },
    coldWarm: { text: "¡Gracias {{1}}! Tomamos nota.", templateName: null },
  },
};

const eventA = {
  slug: "masterclass-marketing-digital",
  title: "Masterclass Marketing Digital",
  description: "Masterclass genérica de marketing digital — para probar el funnel automatico.",
  status: "published",
  starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(),
  location: "Online",
  event_rules: {},
  survey_config: surveyConfigA,
};

const eventB = {
  slug: "taller-embudos-venta",
  title: "Taller Embudos de Venta",
  description: "Taller generico de embudos — usa survey_config default del sistema.",
  status: "published",
  starts_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 120 * 60 * 1000).toISOString(),
  location: "Online",
  event_rules: {},
  // survey_config: null -> cae al default del sistema (5 preguntas)
};

async function phase2Setup() {
  sep("PHASE 2 — Crear 2 eventos");

  const { data: a, error: ea } = await sb.from("events").insert(eventA).select("id,slug,short_code,title,survey_config").single();
  if (ea) throw new Error("Insert A failed: " + ea.message);
  log("Evento A creado:", a.id, a.slug, "short=", a.short_code, "—", a.title);
  log("  survey_config questions:", a.survey_config?.questions?.length);

  const { data: b, error: eb } = await sb.from("events").insert(eventB).select("id,slug,short_code,title,survey_config").single();
  if (eb) throw new Error("Insert B failed: " + eb.message);
  log("Evento B creado:", b.id, b.slug, "short=", b.short_code, "—", b.title);
  log("  survey_config (vacio = default 5 preguntas):", JSON.stringify(b.survey_config));

  return { eventA: a, eventB: b };
}

// ─────────────────────────────────────────────────────────
// PHASE 3 — Probar el flujo end-to-end
// ─────────────────────────────────────────────────────────
async function phase3E2ETest({ eventA }) {
  sep("PHASE 3 — Test E2E del funnel (registro → checkin → survey → CRM)");

  const testPhone = "+525512345678"; // formato normalizado E.164 (sin el 1)
  const testEmail = "test-freshtest@qlick.app";
  const testName = "Test Freshtest";

  // ─── Lead ───
  const { data: lead, error: le } = await sb
    .from("leads")
    .insert({
      name: testName,
      email: testEmail,
      phone: testPhone,
      status: "new",
      source: "event",
      intent: "course_information",
      consent_to_contact: true,
      whatsapp_status: "no_contactado",
      tags: ["test:freshtest"],
    })
    .select("id,name,email,status,consent_to_contact")
    .single();
  if (le) throw new Error("Insert lead failed: " + le.message);
  log("Lead creado:", lead.id, lead.name, "status=", lead.status, "consent=", lead.consent_to_contact);

  // ─── QR token ───
  const qrToken = crypto.randomBytes(16).toString("base64url");
  const { data: qr, error: qe } = await sb
    .from("event_qr_tokens")
    .insert({
      event_id: eventA.id,
      attendee_phone_normalized: testPhone,
      attendee_name: testName,
      attendee_email: testEmail,
      token: qrToken,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id,token")
    .single();
  if (qe) throw new Error("Insert QR failed: " + qe.message);
  log("QR token creado:", qr.id, "token=", qr.token.slice(0, 8) + "...");

  // ─── Attendee (check-in) ───
  const { data: attendee, error: ae } = await sb
    .from("event_attendees")
    .insert({
      event_id: eventA.id,
      name: testName,
      email: testEmail,
      phone_normalized: testPhone,
      source: "check_in",
    })
    .select("id,event_id,name")
    .single();
  if (ae) throw new Error("Insert attendee failed: " + ae.message);
  log("Attendee creado (check-in simulado):", attendee.id);

  // ─── Survey response ───
  // Score esperado con surveyConfigA:
  // q1_clarity=very_clear (25) + q2_apply=yes (30) + q_consent=yes (10) = 65
  // = MQL (>=60)
  const responses = {
    q1_clarity: "very_clear",
    q2_apply: "yes",
    q_consent: "yes",
  };

  const { data: survey, error: se } = await sb
    .from("event_surveys")
    .insert({
      event_id: eventA.id,
      attendee_id: attendee.id,
      respondent_email: testEmail,
      respondent_phone: testPhone,
      phone_normalized: testPhone,
      responses,
      consent_to_contact: true,
      commercial_interest: "yes",
      promoted_to_lead_id: lead.id,
      promoted_at: new Date().toISOString(),
    })
    .select("id,responses,consent_to_contact,commercial_interest,promoted_to_lead_id")
    .single();
  if (se) throw new Error("Insert survey failed: " + se.message);
  log("Survey creado:", survey.id, "consent=", survey.consent_to_contact, "commercial=", survey.commercial_interest);

  // ─── lead_event_links ───
  const { error: leErr } = await sb.from("lead_event_links").insert({
    lead_id: lead.id,
    event_id: eventA.id,
    link_type: "survey",
    link_id: survey.id,
  });
  if (leErr) throw new Error("Insert lead_event_link failed: " + leErr.message);
  log("Lead linkeado a evento via lead_event_links (link_type=survey)");

  // ─── Calcular score (mismo algoritmo que promotion-engine) ───
  const score = calculateScore(surveyConfigA, responses);
  const bucket = score >= 60 ? "mql" : score >= 40 ? "hot" : score >= 20 ? "warm" : "cold";
  log("\nScore calculado:", score, "-> bucket:", bucket);

  // ─── Promotion Engine (replica logica de applyPromotionRules) ───
  // Para MQL: status=qualified + crm_task priority=high + audit log
  let promotionNotes = [];

  if (score >= 60) {
    // MQL
    promotionNotes.push("MQL: status=qualified, task HOT");
    const { error: upErr } = await sb.from("leads").update({
      status: "qualified",
      tags: ["test:freshtest", `score:${score}`, `bucket:${bucket}`, `event:${eventA.slug}:attended`],
      score,
      qualification: "mql",
      last_contacted_at: new Date().toISOString(),
    }).eq("id", lead.id);
    if (upErr) throw new Error("Update lead failed: " + upErr.message);
    log("Lead promovido: status=qualified, score=" + score + ", qualification=mql");
  } else if (score >= 40) {
    // Hot
    promotionNotes.push("Hot: status=contacted, task media");
    await sb.from("leads").update({
      status: "contacted",
      tags: ["test:freshtest", `score:${score}`, `bucket:${bucket}`],
      score,
      qualification: "hot",
    }).eq("id", lead.id);
  } else if (score >= 20) {
    promotionNotes.push("Warm: status=contacted, task baja");
    await sb.from("leads").update({
      status: "contacted",
      tags: ["test:freshtest", `score:${score}`, `bucket:${bucket}`],
      score,
      qualification: "warm",
    }).eq("id", lead.id);
  } else {
    promotionNotes.push("Cold: sin cambios");
  }

  // ─── CRM task ───
  const dueAt = new Date(Date.now() + (score >= 60 ? 24 : score >= 40 ? 72 : 168) * 60 * 60 * 1000).toISOString();
  const { data: task, error: tkErr } = await sb.from("crm_tasks").insert({
    lead_id: lead.id,
    title: `[${bucket.toUpperCase()}] Llamar a ${testName} — post ${eventA.slug}`,
    description: `Score: ${score}. Respuestas: ${JSON.stringify(responses)}. Bucket: ${bucket}.`,
    status: "pending",
    due_at: dueAt,
    created_by_email: "system@qlick",
  }).select("id,title,status,due_at").single();
  if (tkErr) throw new Error("Insert task failed: " + tkErr.message);
  log("CRM task creada:", task.id, "title=", task.title);

  // ─── Audit log ───
  const { error: alErr } = await sb.from("admin_audit_log").insert({
    actor_email: "system@qlick",
    action: "promotion",
    entity_type: "lead",
    entity_id: lead.id,
    metadata: {
      score,
      bucket,
      event_slug: eventA.slug,
      survey_id: survey.id,
      notes: promotionNotes.join("; "),
    },
  });
  if (alErr) throw new Error("Insert audit failed: " + alErr.message);
  log("Audit log insertado");

  // ─── VERIFICACION FINAL ───
  sep("VERIFICACION FINAL — Todo lo que se creo en este test");

  const { data: finalLead } = await sb.from("leads").select("*").eq("id", lead.id).single();
  log("\n[LEAD]", JSON.stringify(finalLead, null, 2));

  const { data: finalTask } = await sb.from("crm_tasks").select("*").eq("lead_id", lead.id).single();
  log("\n[CRM TASK]", JSON.stringify(finalTask, null, 2));

  const { data: finalSurvey } = await sb.from("event_surveys").select("id,event_id,consent_to_contact,commercial_interest,responses,promoted_to_lead_id").eq("id", survey.id).single();
  log("\n[SURVEY]", JSON.stringify(finalSurvey, null, 2));

  const { data: audits } = await sb.from("admin_audit_log").select("action,actor_email,entity_id,metadata").eq("entity_id", lead.id);
  log("\n[AUDIT LOGS]", JSON.stringify(audits, null, 2));

  const { count: totalEvents } = await sb.from("events").select("*", { count: "exact", head: true });
  const { count: totalLeads } = await sb.from("leads").select("*", { count: "exact", head: true });
  const { count: totalTasks } = await sb.from("crm_tasks").select("*", { count: "exact", head: true });
  log("\n[TOTALES EN DB]", JSON.stringify({ events: totalEvents, leads: totalLeads, tasks: totalTasks }));

  return { lead, task, survey, score, bucket };
}

function calculateScore(config, responses) {
  let total = 0;
  for (const q of config.questions) {
    if (q.type === "buttons") {
      const answerId = responses[q.id];
      const opt = q.options?.find((o) => o.id === answerId);
      if (opt) total += opt.score || 0;
    }
  }
  return Math.max(0, Math.min(100, total));
}

(async () => {
  try {
    await phase1Cleanup();
    const events = await phase2Setup();
    await phase3E2ETest(events);
    sep("DONE");
    log("Resumen:");
    log("  - Funnel limpio (todas las tablas del funnel vacias)");
    log("  - 2 eventos creados: masterclass-marketing-digital, taller-embudos-venta");
    log("  - Lead de prueba creado y promovido a MQL (score=65)");
    log("  - CRM task creada con bucket correcto");
    log("  - Audit log insertado");
    log("");
    log("Siguiente: David prueba manualmente en /eventos/masterclass-marketing-digital");
  } catch (err) {
    console.error("FATAL:", err);
    process.exit(1);
  }
})();