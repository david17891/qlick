#!/usr/bin/env node
// scripts/seed-demo.mjs
//
// Seed de datos realistas para demo / capturas / socios.
//
// PRIVACIDAD: cero PII real. Todos los datos son sintéticos.
// - Emails: @example.com o @seed-demo.test
// - Phones: +52 686/664/667 XXX XXXX
// - Nombres: nombres comunes ficticios en español
//
// Idempotente: usa upsert + tag "seed:demo" para limpieza fácil.
//
// Lo que crea:
// - 3 eventos en distintos estados (2 pasados, 1 próximo)
// - ~28 confirmados, ~16 asistentes, ~12 encuestas
// - ~9 leads promovidos desde encuestas
// - ~20 leads sueltos
// - entries de WhatsApp log + audit log (si las tablas existen)
//
// Uso:
//   node scripts/seed-demo.mjs                # crea (idempotente)
//   node scripts/seed-demo.mjs --reset        # limpia + crea
//   node scripts/seed-demo.mjs --cleanup      # solo limpia
//   node scripts/seed-demo.mjs --dry-run      # muestra plan sin escribir

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────
// Env loader
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
const SUPABASE_SECRET = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error("❌ Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en .env.local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
  // F-2026-06-28 L-2: timeout global para que queries colgadas no dejen
  // el script esperando indefinidamente.
  db: { schema: "public" },
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
    },
  },
});

const SEED_TAG = "seed:demo";
const SEED_TAG_LEAD = `${SEED_TAG}:lead`;
const SEED_TAG_AUDIT = `${SEED_TAG}:audit`;
// UUID fijo (la columna import_batch_id es de tipo uuid). Determinístico
// para que --cleanup pueda borrar este batch específico.
const SEED_BATCH_ID = "81b73693-d755-4125-aee7-e1048d5b2e6d";

const argv = process.argv.slice(2);
const isReset = argv.includes("--reset");
const isCleanup = argv.includes("--cleanup");
const isDryRun = argv.includes("--dry-run");

// ─────────────────────────────────────────────────────────────
// Schema detection — detecta qué tablas/columnas existen
// ─────────────────────────────────────────────────────────────
async function detectSchema() {
  const schema = {
    leads: { columns: new Set(), hasWhatsappStatus: false, hasLastContactedAt: false },
    lead_whatsapp_log: { exists: false },
    admin_audit_log: { columns: new Set(), hasBefore: false, hasAfter: false },
  };

  // F-2026-06-28 M-3: el fallback hardcoded anterior se activaba solo si la
  // query fallaba. Si la tabla está vacía pero existe, devolvía [] sin
  // trigger del fallback. Ahora hago INSERT-then-DELETE de una fila de
  // prueba con un marker único para garantizar la detección de columnas.
  async function detectColumns(tableName) {
    const probeId = `__schema_probe_${randomInt(0, 2 ** 32).toString(16)}__`;
    const probeData = { id: probeId, name: "schema-probe", email: `${probeId}@schema-probe.test` };
    const { data: probeInsert } = await supabase
      .from(tableName)
      .insert(probeData)
      .select()
      .maybeSingle();
    let columns;
    if (probeInsert) {
      columns = new Set(Object.keys(probeInsert));
      // Cleanup
      await supabase.from(tableName).delete().eq("id", probeId);
    } else {
      columns = new Set();
    }
    return columns;
  }

  // Detectar columnas de leads
  schema.leads.columns = await detectColumns("leads");
  if (schema.leads.columns.size === 0) {
    // Probablemente tabla vacía y el probe falló por constraint — fallback
    // conservador: solo las columnas que sabemos seguras.
    schema.leads.columns = new Set([
      "name", "email", "phone", "status", "source", "intent",
      "consent_to_contact", "tags", "summary", "estimated_value_mxn",
      "course_of_interest", "next_follow_up_at", "message", "owner_id",
      "phone_normalized", "created_at", "updated_at",
    ]);
  }
  schema.leads.hasWhatsappStatus = schema.leads.columns.has("whatsapp_status");
  schema.leads.hasLastContactedAt = schema.leads.columns.has("last_contacted_at");

  // Detectar existencia de lead_whatsapp_log
  const { error: wErr } = await supabase
    .from("lead_whatsapp_log")
    .select("id")
    .limit(1);
  schema.lead_whatsapp_log.exists = !wErr || !String(wErr.message).includes("schema cache");

  // Detectar columnas de admin_audit_log
  schema.admin_audit_log.columns = await detectColumns("admin_audit_log");
  if (schema.admin_audit_log.columns.size === 0) {
    schema.admin_audit_log.columns = new Set([
      "actor_email", "action", "entity_type", "entity_id", "metadata", "created_at",
    ]);
  }
  schema.admin_audit_log.hasBefore = schema.admin_audit_log.columns.has("before");
  schema.admin_audit_log.hasAfter = schema.admin_audit_log.columns.has("after");

  return schema;
}

// ─────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────
async function cleanup(schema) {
  console.log(`🧹 Limpiando data con tag "${SEED_TAG}"...\n`);

  // 1. Leads con tag → borra también sus links y whatsapp logs.
  const { data: seedLeads } = await supabase
    .from("leads")
    .select("id")
    .contains("tags", [SEED_TAG_LEAD]);
  if (seedLeads && seedLeads.length > 0) {
    const leadIds = seedLeads.map((l) => l.id);
    await supabase.from("lead_event_links").delete().in("lead_id", leadIds);
    console.log(`   ✓ lead_event_links (${leadIds.length} leads)`);

    if (schema.lead_whatsapp_log.exists) {
      await supabase.from("lead_whatsapp_log").delete().in("lead_id", leadIds);
      console.log(`   ✓ lead_whatsapp_log`);
    }

    const { error, count } = await supabase
      .from("leads")
      .delete({ count: "exact" })
      .in("id", leadIds);
    if (error) console.error(`   ⚠️  leads: ${error.message}`);
    else console.log(`   ✓ leads (${count ?? 0})`);
  }

  // 2. Tablas con import_batch_id (cascade borra event_survey_unmatched).
  for (const t of ["event_attendees", "event_confirmations", "event_surveys"]) {
    const { error, count } = await supabase
      .from(t)
      .delete({ count: "exact" })
      .eq("import_batch_id", SEED_BATCH_ID);
    if (error) console.error(`   ⚠️  ${t}: ${error.message}`);
    else if (count && count > 0) console.log(`   ✓ ${t} (${count})`);
  }

  // 3. Events del seed (borrar por slug).
  const seedSlugs = [
    "taller-ads-meta-abril",
    "masterclass-automatizacion-junio",
    "workshop-funnels-julio",
  ];
  let eventsDeleted = 0;
  for (const slug of seedSlugs) {
    const { count, error } = await supabase
      .from("events")
      .delete({ count: "exact" })
      .eq("slug", slug);
    if (error) {
      console.error(`   ⚠️  events ${slug}: ${error.message}`);
    } else {
      eventsDeleted += count ?? 0;
    }
  }
  if (eventsDeleted > 0) console.log(`   ✓ events (${eventsDeleted})`);

  // 4. Admin audit log del seed (matchea por metadata.seed_tag).
  const { error: aErr, count: aCount } = await supabase
    .from("admin_audit_log")
    .delete({ count: "exact" })
    .contains("metadata", { seed_tag: SEED_TAG_AUDIT });
  if (aErr) console.error(`   ⚠️  admin_audit_log: ${aErr.message}`);
  else if (aCount && aCount > 0) console.log(`   ✓ admin_audit_log (${aCount})`);

  console.log("\n✅ Cleanup completo.\n");
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const EVENTS = [
  {
    slug: "taller-ads-meta-abril",
    title: "Taller: Ads en Meta que sí convierten",
    description:
      "Taller presencial de 3 horas sobre cómo estructurar campañas en Facebook e Instagram Ads para negocios locales. Cupo limitado a 30 personas.",
    starts_at: "2026-04-15T18:00:00-07:00",
    ends_at: "2026-04-15T21:00:00-07:00",
    location: "Coworking Centinela, Mexicali",
    cover_image_url: null,
    status: "published",
  },
  {
    slug: "masterclass-automatizacion-junio",
    title: "Masterclass: Automatiza tu negocio con WhatsApp + n8n",
    description:
      "Sesión online de 90 minutos donde mostramos cómo conectar WhatsApp Business con n8n para automatizar respuestas, seguimiento de leads y reportes.",
    starts_at: "2026-06-10T19:00:00-07:00",
    ends_at: "2026-06-10T20:30:00-07:00",
    location: "Online (Zoom)",
    cover_image_url: null,
    status: "published",
  },
  {
    slug: "workshop-funnels-julio",
    title: "Workshop: Embudos de venta para infoproductores",
    description:
      "Workshop práctico donde construimos un embudo completo: landing → email → venta. Trae tu laptop.",
    starts_at: "2026-07-22T17:00:00-07:00",
    ends_at: "2026-07-22T20:00:00-07:00",
    location: "Hotel Lucerna, Tijuana",
    cover_image_url: null,
    status: "published",
  },
];

const NAMES = [
  "Ana Ramírez", "Beto Cárdenas", "Carla Domínguez", "David Esparza",
  "Elena Fuentes", "Frank Gómez", "Gabriela Herrera", "Hugo Ibarra",
  "Inés Jaramillo", "Javier López", "Karen Martínez", "Luis Mendoza",
  "María Núñez", "Néstor Ojeda", "Olga Pérez", "Pablo Quintero",
  "Querétaro Ramírez", "Ricardo Sánchez", "Sofía Treviño", "Tomás Urías",
  "Úrsula Velasco", "Víctor Wong", "Ximena Yáñez", "Yago Zúñiga",
  "Zoe Aguirre", "Andrés Beltrán", "Brenda Cordero", "Carlos Delgado",
];

const CITIES_PHONE = ["686", "664", "661", "667"];

const COURSE_INTERESTS = [
  "Ads en Meta, embudos",
  "Automatización con WhatsApp",
  "Email marketing",
  "Embudos de venta",
  "n8n y automatizaciones",
  "Branding para negocios locales",
  "Community management",
  "Tráfico pago",
  "Analítica y dashboards",
  "Curso completo de marketing",
];

const SOURCES = [
  "website",
  "whatsapp",
  "facebook_ads",
  "instagram_ads",
  "referral",
  "event",
  "manual",
  "organic",
];

const LEAD_STATUSES = [
  "new",
  "contacted",
  "interested",
  "info_requested",
  "payment_pending",
  "enrolled",
  "active_student",
  "lost",
];

const WHATSAPP_STATUSES = [
  "no_contactado",
  "contactado",
  "interested",
  "lost",
];

// Helpers.
// F-2026-06-28 M-1: pickOne antes era determinístico (arr[i % length]); ahora
// usa crypto.randomInt para variedad real entre leads del seed.
function pickOne(arr) {
  if (arr.length === 0) return undefined;
  return arr[randomInt(0, arr.length)];
}
// Versión determinística de pickOne cuando queremos reproducibilidad (ej. el
// mismo nombre debe mapear al mismo course_of_interest entre corridas).
function pickOneDeterministic(arr, i) {
  if (arr.length === 0) return undefined;
  return arr[i % arr.length];
}

// F-2026-06-28 L-4: emailFromName con sufijo + counter para garantizar
// unicidad incluso cuando dos leads tienen el mismo nombre normalizado.
const _emailCounters = new Map();
function emailFromName(name, i) {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ".");
  const key = slug;
  const seen = _emailCounters.get(key) ?? 0;
  _emailCounters.set(key, seen + 1);
  // Sufijo incluye tanto el índice del loop (i) como el counter de duplicados
  // (seen) para evitar colisiones cuando dos leads comparten nombre.
  return seen === 0
    ? `${slug}.${i}@example.com`
    : `${slug}.${i}.${seen}@example.com`;
}

function phone(i) {
  const city = pickOneDeterministic(CITIES_PHONE, i);
  const last4 = String(1000 + (i * 137) % 9000).padStart(4, "0");
  return `+52 ${city} ${100 + (i * 73) % 900} ${last4}`;
}
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// F-2026-06-28 M-2: shuffle determinístico-pero-variado via PRNG sembrado.
// Cada evento (evIdx) tiene su propia semilla para que los asistentes
// matcheados varíen entre eventos.
function seededShuffle(arr, seed) {
  const out = [...arr];
  // Linear congruential generator (suficiente para mezclar).
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────
async function seed(schema) {
  console.log("🌱 Seed demo: creando data sintética realista...\n");

  if (schema.leads.hasWhatsappStatus) {
    console.log("✓ Detectado: leads.whatsapp_status (migration 20260628 aplicada)");
  } else {
    console.log("⚠️  No detectado: leads.whatsapp_status (migration 20260628 NO aplicada)");
    console.log("   → Seed funcionará sin status de WhatsApp en leads.");
    console.log("   → Aplicá la migration 20260628000000_whatsapp_followup.sql para tener WhatsApp status.");
  }
  if (schema.lead_whatsapp_log.exists) {
    console.log("✓ Detectado: tabla lead_whatsapp_log");
  } else {
    console.log("⚠️  No detectado: tabla lead_whatsapp_log (migration 20260628 NO aplicada)");
  }
  if (schema.admin_audit_log.hasBefore && schema.admin_audit_log.hasAfter) {
    console.log("✓ Detectado: admin_audit_log.before/after (migration 20260629 aplicada)");
  } else {
    console.log("⚠️  No detectado: admin_audit_log.before/after (migration 20260629 NO aplicada)");
    console.log("   → Diff snapshots se guardarán en metadata.");
  }
  console.log("");

  if (isReset) {
    console.log("⚠️  --reset activado: limpiando data previa del seed...\n");
    await cleanup(schema);
  }

  // ─── 1. Eventos
  console.log("📅 Insertando 3 eventos...");
  const eventRows = EVENTS.map((e) => ({
    slug: e.slug,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    location: e.location,
    cover_image_url: e.cover_image_url,
    status: e.status,
  }));
  // F-2026-06-28 M-11: antes `ignoreDuplicates: false` sobrescribía cambios
  // manuales de David en eventos del seed (ej. título editado). Ahora
  // hacemos MERGE: insertamos solo si no existe (preserva ediciones
  // manuales). Para actualizar todos los campos, usar --reset primero.
  const { data: events, error: evErr } = await supabase
    .from("events")
    .upsert(eventRows, { onConflict: "slug", ignoreDuplicates: true })
    .select("id, slug, title, starts_at, status");
  if (evErr) throw new Error(`Events: ${evErr.message}`);
  console.log(`   ✓ ${events.length} eventos (preserva ediciones manuales)\n`);

  let totalConfirmations = 0;
  let totalAttendees = 0;
  let totalSurveys = 0;
  const leadsToInsert = [];

  for (let evIdx = 0; evIdx < events.length; evIdx++) {
    const ev = events[evIdx];
    const evSlug = ev.slug;
    const evPast = new Date(ev.starts_at) < new Date();

    console.log(`📋 Evento ${evIdx + 1}/${events.length}: "${ev.title}"`);

    // ─── Confirmados
    const confirmCount = evPast ? 10 + (evIdx % 3) : 8 + (evIdx % 4);
    const confirmations = [];
    for (let i = 0; i < confirmCount; i++) {
      const name = pickOneDeterministic(NAMES, evIdx * 13 + i);
      confirmations.push({
        event_id: ev.id,
        name,
        email: emailFromName(name, evIdx * 100 + i),
        phone_raw: phone(evIdx * 100 + i),
        phone_normalized: phone(evIdx * 100 + i),
        source: i < 6 ? "imported_excel" : i < 8 ? "public_form" : "manual",
        import_batch_id: SEED_BATCH_ID,
        confirmed_at: daysAgo(30 + i),
      });
    }
    // Idempotencia: filtrar confirmados que ya existen (por email en este evento).
    const { data: existingConfirmations } = await supabase
      .from("event_confirmations")
      .select("email")
      .eq("event_id", ev.id)
      .eq("import_batch_id", SEED_BATCH_ID);
    const existingEmails = new Set((existingConfirmations ?? []).map((c) => c.email));
    const newConfirmations = confirmations.filter((c) => !existingEmails.has(c.email));
    let confRows = existingConfirmations ?? [];
    if (newConfirmations.length > 0) {
      const { data, error: cErr } = await supabase
        .from("event_confirmations")
        .insert(newConfirmations)
        .select("id, name, email, phone_normalized");
      if (cErr) throw new Error(`Confirmations ${evSlug}: ${cErr.message}`);
      confRows = [...confRows, ...data];
    }
    totalConfirmations += confRows.length;
    console.log(`   ✓ ${confRows.length} confirmados (${newConfirmations.length} nuevos)`);

    // ─── Asistentes (solo eventos pasados)
    if (!evPast) {
      console.log(`   ⏭️  Saltando asistentes (evento próximo)\n`);
    } else {
      const attendeeCount = Math.floor(confRows.length * 0.7) + 1;
      const attendees = [];
      // F-2026-06-28 M-2: el "shuffle" anterior era determinístico-pero-trampa
      // (Math.sin(evIdx) siempre da el mismo número). Ahora uso un PRNG
      // sembrado por evIdx para que cada evento tenga asistentes
      // matcheados distintos pero reproducibles.
      const shuffled = seededShuffle(confRows, evIdx * 7919 + 31);
      const matchCount = Math.floor(attendeeCount * 0.75);
      for (let i = 0; i < attendeeCount; i++) {
        if (i < matchCount) {
          const c = shuffled[i];
          attendees.push({
            event_id: ev.id,
            confirmation_id: c.id,
            name: c.name,
            email: c.email,
            phone_normalized: c.phone_normalized,
            source: "check_in",
            import_batch_id: SEED_BATCH_ID,
            checked_in_at: new Date(ev.starts_at).toISOString(),
            checked_in_by: "staff@qlick.mx",
          });
        } else {
          const wname = pickOneDeterministic(NAMES, evIdx * 50 + i + 30);
          attendees.push({
            event_id: ev.id,
            confirmation_id: null,
            name: wname,
            email: emailFromName(wname, evIdx * 200 + i + 100),
            phone_normalized: phone(evIdx * 200 + i + 100),
            source: "check_in",
            import_batch_id: SEED_BATCH_ID,
            checked_in_at: new Date(ev.starts_at).toISOString(),
            checked_in_by: "staff@qlick.mx",
          });
        }
      }
      // Idempotencia: filtrar asistentes existentes (por email en este evento).
      const { data: existingAttendees } = await supabase
        .from("event_attendees")
        .select("email, id")
        .eq("event_id", ev.id)
        .eq("import_batch_id", SEED_BATCH_ID);
      const existingAttEmails = new Set((existingAttendees ?? []).filter((a) => a.email).map((a) => a.email));
      const newAttendees = attendees.filter((a) => !existingAttEmails.has(a.email));
      let attRows = existingAttendees ?? [];
      if (newAttendees.length > 0) {
        const { data, error: aErr } = await supabase
          .from("event_attendees")
          .insert(newAttendees)
          .select("id");
        if (aErr) throw new Error(`Attendees ${evSlug}: ${aErr.message}`);
        attRows = [...attRows, ...data];
      }
      totalAttendees += attRows.length;
      console.log(`   ✓ ${attRows.length} asistentes (${matchCount} matcheados + ${attendeeCount - matchCount} walk-in)`);
    }

    // ─── Encuestas (solo eventos pasados)
    if (!evPast) continue;

    let surveyRows;
    const { count: existingSurveys } = await supabase
      .from("event_surveys")
      .select("*", { count: "exact", head: true })
      .eq("event_id", ev.id)
      .eq("import_batch_id", SEED_BATCH_ID);

    if (existingSurveys && existingSurveys > 0) {
      const { data, error } = await supabase
        .from("event_surveys")
        .select("id, respondent_email, consent_to_contact, commercial_interest, submitted_at")
        .eq("event_id", ev.id)
        .eq("import_batch_id", SEED_BATCH_ID);
      if (error) throw new Error(`Surveys read ${evSlug}: ${error.message}`);
      surveyRows = data;
      console.log(`   ⏭️  Encuestas: ${existingSurveys} ya existen (skip)`);
    } else {
      const surveyCount = 4 + (evIdx % 3);
      const surveys = [];
      const surveyUnmatched = [];
      for (let i = 0; i < surveyCount; i++) {
        const hasConsent = i < Math.floor(surveyCount * 0.7);
        const c = confRows[i % confRows.length];
        const interest = hasConsent ? pickOneDeterministic(COURSE_INTERESTS, evIdx * 7 + i) : null;
        surveys.push({
          event_id: ev.id,
          confirmation_id: c.id,
          respondent_email: c.email,
          respondent_phone: c.phone_normalized,
          phone_normalized: c.phone_normalized,
          responses: {
            rating: 4 + ((evIdx + i) % 2),
            would_recommend: (evIdx + i) % 3 !== 0,
            comments: hasConsent ? "Muy útil, ya quiero implementar lo aprendido." : null,
          },
          consent_to_contact: hasConsent,
          commercial_interest: interest,
          import_batch_id: SEED_BATCH_ID,
          submitted_at: daysAgo(20 - i),
        });
        if (!hasConsent) surveyUnmatched.push(interest);
      }
      const { data, error: sErr } = await supabase
        .from("event_surveys")
        .insert(surveys)
        .select("id, respondent_email, consent_to_contact, commercial_interest, submitted_at");
      if (sErr) throw new Error(`Surveys ${evSlug}: ${sErr.message}`);
      surveyRows = data;

      // Marcar encuestas sin consent como unmatched.
      for (const surveyRow of surveyRows) {
        if (!surveyRow.consent_to_contact) {
          await supabase.from("event_survey_unmatched").insert({
            survey_id: surveyRow.id,
            reason: "no_consent",
          });
        }
      }
    }
    totalSurveys += surveyRows.length;
    console.log(`   ✓ ${surveyRows.length} encuestas (${surveyRows.filter((s) => s.consent_to_contact).length} con consent)`);

    // ─── Promover encuestas con consent a leads.
    const surveysWithConsent = surveyRows.filter((s) => s.consent_to_contact);
    const { data: existingPromotions } = await supabase
      .from("leads")
      .select("id")
      .contains("tags", [SEED_TAG_LEAD, `event:${evSlug}`]);

    if (existingPromotions && existingPromotions.length >= Math.min(3, surveysWithConsent.length)) {
      console.log(`   ⏭️  Leads promovidos: ${existingPromotions.length} ya existen (skip)`);
    } else {
      const start = existingPromotions?.length ?? 0;
      for (let i = start; i < Math.min(3, surveysWithConsent.length); i++) {
        const survey = surveysWithConsent[i];
        const confirmation = confRows.find((c) => c.email === survey.respondent_email);
        if (!confirmation) continue;
        const leadRow = {
          name: confirmation.name,
          email: confirmation.email.replace("@example.com", "@seed-demo.test"),
          phone: confirmation.phone_normalized,
          source: "event",
          status: i === 0 ? "contacted" : i === 1 ? "interested" : "new",
          intent: "course_information",
          consent_to_contact: true,
          course_of_interest: survey.commercial_interest ?? "Marketing digital",
          tags: [SEED_TAG_LEAD, `event:${evSlug}`],
          summary: i === 0
            ? "Confirmó asistencia + encuesta con interés comercial en " + (survey.commercial_interest ?? "marketing")
            : "Promovido desde encuesta post-evento.",
          estimated_value_mxn: 4500 + (evIdx * 1000) + (i * 500),
          created_at: survey.submitted_at ?? daysAgo(20),
        };
        // Solo incluir whatsapp_status / last_contacted_at si las columnas existen.
        if (schema.leads.hasWhatsappStatus) {
          leadRow.whatsapp_status = pickOneDeterministic(WHATSAPP_STATUSES, evIdx + i);
        }
        if (schema.leads.hasLastContactedAt) {
          leadRow.last_contacted_at = i === 0 ? daysAgo(5) : null;
        }
        leadsToInsert.push({ leadRow, surveyId: survey.id, eventId: ev.id, eventSlug: evSlug });
      }
    }
    console.log("");
  }

  // ─── 2. Insertar leads promovidos desde encuestas
  console.log(`🧲 Insertando ${leadsToInsert.length} leads promovidos desde encuestas...`);
  const newLeadIds = new Map();
  // F-2026-06-28 M-4: consolidamos la query de leads del seed en una sola
  // carga al inicio. Antes había dos queries idénticas a `leads` con filtro
  // `tags contains [SEED_TAG_LEAD]` en puntos distintos del script.
  const { data: allSeedLeads } = await supabase
    .from("leads")
    .select("id, email, tags")
    .contains("tags", [SEED_TAG_LEAD]);
  const existingByEmail = new Map((allSeedLeads ?? []).map((l) => [l.email, l.id]));
  for (const { leadRow, surveyId, eventId } of leadsToInsert) {
    let leadId = existingByEmail.get(leadRow.email);
    if (!leadId) {
      const { data: newLead, error: lErr } = await supabase
        .from("leads")
        .insert(leadRow)
        .select("id")
        .single();
      if (lErr) {
        console.warn(`   ⚠️  Lead ${leadRow.email}: ${lErr.message}`);
        continue;
      }
      leadId = newLead.id;
      existingByEmail.set(leadRow.email, leadId);
    }
    newLeadIds.set(leadRow.email, leadId);

    await supabase
      .from("event_surveys")
      .update({ promoted_to_lead_id: leadId, promoted_at: new Date().toISOString() })
      .eq("id", surveyId);

    // Link lead ↔ survey (idempotente: si ya existe, lo dejamos).
    const { data: existingLink } = await supabase
      .from("lead_event_links")
      .select("id")
      .eq("lead_id", leadId)
      .eq("link_type", "survey")
      .eq("link_id", surveyId)
      .maybeSingle();
    if (!existingLink) {
      await supabase.from("lead_event_links").insert({
        lead_id: leadId,
        event_id: eventId,
        link_type: "survey",
        link_id: surveyId,
      });
    }
  }
  console.log(`   ✓ ${newLeadIds.size} leads promovidos\n`);

  // ─── 3. Leads sueltos
  console.log(`👤 Insertando leads sueltos...`);
  const standaloneLeads = [];
  for (let i = 0; i < 20; i++) {
    const name = pickOneDeterministic(NAMES, 500 + i);
    const statusIdx = i % LEAD_STATUSES.length;
    const status = LEAD_STATUSES[statusIdx];
    const source = pickOneDeterministic(SOURCES, i + 3);
    const row = {
      name,
      email: emailFromName(name, 1000 + i).replace("@example.com", "@seed-demo.test"),
      phone: phone(1000 + i),
      source,
      status,
      intent: pickOneDeterministic(
        ["course_information", "enroll_course", "pricing", "schedule_call", "course_recommendation"],
        i,
      ),
      consent_to_contact: i % 4 !== 0,
      course_of_interest: pickOneDeterministic(COURSE_INTERESTS, i + 5),
      tags: [SEED_TAG_LEAD, `source:${source}`],
      summary:
        status === "lost"
          ? "No respondió tras 3 follow-ups. Cerrado como perdido."
          : status === "interested"
            ? "Interesado en " + pickOneDeterministic(COURSE_INTERESTS, i + 5) + ". Esperando confirmación de pago."
            : null,
      estimated_value_mxn:
        status === "lost" || status === "archived" ? null : 3000 + (i % 5) * 1500,
      next_follow_up_at:
        status === "new" || status === "contacted" || status === "interested"
          ? daysFromNow(1 + (i % 7))
          : null,
      created_at: daysAgo(2 + (i % 30)),
    };
    if (schema.leads.hasWhatsappStatus) {
      const ws =
        status === "enrolled" || status === "active_student"
          ? null
          : pickOneDeterministic(WHATSAPP_STATUSES, i + 7);
      row.whatsapp_status = ws;
    }
    if (schema.leads.hasLastContactedAt) {
      row.last_contacted_at =
        schema.leads.hasWhatsappStatus && row.whatsapp_status && row.whatsapp_status !== "no_contactado"
          ? daysAgo(1 + (i % 14))
          : null;
    }
    standaloneLeads.push(row);
  }
  // F-2026-06-28 M-4: reusamos `allSeedLeads` ya cargado arriba (en lugar
  // de hacer una segunda query idéntica). Filtramos los que NO son
  // promovidos (sin tag `event:*`).
  const existingStandaloneEmails = new Set(
    (allSeedLeads ?? [])
      .filter((l) => !(l.tags ?? []).some((t) => t.startsWith("event:")))
      .map((l) => l.email),
  );
  const newStandalone = standaloneLeads.filter((l) => !existingStandaloneEmails.has(l.email));
  let standaloneCount = newStandalone.length;
  if (newStandalone.length > 0) {
    const { error: slErr } = await supabase
      .from("leads")
      .insert(newStandalone)
      .select("id, email");
    if (slErr) throw new Error(`Standalone leads: ${slErr.message}`);
  }
  console.log(`   ✓ ${standaloneCount} leads sueltos nuevos (${existingStandaloneEmails.size} ya existían)\n`);

  // ─── 4. Lead WhatsApp log (solo si la tabla existe).
  let whatsappInserted = 0;
  if (schema.lead_whatsapp_log.exists) {
    console.log(`💬 Insertando entries de WhatsApp log...`);
    // Idempotencia: si ya hay entries del seed, no insertar de nuevo.
    const { count: existingWhatsapp } = await supabase
      .from("lead_whatsapp_log")
      .select("*", { count: "exact", head: true })
      .contains("metadata", { seed_tag: SEED_TAG });
    if (existingWhatsapp && existingWhatsapp > 0) {
      console.log(`   ⏭️  WhatsApp log: ${existingWhatsapp} entries del seed ya existen (skip)`);
    } else {
      const allLeadIds = [
        ...newLeadIds.values(),
        ...(allSeedLeads ?? []).map((l) => l.id),
      ];
      const whatsappEntries = [];
      for (let i = 0; i < Math.min(20, allLeadIds.length); i++) {
        const leadId = allLeadIds[i];
        const status = pickOne(
          WHATSAPP_STATUSES.filter((s) => s !== "no_contactado"),
        );
        const prev = i > 0 ? WHATSAPP_STATUSES[i % WHATSAPP_STATUSES.length] : null;
        whatsappEntries.push({
          lead_id: leadId,
          event_id: events[i % events.length].id,
          new_status: status,
          prev_status: prev,
          actor_email: "david@qlick.mx",
          message_preview: `Hola! Soy David de Qlick. Vi tu interés en ${pickOneDeterministic(COURSE_INTERESTS, i)}. ¿Te cuento más?`,
          metadata: {
            seed_tag: SEED_TAG,
            channel: "whatsapp_manual",
            follow_up_number: 1 + (i % 3),
          },
          created_at: daysAgo(i % 30),
        });
      }
      const { data: wLogs, error: wErr } = await supabase
        .from("lead_whatsapp_log")
        .insert(whatsappEntries)
        .select("id");
      if (wErr) {
        console.warn(`   ⚠️  WhatsApp log: ${wErr.message}`);
      } else {
        whatsappInserted = wLogs.length;
        console.log(`   ✓ ${whatsappInserted} entries\n`);
      }
    }
  }

  // ─── 5. Admin audit log.
  console.log(`📜 Insertando entries de admin_audit_log...`);
  // Idempotencia: si ya hay entries del seed, no duplicar.
  let auditEntriesCount = 0;
  const { count: existingAuditEntries } = await supabase
    .from("admin_audit_log")
    .select("*", { count: "exact", head: true })
    .contains("metadata", { seed_tag: SEED_TAG_AUDIT });
  if (existingAuditEntries && existingAuditEntries > 0) {
    auditEntriesCount = existingAuditEntries;
    console.log(`   ⏭️  Audit log: ${existingAuditEntries} entries del seed ya existen (skip)`);
  } else {
    const allLeadIds = [
      ...newLeadIds.values(),
      ...(allSeedLeads ?? []).map((l) => l.id),
    ];
    const auditEntries = [];
    const auditActions = [
      { action: "event_create", entity_type: "event" },
      { action: "event_update", entity_type: "event" },
      { action: "event_status_change", entity_type: "event" },
      { action: "event_clone", entity_type: "event" },
      { action: "lead_status_change", entity_type: "lead" },
      { action: "lead_whatsapp_status_change", entity_type: "lead" },
      { action: "survey_reviewed", entity_type: "survey" },
      { action: "lead_note_added", entity_type: "lead" },
    ];
    for (let i = 0; i < 25; i++) {
      const a = pickOneDeterministic(auditActions, i);
      const eventId = events[i % events.length].id;
      const leadId = allLeadIds[i % allLeadIds.length];
      const entityId = a.entity_type === "event" ? eventId : leadId;
      const isStatusChange = a.action.includes("status_change");
      const beforeVal = isStatusChange ? pickOneDeterministic(["new", "contacted", "interested"], i) : null;
      const afterVal = isStatusChange ? pickOneDeterministic(["contacted", "interested", "payment_pending"], i + 1) : null;
      const entry = {
        actor_email: i % 4 === 0 ? "ana@qlick.mx" : "david@qlick.mx",
        action: a.action,
        entity_type: a.entity_type,
        entity_id: entityId,
        metadata: {
          seed_tag: SEED_TAG_AUDIT,
          note: `Audit entry #${i + 1} generado por seed`,
        },
        created_at: daysAgo(i % 14),
      };
      // Si la tabla tiene las columnas before/after (migration 20260629),
      // las usamos. Si no, las guardamos en metadata.
      if (schema.admin_audit_log.hasBefore) {
        entry.before = beforeVal ? { status: beforeVal } : null;
      }
      if (schema.admin_audit_log.hasAfter) {
        entry.after = afterVal ? { status: afterVal } : null;
      }
      if (!schema.admin_audit_log.hasBefore && beforeVal) {
        entry.metadata.before = { status: beforeVal };
      }
      if (!schema.admin_audit_log.hasAfter && afterVal) {
        entry.metadata.after = { status: afterVal };
      }
      auditEntries.push(entry);
    }
    const { data: aLogs, error: aErr } = await supabase
      .from("admin_audit_log")
      .insert(auditEntries)
      .select("id");
    if (aErr) throw new Error(`Audit log: ${aErr.message}`);
    auditEntriesCount = aLogs.length;
    console.log(`   ✓ ${aLogs.length} entries\n`);
  }

  // ─── Resumen
  console.log("════════════════════════════════════════");
  console.log("✅ Seed completo. Resumen:\n");
  console.log(`   📅 ${events.length} eventos`);
  console.log(`   📋 ${totalConfirmations} confirmados`);
  console.log(`   ✅ ${totalAttendees} asistentes`);
  console.log(`   📝 ${totalSurveys} encuestas`);
  console.log(`   🧲 ${newLeadIds.size} leads promovidos desde encuestas`);
  console.log(`   👤 ${standaloneCount} leads sueltos (esta corrida)`);
  console.log(`   💬 ${whatsappInserted} entries de WhatsApp log`);
  console.log(`   📜 ${auditEntriesCount} entries de audit log`);
  console.log("\n👉 Hard refresh en /admin/eventos para ver los cards.");
  console.log("   Para limpiar: npm run seed:demo:cleanup");
  console.log("   Para reset completo: npm run seed:demo:reset");
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  if (isDryRun) {
    console.log("🔍 Dry run: mostrando plan sin escribir a la DB\n");
    console.log(`Insertaría:`);
    console.log(`   - ${EVENTS.length} eventos`);
    console.log(`   - ~28 confirmados`);
    console.log(`   - ~16 asistentes`);
    console.log(`   - ~10 encuestas`);
    console.log(`   - ~9 leads promovidos`);
    console.log(`   - ~20 leads sueltos`);
    console.log(`   - ~20 entries de WhatsApp log (si la tabla existe)`);
    console.log(`   - ~25 entries de audit log`);
    console.log("\nCorre sin --dry-run para aplicar.");
    return;
  }

  const schema = await detectSchema();

  if (isCleanup) {
    await cleanup(schema);
    return;
  }
  await seed(schema);
}

main().catch((e) => {
  console.error("\n❌ Error fatal:", e.message ?? e);
  process.exit(1);
});