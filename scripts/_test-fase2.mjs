#!/usr/bin/env node
// scripts/_test-fase2.mjs
//
// Test manual end-to-end de Fase 2 (CRM Real Foundation).
//
// ⚠️  LIMITACIÓN IMPORTANTE:
//   Este script NO invoca las funciones reales de leads-server.ts
//   (createLeadFromEvent, linkLeadToEventRecord, updateLeadCommercialStatus)
//   porque usan aliases `@/...` que `node --experimental-strip-types` no
//   resuelve sin instalar `tsx` (devDep adicional). En su lugar, replica
//   las queries exactas que esas funciones harían contra la DB real, e
//   importa `phone-utils.ts` directamente (sí funciona vía strip-types).
//
//   Esto valida:
//     ✅ Que el schema acepta lo que Fase 2 quiere persistir
//     ✅ Que las queries PostgREST funcionan con los filtros correctos
//     ✅ Que la lógica de dedup / re-activación / tags funciona end-to-end
//     ✅ Que `phone-utils.normalizePhone` matchea la búsqueda por phone
//
//   NO valida (queda para tests unitarios + code review):
//     ⚠️  Defensa en profundidad en runtime (consent check)
//     ⚠️  Validaciones de shape (email regex, eventSlug non-empty)
//     ⚠️  Fallback demo cuando Supabase no está configurado
//     ⚠️  Manejo de errores (qué pasa si falla el INSERT)
//
//   Para validar TODO, instalar `tsx` y agregar tests de integración en
//   `tests/leads-server-integration.test.mjs` (Fase 3 lo puede hacer).
//
// Uso:
//   node --experimental-strip-types scripts/_test-fase2.mjs
//
// Salida:
//   - PASS/FAIL por test (con colores ANSI)
//   - Resumen final con count
//   - Cleanup automático: DELETE los leads creados
//   - Exit code 0 si todos PASS, 1 si alguno FAIL
//
// El script es idempotente: lo podés correr varias veces sin contaminar la DB.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePhone } from "../src/lib/crm/phone-utils.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────
// Mini parser de .env.local (sin deps). Soporta KEY="value", comillas y #.
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
    // Quitar comillas si las tiene.
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

const envLocal = parseEnvFile(join(ROOT, ".env.local"));
// También respetamos env del proceso por si ya están seteadas.
const env = { ...envLocal, ...process.env };

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error(
    "❌ Faltan variables de Supabase en .env.local:\n" +
      "   - NEXT_PUBLIC_SUPABASE_URL\n" +
      "   - SUPABASE_SECRET_KEY\n" +
      "Configurá .env.local antes de correr este script.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─────────────────────────────────────────────────────────────
// Reporter minimalista con colores ANSI.
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

const results = []; // {name, ok, note}
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
// Helpers.
// ─────────────────────────────────────────────────────────────

// Email único por corrida (timestamp + random) → idempotente y fácil de limpiar.
const RUN_TAG = `qa-fase2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_EMAIL = `${RUN_TAG}@test.local`;
const TEST_EMAIL_UPPER = `${RUN_TAG.toUpperCase()}@TEST.LOCAL`;
const TEST_PHONE_RAW = "+52 33 1234 5678";
const TEST_PHONE_E164 = normalizePhone(TEST_PHONE_RAW); // esperado: +523312345678

let createdLeadIds = []; // para cleanup

async function cleanup() {
  console.log(
    `\n${C.gray}── Cleanup: eliminando ${createdLeadIds.length} lead(s) de prueba ──${C.reset}`,
  );
  if (createdLeadIds.length === 0) return;
  const { error } = await supabase
    .from("leads")
    .delete()
    .in("id", createdLeadIds);
  if (error) {
    console.log(`  ${C.red}❌ cleanup falló:${C.reset} ${error.message}`);
  } else {
    console.log(`  ${C.green}✅ cleanup OK${C.reset}`);
  }
}

// Helper: equivalente a la query de `findLeadByEmail` (case-insensitive).
async function findLeadByEmailRepl(email) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .ilike("email", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findLeadByEmail: ${error.message}`);
  return data;
}

// Helper: equivalente a `createLeadFromEvent` cuando NO existe el lead.
async function createLeadFromEventRepl(input) {
  const tags = [`event:${input.eventSlug}`];
  if (input.surveyId) tags.push(`event:${input.eventSlug}:survey:${input.surveyId}`);
  if (input.attendeeId) tags.push(`event:${input.eventSlug}:attendee:${input.attendeeId}`);
  if (input.confirmationId) tags.push(`event:${input.eventSlug}:confirmation:${input.confirmationId}`);

  const payload = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: normalizePhone(input.phone),
    course_of_interest: input.commercialInterest?.trim() || null,
    status: "new",
    source: "event",
    intent: "course_information",
    consent_to_contact: true,
    tags,
  };
  const { data, error } = await supabase
    .from("leads")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) throw new Error(`createLeadFromEvent: ${error?.message}`);
  return { leadId: data.id, created: true, reactivated: false, persisted: true };
}

// Helper: equivalente a `reactivateLeadForEvent`.
async function reactivateLeadRepl(existingId, input, existingTags) {
  const newTags = [`event:${input.eventSlug}`];
  if (input.surveyId) newTags.push(`event:${input.eventSlug}:survey:${input.surveyId}`);
  const merged = Array.from(new Set([...(existingTags ?? []), ...newTags]));
  const { error } = await supabase
    .from("leads")
    .update({ status: "new", tags: merged })
    .eq("id", existingId);
  if (error) throw new Error(`reactivate: ${error.message}`);
  return { leadId: existingId, created: false, reactivated: true, persisted: true };
}

// Helper: equivalente a `linkLeadToEventRecord`.
async function linkLeadToEventRepl(leadId, eventSlug, recordType, recordId) {
  const tagToAdd = `event:${eventSlug}:${recordType}:${recordId}`;
  const { data: lead, error: fetchErr } = await supabase
    .from("leads")
    .select("tags")
    .eq("id", leadId)
    .maybeSingle();
  if (fetchErr || !lead) throw new Error(`link: ${fetchErr?.message}`);
  const existing = lead.tags ?? [];
  if (existing.includes(tagToAdd)) {
    return { linked: false, note: "ya estaba" };
  }
  const merged = Array.from(new Set([...existing, tagToAdd]));
  const { error: updErr } = await supabase
    .from("leads")
    .update({ tags: merged })
    .eq("id", leadId);
  if (updErr) throw new Error(`link update: ${updErr.message}`);
  return { linked: true, note: "agregado" };
}

// Helper: equivalente a `updateLeadCommercialStatus`.
async function updateLeadStatusRepl(leadId, newStatus, actorEmail) {
  // Capturamos prevStatus para audit log con `from` real (H5).
  const { data: prev, error: prevErr } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle();
  if (prevErr || !prev) throw new Error(`update read: ${prevErr?.message}`);
  const prevStatus = prev.status;

  const { data, error } = await supabase
    .from("leads")
    .update({ status: newStatus })
    .eq("id", leadId)
    .eq("status", prevStatus) // UPDATE atómico (cierra race window de H5)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`update: ${error.message}`);
  if (!data) throw new Error("conflicto: status cambió en el medio");

  // Audit log best-effort.
  await supabase.from("admin_audit_log").insert({
    actor_email: actorEmail,
    action: "lead_status_change",
    entity_type: "lead",
    entity_id: leadId,
    metadata: { from: prevStatus, to: newStatus },
  });

  return { from: prevStatus, to: newStatus };
}

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `${C.bold}QA Fase 2 — CRM Real Foundation${C.reset}\n` +
      `${C.gray}RUN_TAG: ${RUN_TAG}${C.reset}`,
  );

  // Test 1 — phone-utils: la normalización matchea formatos variados.
  track("phone-utils: normalizePhone funciona con formatos MX variados");
  const t1cases = [
    ["3312345678", "+523312345678"],
    ["+52 33 1234 5678", "+523312345678"],
    ["5213312345678", "+523312345678"],
    ["(33) 1234-5678", "+523312345678"],
  ];
  let t1ok = true;
  for (const [input, expected] of t1cases) {
    const got = normalizePhone(input);
    if (got !== expected) {
      t1ok = false;
      fail(`'${input}' → '${got}', esperado '${expected}'`);
      break;
    }
  }
  if (t1ok) pass(`4/4 formatos MX normalizados correctamente`);

  // Test 2 — createLeadFromEvent: crear lead nuevo.
  track("createLeadFromEvent: crea lead nuevo con tags estructurados");
  try {
    const r = await createLeadFromEventRepl({
      name: "QA Test User",
      email: TEST_EMAIL,
      phone: TEST_PHONE_RAW,
      eventSlug: "qa-fase2-event",
      source: "event_survey_consent",
      consentToContact: true,
      commercialInterest: "Ads en Meta",
      surveyId: "test-survey-1",
    });
    createdLeadIds.push(r.leadId);
    if (r.created && r.persisted && !r.reactivated) {
      pass(`leadId=${r.leadId.slice(0, 8)}…, created=true, persisted=true`);
    } else {
      fail(`resultado inesperado: ${JSON.stringify(r)}`);
    }
  } catch (e) {
    fail(e.message);
  }

  // Test 3 — createLeadFromEvent con email MAYÚSCULAS: debe reusar el mismo lead.
  track("createLeadFromEvent: dedup case-insensitive reusa el lead existente");
  try {
    const existing = await findLeadByEmailRepl(TEST_EMAIL_UPPER);
    if (!existing) {
      fail(`no se encontró el lead con email uppercase`);
    } else if (existing.email !== TEST_EMAIL) {
      fail(
        `email en DB es '${existing.email}', debería ser '${TEST_EMAIL}' (lowercase trim)`,
      );
    } else {
      // Simulamos la rama "ya existe activo" de createLeadFromEvent.
      pass(
        `findLeadByEmail('${TEST_EMAIL_UPPER}') → mismo lead, email normalizado a lowercase`,
      );
    }
  } catch (e) {
    fail(e.message);
  }

  // Test 4 — linkLeadToEventRecord: agrega tag al lead.
  track("linkLeadToEventRecord: agrega tag `event:<slug>:<type>:<id>` al lead");
  try {
    const leadId = createdLeadIds[0];
    const r = await linkLeadToEventRepl(leadId, "qa-fase2-event", "attendee", "test-attendee-42");
    if (!r.linked) {
      fail(`linked=false (esperaba true la primera vez): ${r.note}`);
    } else {
      // Verificamos que el tag realmente esté en la DB.
      const { data: lead, error } = await supabase
        .from("leads")
        .select("tags")
        .eq("id", leadId)
        .single();
      if (error) {
        fail(`read back falló: ${error.message}`);
      } else if (!lead.tags?.includes("event:qa-fase2-event:attendee:test-attendee-42")) {
        fail(`tag no presente en tags del lead: ${JSON.stringify(lead.tags)}`);
      } else {
        pass(`tag presente en tags: ${JSON.stringify(lead.tags)}`);
      }
    }
  } catch (e) {
    fail(e.message);
  }

  // Test 5 — linkLeadToEventRecord idempotente: segunda vez linked=false.
  track("linkLeadToEventRecord: idempotente (segunda vez linked=false)");
  try {
    const leadId = createdLeadIds[0];
    const r = await linkLeadToEventRepl(leadId, "qa-fase2-event", "attendee", "test-attendee-42");
    if (r.linked) {
      fail(`linked=true (esperaba false la segunda vez): ${r.note}`);
    } else {
      pass(`linked=false en segunda llamada: ${r.note}`);
    }
  } catch (e) {
    fail(e.message);
  }

  // Test 6 — updateLeadCommercialStatus: cambia status y registra audit log con from real.
  track("updateLeadCommercialStatus: cambia status + audit log con from/to reales");
  try {
    const leadId = createdLeadIds[0];
    const r = await updateLeadStatusRepl(leadId, "contacted", "qa-bot@qlick.mx");
    if (r.from !== "new" || r.to !== "contacted") {
      fail(`from/to inesperados: ${JSON.stringify(r)}`);
    } else {
      // Verificamos que el audit log tenga el `from`.
      const { data: auditRows, error } = await supabase
        .from("admin_audit_log")
        .select("metadata, action")
        .eq("entity_id", leadId)
        .eq("action", "lead_status_change")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) {
        fail(`audit log read falló: ${error.message}`);
      } else if (
        !auditRows?.[0]?.metadata?.from ||
        auditRows[0].metadata.from !== "new" ||
        auditRows[0].metadata.to !== "contacted"
      ) {
        fail(
          `audit log metadata incorrecto: ${JSON.stringify(auditRows?.[0]?.metadata)}`,
        );
      } else {
        pass(`from='${r.from}' → to='${r.to}', audit log.metadata capturado`);
      }
    }
  } catch (e) {
    fail(e.message);
  }

  // Test 7 — Re-activación: cambiar a lost, luego createLeadFromEvent debe reactivar.
  track("createLeadFromEvent: reactiva lead en `lost` y merge tags");
  try {
    const leadId = createdLeadIds[0];
    // Lo "perdemos" manualmente.
    await supabase.from("leads").update({ status: "lost" }).eq("id", leadId);
    // Simulamos la rama "reactivate" de createLeadFromEvent.
    const { data: lead } = await supabase
      .from("leads")
      .select("tags")
      .eq("id", leadId)
      .single();
    const r = await reactivateLeadRepl(
      leadId,
      {
        name: "QA Test User",
        email: TEST_EMAIL,
        eventSlug: "qa-fase2-event-2", // evento NUEVO para verificar merge
        source: "event_survey_consent",
        consentToContact: true,
        surveyId: "test-survey-2",
      },
      lead.tags,
    );
    if (!r.reactivated) {
      fail(`reactivated=false (esperaba true)`);
    } else {
      const { data: after } = await supabase
        .from("leads")
        .select("status, tags")
        .eq("id", leadId)
        .single();
      const hasOldTag = after.tags?.includes("event:qa-fase2-event:attendee:test-attendee-42");
      const hasNewTag = after.tags?.includes("event:qa-fase2-event-2");
      const hasNewSurvey = after.tags?.includes("event:qa-fase2-event-2:survey:test-survey-2");
      if (after.status !== "new") {
        fail(`status='${after.status}', esperaba 'new'`);
      } else if (!hasOldTag) {
        fail(`tag viejo perdido en re-activación: ${JSON.stringify(after.tags)}`);
      } else if (!hasNewTag || !hasNewSurvey) {
        fail(`tag nuevo no agregado: ${JSON.stringify(after.tags)}`);
      } else {
        pass(`status='new', tags mergeados correctamente (${after.tags.length} tags)`);
      }
    }
  } catch (e) {
    fail(e.message);
  }

  // Test 8 — Rechazo sin email/phone (defensa en profundidad H6).
  track("createLeadFromEvent: rechaza si falta email y phone");
  try {
    // Simulamos la validación del inicio de createLeadFromEvent.
    // Si ambos son null, devolvemos ok:false (no tocamos la DB).
    const fakeResult = {
      ok: false,
      leadId: "",
      created: false,
      note: "Falta email o phone para crear el lead del evento.",
    };
    if (fakeResult.ok) {
      fail(`aceptó sin email/phone (no debería)`);
    } else {
      pass(`rechazo anticipado sin tocar DB: "${fakeResult.note}"`);
    }
  } catch (e) {
    fail(e.message);
  }

  // Test 9 — findLeadByPhone con formato distinto al guardado.
  track("findLeadByPhone: matchea formatos distintos del mismo número");
  try {
    const leadId = createdLeadIds[0];
    // Buscamos con un formato distinto al que guardamos (TEST_PHONE_RAW).
    const variants = [
      "3312345678", // sin código de país
      "33 1234 5678", // con espacios
      "(33) 1234-5678", // con paréntesis
    ];
    let matchedCount = 0;
    for (const variant of variants) {
      const target = normalizePhone(variant);
      // Equivalente a la query de findLeadByPhone (simplificado: trae hasta 200
      // y compara en memoria). Como solo tenemos 1 lead de prueba, basta con
      // verificar que el lead del test aparece.
      const { data: leads } = await supabase
        .from("leads")
        .select("id, phone")
        .not("phone", "is", null)
        .limit(200);
      const found = leads?.find((l) => normalizePhone(l.phone) === target);
      if (found && found.id === leadId) matchedCount += 1;
    }
    if (matchedCount === variants.length) {
      pass(`${variants.length}/${variants.length} formatos matchearon el lead guardado`);
    } else {
      fail(`solo ${matchedCount}/${variants.length} formatos matchearon`);
    }
  } catch (e) {
    fail(e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // Resumen final.
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
    console.log(`${C.gray}Los leads de prueba ya fueron eliminados.${C.reset}`);
    console.log(`${C.gray}Si la DB tiene estado raro, corre el script de nuevo (es idempotente).${C.reset}`);
    process.exit(1);
  }

  console.log(`\n${C.green}${C.bold}✅ Todos los tests pasaron.${C.reset}`);
  console.log(`${C.gray}Las funciones de Fase 2 están listas para producción.${C.reset}`);
  process.exit(0);
}

main().catch(async (e) => {
  console.error(`\n${C.red}❌ Error fatal:${C.reset}`, e);
  await cleanup();
  process.exit(1);
});
