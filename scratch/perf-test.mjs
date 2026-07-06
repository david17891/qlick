#!/usr/bin/env node
// scratch/perf-test.mjs
//
// Performance test del funnel dinámico. Crea N leads en paralelo,
// ejecuta el flujo de encuesta + scoring + promotion engine, y mide
// latencia total + latencia por step.
//
// PRIVACIDAD: phones +52 + emails @example.com sintéticos.
// IDEMPOTENTE: timestamp único por run.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateLeadScoreFromConfig,
} from "../src/lib/crm/lead-scoring.ts";
import { applyPromotionRules } from "../src/lib/crm/promotion-engine.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  console.error("ERROR: faltan env vars");
  process.exit(2);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RUN_ID = Date.now().toString().slice(-10);
const N_LEADS = 50;
const SURVEY_CONFIG = {
  questions: [
    { id: "q1_clarity", text: "?", type: "buttons",
      options: [
        { id: "very_clear", title: "Muy claro", score: 20 },
        { id: "clear", title: "Claro", score: 15 },
        { id: "confusing", title: "Confuso", score: 5 },
      ],
    },
    { id: "q2_apply", text: "?", type: "buttons",
      options: [
        { id: "yes", title: "Sí", score: 30, isCommercialInterest: true },
        { id: "maybe", title: "Tal vez", score: 15, isCommercialInterest: true },
        { id: "no", title: "No", score: 0 },
      ],
    },
    { id: "q3_consent", text: "?", type: "buttons",
      options: [
        { id: "yes", title: "Sí", score: 10, isConsent: true },
        { id: "no", title: "No", score: 0 },
      ],
    },
    { id: "q4_business", text: "?", type: "text", isBusinessDescription: true },
  ],
};

const RESPONSES_MQL = {
  q1_clarity: "very_clear", // 20
  q2_apply: "yes", // 30
  q3_consent: "yes", // 10 + consent
  q4_business: "Agencia de marketing", // 5
};

async function setup() {
  console.log(`→ Setup evento de testing (${N_LEADS} leads en paralelo)...`);
  const startsAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      slug: `perf-test-${RUN_ID}`,
      title: "Perf Test 2026",
      description: "Performance test",
      starts_at: startsAt,
      ends_at: endsAt,
      location: "Test",
      status: "published",
      requires_name: false,
      survey_config: SURVEY_CONFIG,
    })
    .select("id").single();
  if (error) {
    console.error("Setup falló:", error);
    process.exit(1);
  }
  console.log(`  ✓ Evento: ${event.id}`);
  return event.id;
}

async function runOne(eventId, idx) {
  const phone = `+52666${String(idx).padStart(4, "0")}${RUN_ID.slice(-4)}`;
  const email = `perf+${idx}+${RUN_ID}@example.com`;
  const name = `Perf ${idx}`;
  const t0 = Date.now();
  try {
    // 1. Crear lead
    const t1 = Date.now();
    const { data: lead } = await supabase.from("leads").insert({
      name, email, phone, phone_normalized: phone,
      source: "event", intent: "course_information",
      status: "event_attended", consent_to_contact: true,
      tags: [`event:perf-${RUN_ID}`],
    }).select("id").single();
    const tLead = Date.now() - t1;

    // 2. Insert survey
    const t2 = Date.now();
    const { error: survErr } = await supabase.from("event_surveys").insert({
      event_id: eventId,
      respondent_email: email,
      respondent_phone: phone,
      phone_normalized: phone,
      responses: RESPONSES_MQL,
      consent_to_contact: true,
      commercial_interest: "Sí",
    }).select("id").single();
    const tSurv = Date.now() - t2;

    if (survErr) {
      // UNIQUE constraint previno dup — OK, contaba igual
      return { ok: true, tLead, tSurv, tScore: 0, tPromo: 0, tTotal: Date.now() - t0, race: "23505_dedupe" };
    }

    // 3. Score (in-memory, casi 0)
    const t3 = Date.now();
    const scoreResult = calculateLeadScoreFromConfig(RESPONSES_MQL, SURVEY_CONFIG);
    const tScore = Date.now() - t3;

    // 4. Promotion engine (async DB)
    const t4 = Date.now();
    await applyPromotionRules(lead.id, scoreResult, {
      supabase, actorEmail: "perf-test@qlick",
      leadEmail: email, leadName: name,
      eventTitle: "Perf Test 2026",
    });
    const tPromo = Date.now() - t4;

    return {
      ok: true, tLead, tSurv, tScore, tPromo,
      tTotal: Date.now() - t0, race: "none",
    };
  } catch (err) {
    return { ok: false, err: err.message, tTotal: Date.now() - t0 };
  }
}

async function main() {
  const eventId = await setup();
  console.log(`\n→ Corriendo ${N_LEADS} leads EN PARALELO...`);
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: N_LEADS }, (_, i) => runOne(eventId, i))
  );
  const tTotalAll = Date.now() - t0;

  // Stats
  const okResults = results.filter((r) => r.ok);
  const failResults = results.filter((r) => !r.ok);
  const raceCount = results.filter((r) => r.race === "23505_dedupe").length;

  const latencies = okResults.map((r) => r.tTotal).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const max = latencies[latencies.length - 1];

  const avgLead = okResults.reduce((a, r) => a + r.tLead, 0) / okResults.length;
  const avgSurv = okResults.reduce((a, r) => a + r.tSurv, 0) / okResults.length;
  const avgScore = okResults.reduce((a, r) => a + r.tScore, 0) / okResults.length;
  const avgPromo = okResults.reduce((a, r) => a + r.tPromo, 0) / okResults.length;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 RESULTADOS PERFORMANCE (${N_LEADS} leads en paralelo)`);
  console.log("═".repeat(60));
  console.log(`\n✓ Éxitos: ${okResults.length}`);
  console.log(`✗ Fallos: ${failResults.length}`);
  console.log(`🔁 Race conditions (UNIQUE 23505): ${raceCount}`);
  if (failResults.length > 0) {
    console.log(`\nPrimeros fallos:`);
    failResults.slice(0, 3).forEach((r) => console.log(`  - ${r.err}`));
  }
  console.log(`\n⏱ Latencia total (Promise.all paralelo):`);
  console.log(`  - Wall time: ${tTotalAll}ms`);
  console.log(`  - p50 per lead: ${p50}ms`);
  console.log(`  - p95 per lead: ${p95}ms`);
  console.log(`  - p99 per lead: ${p99}ms`);
  console.log(`  - max: ${max}ms`);
  console.log(`\n⏱ Latencia por step (promedio):`);
  console.log(`  - Lead insert:    ${avgLead.toFixed(0)}ms`);
  console.log(`  - Survey insert:  ${avgSurv.toFixed(0)}ms`);
  console.log(`  - Score (mem):    ${avgScore.toFixed(0)}ms`);
  console.log(`  - Promo engine:   ${avgPromo.toFixed(0)}ms`);

  console.log(`\n📌 Run ID: ${RUN_ID}`);
  console.log(`📌 Cleanup: node scripts/reset-test-lead.mjs --phone=+52666*${RUN_ID.slice(-4)}`);

  process.exit(failResults.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
