#!/usr/bin/env node
// scripts/_seed-event-demo.mjs
//
// Crea data de prueba para revisar visualmente el detalle de un evento
// en /admin/eventos/[id]. Usa el evento "qa-fase4-demo" que ya creaste
// en Supabase (via SQL Editor).
//
// Lo que crea (todo con import_batch_id único, fácil de limpiar):
// - 5 confirmados (variedad de emails + phones MX)
// - 3 asistentes (2 con match contra confirmation, 1 walk-in sin match)
// - 3 encuestas (2 con consent → 1 promovido a lead, 1 sin consent → unmatched)
// - 1 lead promoted desde la encuesta con consent
// - 1 link lead_event_links
// - 1 event_survey_unmatched
//
// PRIVACIDAD: cero PII real. Todos los datos son sintéticos:
// - Emails: @example.com, @test.local
// - Phones: +52 686 XXX XXXX (formato Mexicali)
// - Nombres: nombres comunes ficticios
//
// Uso:
//   node scripts/_seed-event-demo.mjs
//
// Limpieza:
//   node scripts/_seed-event-demo.mjs --cleanup
//
// Después de correr, hard refresh en /admin/eventos y navegá al
// detalle del evento. Vas a ver:
// - Confirmados: 5 rows con nombre + email + phone
// - Asistentes: 3 rows, 2 con badge "Matcheado", 1 con "Sin match"
// - Encuestas: 3 rows, 1 con badge Sí + check de promovida, 1 con badge Sí
//   sin promover, 1 con badge No
// - Leads promovidos: 1 lead con badge Source:event + tag event:qa-fase4-demo
//   en /admin?tab=crm&leadId=...

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────
// Mini parser de .env.local (mismo patrón que _test-fase2.mjs)
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
    "❌ Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en .env.local.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EVENT_SLUG = "qa-fase4-demo";
const BATCH_ID = randomUUID();
const isCleanup = process.argv.includes("--cleanup");

// ─────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────
async function cleanup() {
  console.log(`🧹 Limpiando data de batch_id=${BATCH_ID}...`);

  // unmatched se borra por cascade desde event_surveys
  // lead_event_links hay que borrarlos antes que leads (FK)
  const { data: surveyIds } = await supabase
    .from("event_surveys")
    .select("id")
    .eq("import_batch_id", BATCH_ID);
  if (surveyIds && surveyIds.length > 0) {
    const surveyIdList = surveyIds.map((s) => s.id);
    await supabase
      .from("lead_event_links")
      .delete()
      .in("survey_id", surveyIdList);
  }

  const tables = [
    "event_attendees",
    "event_confirmations",
    "event_surveys",
  ];
  for (const t of tables) {
    const { error } = await supabase.from(t).delete().eq("import_batch_id", BATCH_ID);
    if (error) console.error(`   ${t}: ${error.message}`);
    else console.log(`   ✓ ${t}`);
  }

  // Borrar leads creados por este batch (identificables por email)
  const { data: leadsToDelete } = await supabase
    .from("leads")
    .select("id")
    .like("email", "%@qa-fase4-demo.test");
  if (leadsToDelete && leadsToDelete.length > 0) {
    const leadIds = leadsToDelete.map((l) => l.id);
    await supabase.from("lead_event_links").delete().in("lead_id", leadIds);
    const { error } = await supabase.from("leads").delete().in("id", leadIds);
    if (error) console.error(`   leads: ${error.message}`);
    else console.log(`   ✓ leads (${leadsToDelete.length})`);
  }
  console.log("✅ Cleanup completo.");
}

// ─────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────
async function seed() {
  // 1. Resolver el evento.
  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("id, slug, title")
    .eq("slug", EVENT_SLUG)
    .maybeSingle();
  if (evErr || !event) {
    console.error(
      `❌ Evento "${EVENT_SLUG}" no existe. Créalo primero desde Supabase Dashboard con el SQL del paso 2.`,
    );
    process.exit(1);
  }
  console.log(`✓ Evento encontrado: "${event.title}" (${event.id})`);
  console.log(`  Batch ID: ${BATCH_ID}\n`);

  // 2. Insertar 5 confirmados.
  console.log("📋 Insertando 5 confirmados...");
  const confirmed = [
    { name: "Ana Ramirez", email: "ana.ramirez@example.com", phone: "+52 686 123 4567" },
    { name: "Beto Cardenas", email: "beto.cardenas@example.com", phone: "+52 686 234 5678" },
    { name: "Carla Dominguez", email: "carla.dominguez@example.com", phone: "+52 686 345 6789" },
    { name: "David Esparza", email: "david.esparza@example.com", phone: "+52 686 456 7890" },
    { name: "Elena Fuentes", email: "elena.fuentes@example.com", phone: "+52 686 567 8901" },
  ];
  const { data: confirmations, error: cErr } = await supabase
    .from("event_confirmations")
    .insert(
      confirmed.map((c) => ({
        event_id: event.id,
        name: c.name,
        email: c.email,
        phone_raw: c.phone,
        phone_normalized: c.phone, // ya viene en E.164
        source: "imported_excel",
        import_batch_id: BATCH_ID,
      })),
    )
    .select("id, name, email");
  if (cErr) throw new Error(`Confirmations: ${cErr.message}`);
  console.log(`   ✓ ${confirmations.length} confirmados insertados`);

  // 3. Insertar 3 asistentes: 2 matcheados con confirmation + 1 walk-in.
  console.log("\n👥 Insertando 3 asistentes (2 con match + 1 walk-in)...");
  const attendees = [
    {
      name: "Ana Ramirez",
      email: "ana.ramirez@example.com",
      phone: "+52 686 123 4567",
      confirmationId: confirmations.find((c) => c.name === "Ana Ramirez").id,
    },
    {
      name: "Carla Dominguez",
      email: "carla.dominguez@example.com",
      phone: "+52 686 345 6789",
      confirmationId: confirmations.find((c) => c.name === "Carla Dominguez").id,
    },
    {
      name: "Frank Walk-in", // walk-in: no estaba en confirmados
      email: "frank.walkin@example.com",
      phone: "+52 686 789 0123",
      confirmationId: null,
    },
  ];
  const { data: attendeesResult, error: aErr } = await supabase
    .from("event_attendees")
    .insert(
      attendees.map((a) => ({
        event_id: event.id,
        confirmation_id: a.confirmationId,
        name: a.name,
        email: a.email,
        phone_normalized: a.phone,
        source: "imported_excel",
        import_batch_id: BATCH_ID,
        checked_in_by: "qa-bot@qlick.mx",
      })),
    )
    .select("id, name");
  if (aErr) throw new Error(`Attendees: ${aErr.message}`);
  console.log(`   ✓ ${attendeesResult.length} asistentes insertados`);

  // 4. Insertar 3 encuestas: 2 con consent + 1 sin consent.
  console.log("\n📝 Insertando 3 encuestas (2 con consent + 1 sin)...");
  const surveys = [
    {
      respondent_email: "david.esparza@example.com",
      phone: "+52 686 456 7890",
      consent: true,
      interest: "Ads en Meta, embudos",
    },
    {
      respondent_email: "elena.fuentes@example.com",
      phone: "+52 686 567 8901",
      consent: true,
      interest: "Automatización con WhatsApp",
    },
    {
      respondent_email: "beto.cardenas@example.com",
      phone: "+52 686 234 5678",
      consent: false, // va a event_survey_unmatched
      interest: null,
    },
  ];
  const { data: surveysResult, error: sErr } = await supabase
    .from("event_surveys")
    .insert(
      surveys.map((s) => ({
        event_id: event.id,
        respondent_email: s.respondent_email,
        respondent_phone: s.phone,
        phone_normalized: s.phone,
        responses: {},
        consent_to_contact: s.consent,
        commercial_interest: s.interest,
        import_batch_id: BATCH_ID,
      })),
    )
    .select("id, respondent_email, consent_to_contact");
  if (sErr) throw new Error(`Surveys: ${sErr.message}`);
  console.log(`   ✓ ${surveysResult.length} encuestas insertadas`);

  // 5. Promover 1 encuesta a lead (la primera con consent=true).
  console.log("\n🧲 Promoviendo 1 encuesta a lead...");
  const surveyToPromote = surveysResult.find((s) => s.respondent_email === "david.esparza@example.com");
  const { data: newLead, error: lErr } = await supabase
    .from("leads")
    .insert({
      name: "David Esparza",
      email: "david.esparza@qa-fase4-demo.test", // email único para cleanup
      phone: "+52 686 456 7890",
      source: "event",
      status: "new",
      intent: "course_information",
      consent_to_contact: true,
      course_of_interest: "Ads en Meta, embudos",
      tags: [`event:${event.slug}`, `event:${event.slug}:survey:${surveyToPromote.id}`],
    })
    .select("id")
    .single();
  if (lErr) throw new Error(`Lead: ${lErr.message}`);

  // Marcar survey como promovida.
  await supabase
    .from("event_surveys")
    .update({
      promoted_to_lead_id: newLead.id,
      promoted_at: new Date().toISOString(),
    })
    .eq("id", surveyToPromote.id);

  // Crear link lead ↔ survey.
  await supabase.from("lead_event_links").insert({
    lead_id: newLead.id,
    event_id: event.id,
    link_type: "survey",
    link_id: surveyToPromote.id,
  });
  console.log(`   ✓ Lead creado: ${newLead.id.slice(0, 8)}...`);
  console.log(`   ✓ Survey marcada como promovida`);
  console.log(`   ✓ Link lead_event_links creado`);

  // 6. Marcar la encuesta SIN consent como unmatched.
  console.log("\n⚠️  Marcando 1 encuesta sin consent como unmatched...");
  const surveyNoConsent = surveysResult.find((s) => s.consent_to_contact === false);
  await supabase.from("event_survey_unmatched").insert({
    survey_id: surveyNoConsent.id,
    reason: "no_consent",
  });
  console.log(`   ✓ Encuesta sin consent marcada`);

  console.log("\n════════════════════════════════════════");
  console.log("✅ Seed completo. Resumen:");
  console.log(`   5 confirmados`);
  console.log(`   3 asistentes (2 matcheados + 1 walk-in)`);
  console.log(`   3 encuestas (2 con consent + 1 sin)`);
  console.log(`   1 lead promovido desde encuesta`);
  console.log(`   1 link lead_event_links`);
  console.log(`   1 event_survey_unmatched`);
  console.log(`\n👉 Hard refresh en /admin/eventos/[id] del evento demo.`);
  console.log(`   Para limpiar después: node scripts/_seed-event-demo.mjs --cleanup`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  if (isCleanup) {
    await cleanup();
  } else {
    await seed();
  }
}

main().catch((e) => {
  console.error("\n❌ Error fatal:", e);
  process.exit(1);
});
