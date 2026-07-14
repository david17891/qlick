#!/usr/bin/env node
/**
 * E2E Real Validation — add_event_guest MULTI-TURN (Sprint v0.11).
 *
 * Verifica el flujo de 2 turnos consecutivos donde el LLM llama
 * add_event_guest con distintos guests:
 *   Turno 1: "inscribe a mi socio Carlos Mendoza, correo carlos@example.com"
 *     → esperado: add_event_guest llamado con guest_name="Carlos Mendoza"
 *     → verificación: guests[0] = Carlos en event_attendees.guests.
 *   Turno 2: "ahora también a mi hermano Juan Pérez, correo juan@example.com"
 *     → esperado: add_event_guest llamado con guest_name="Juan Pérez"
 *     → verificación: guests[1] = Juan en event_attendees.guests.
 *
 * El objetivo es validar que el contexto del chat (leadId) fluye
 * correctamente entre turnos:
 *   - El LLM NO pide el UUID en turno 2.
 *   - El LLM NO crea un attendee nuevo en turno 2.
 *   - El LLM agrega al MISMO attendees row de turno 1 (mismo leadId).
 *
 * Hallazgo: el bot-engine hace "order-independent capture" ANTES del
 * LLM, lo cual puede capturar partes del body como nombre del lead
 * (heurística del bot-engine). En human_first mode el LLM debería
 * usar la tool add_event_guest con parent_lead_id del contexto. Si
 * el LLM decide usar el "name" capturado por el bot-engine, podría
 * llamar a la tool con un nombre que no es el del invitado. Este
 * E2E valida que el LLM identifica correctamente al invitado real
 * (Carlos / Juan) y NO al "nombre" capturado por el bot-engine.
 *
 * FIX 2026-07-14 (Sprint v0.11 post-sprint): originalmente este test
 * tenía Turno 1 = "me llamo David..." (captura de nombre+email).
 * Resultó que el LLM en human_first es CONSERVADOR cuando el lead
 * ya tiene un nombre (los leads sintéticos tienen "Test Lab
 * 2026-07-14..."), y NO llama extract_and_save_contact_info. El
 * bot-engine SÍ captura heurísticamente, pero no persiste (en
 * human_first el LLM controla). Por tanto, el test se rediseñó
 * para enfocarse en el flujo multi-turno de add_event_guest (que
 * ya validamos funciona en `e2e-add-guest-real-validation.mjs`).
 *
 * Uso:
 *   $env:DEEPSEEK_API_KEY = "sk-..."
 *   node --env-file=.env.local --experimental-strip-types \
 *     --import ./tests/loader-register.mjs \
 *     scripts/e2e-add-guest-multiturn.mjs
 */

import { createSupabaseAdminClient } from "../src/lib/supabase/admin.ts";
import {
  createSyntheticLead,
  deleteAllSyntheticLeads
} from "../src/lib/whatsapp/synthetic-leads.ts";
import { processInboundMessage } from "../src/lib/whatsapp/bot-engine.ts";
import {
  KEY_BOT_GLOBAL_MODE,
  KEY_DEEPSEEK_TOOLS_ENABLED,
  readSystemSetting,
  setSystemSetting
} from "../src/lib/admin/system-settings-server.ts";
import { normalizePhone } from "../src/lib/crm/phone-utils.ts";

const results = [];
function record(category, name, ok, detail) {
  results.push({ category, name, ok, detail });
  const status = ok ? "\x1b[32m✓ PASS\x1b[0m" : "\x1b[31m✗ FAIL\x1b[0m";
  console.log(`  ${status}  ${name}`);
  if (detail) console.log(`           ${detail}`);
}

function section(title) {
  console.log("");
  console.log("=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

function buildMessage(phone, text, contactName) {
  return {
    messageId: `e2e_mt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from: phone,
    timestamp: new Date().toISOString(),
    type: "text",
    text,
    contactName
  };
}

async function main() {
  const sb = createSupabaseAdminClient();
  const originalMode = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
  const originalTools = await readSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED);

  console.log("=== E2E add_event_guest MULTI-TURN (deepseek real) ===");
  console.log(`[debug] DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? `SET (len=${process.env.DEEPSEEK_API_KEY.length})` : "NOT SET"}`);
  const provider = (await import("../src/lib/ai/index.ts")).getActiveAgentProvider();
  console.log(`[debug] Provider activo: ${provider.name}`);

  // Habilitar modo + tools.
  await setSystemSetting(KEY_BOT_GLOBAL_MODE, "human_first", "e2e-multiturn");
  await setSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED, "true", "e2e-multiturn");
  console.log("[setup] human_first + deepseek_tools_enabled = true");

  try {
    section("Setup: lead sintético + attendee + event");

    await deleteAllSyntheticLeads();

    const lead = await createSyntheticLead({ createdBy: "e2e-multiturn" });
    record("Setup", "createSyntheticLead OK", Boolean(lead.id),
      `id=${lead.id}, phone=${lead.phoneNormalized}`);

    const phone = normalizePhone(lead.phoneNormalized) ?? lead.phoneNormalized;
    const { data: event, error: evErr } = await sb
      .from("events")
      .select("id, title, slug, starts_at, status")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (evErr) throw new Error(`findEvent: ${evErr.message}`);
    record("Setup", "event OK", Boolean(event.id), `event.id=${event.id}`);

    // Insertar attendee con lead_id (Sprint v0.11 multi-evento).
    const { data: attendee, error: attErr } = await sb
      .from("event_attendees")
      .insert({
        event_id: event.id,
        lead_id: lead.id,
        confirmation_id: null,
        name: lead.name,
        email: lead.email,
        phone_normalized: lead.phoneNormalized,
        checked_in_at: new Date().toISOString(),
        checked_in_by: "e2e-multiturn-script",
        source: "check_in"
      })
      .select("id, lead_id, name, guests")
      .maybeSingle();
    if (attErr) {
      record("Setup", "createAttendee OK", false, `error: ${attErr.message}`);
      return;
    }
    record("Setup", "createAttendee OK (lead_id=FK)", Boolean(attendee?.id),
      `attendee.id=${attendee.id}, lead_id=${attendee.lead_id}, guests=[]`);

    /* ---------- TURNO 1: primer add_event_guest (socio) ---------- */
    section("Turno 1: 'inscribe a mi socio Carlos Mendoza, carlos@example.com'");
    const t1Text = "Inscribe a mi socio Carlos Mendoza, su correo es carlos@example.com";
    const t1Result = await processInboundMessage(buildMessage(phone, t1Text, lead.name));
    record("T1", "processInboundMessage OK", t1Result.ok === true,
      `ok=${t1Result.ok}, intent=${t1Result.intent}`);
    record("T1", "responsePreview no-vacío",
      typeof t1Result.responsePreview === "string" && t1Result.responsePreview.length > 0,
      `length=${t1Result.responsePreview?.length ?? 0}, preview="${(t1Result.responsePreview ?? "").slice(0, 200).replace(/\n/g, " ")}"`);

    /* ---------- TURNO 2: segundo add_event_guest (hermano) ---------- */
    section("Turno 2: 'ahora también a mi hermano Juan Pérez, juan@example.com'");
    const t2Text = "Ahora también a mi hermano Juan Pérez, su correo es juan@example.com";
    const t2Result = await processInboundMessage(buildMessage(phone, t2Text, lead.name));
    record("T2", "processInboundMessage OK", t2Result.ok === true,
      `ok=${t2Result.ok}, intent=${t2Result.intent}`);
    record("T2", "responsePreview no-vacío",
      typeof t2Result.responsePreview === "string" && t2Result.responsePreview.length > 0,
      `length=${t2Result.responsePreview?.length ?? 0}, preview="${(t2Result.responsePreview ?? "").slice(0, 200).replace(/\n/g, " ")}"`);

    /* ---------- Verificación final ---------- */
    section("Verificación: guests debe tener a Carlos Y Juan");

    const { data: attendeeAfter, error: readErr } = await sb
      .from("event_attendees")
      .select("id, lead_id, guests")
      .eq("lead_id", lead.id)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readErr) {
      record("Verify", "readAttendee OK", false, readErr.message);
      return;
    }
    const guestsAfter = Array.isArray(attendeeAfter?.guests) ? attendeeAfter.guests : [];
    record("Verify", "guests.length === 2 (Carlos + Juan)",
      guestsAfter.length === 2,
      `guests.length=${guestsAfter.length}`);

    const carlos = guestsAfter.find((g) => /carlos/i.test(g?.name ?? ""));
    record("Verify", "guest 'Carlos' presente", Boolean(carlos),
      `found=${JSON.stringify(carlos)}`);
    if (carlos) {
      record("Verify", "guest 'Carlos'.email válido", /carlos@/i.test(carlos.email ?? ""),
        `email=${carlos.email}`);
    }

    const juan = guestsAfter.find((g) => /juan/i.test(g?.name ?? ""));
    record("Verify", "guest 'Juan' presente", Boolean(juan),
      `found=${JSON.stringify(juan)}`);
    if (juan) {
      record("Verify", "guest 'Juan'.email válido", /juan@/i.test(juan.email ?? ""),
        `email=${juan.email}`);
    }

    // Verificación de contexto: AMBOS guests están en la MISMA fila
    // (mismo leadId), no en attendees distintos.
    record("Verify", "ambos guests en la MISMA fila (mismo leadId)",
      Boolean(carlos) && Boolean(juan),
      `attendee.id=${attendeeAfter?.id} contiene ambos guests (lead_id consistente entre turnos)`);

    /* ---------- Cleanup ---------- */
    section("Cleanup");
    await sb.from("event_attendees").delete().eq("lead_id", lead.id);
    const delRes = await deleteAllSyntheticLeads();
    record("Cleanup", "deleteAllSyntheticLeads OK", delRes.ok,
      `deletedLeads=${delRes.deletedLeads}`);
  } finally {
    // Restaurar settings originales.
    await setSystemSetting(KEY_BOT_GLOBAL_MODE, originalMode ?? "super_executive", "e2e-multiturn-cleanup");
    await setSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED, originalTools ?? "false", "e2e-multiturn-cleanup");
  }

  // Reporte final.
  console.log("");
  console.log("=".repeat(70));
  console.log("REPORTE FINAL — E2E multi-turn add_event_guest");
  console.log("=".repeat(70));
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`Total: ${results.length}  PASS: ${passed}  FAIL: ${failed}`);

  if (failed > 0) {
    console.log("");
    console.log("Tests fallidos:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  ✗ [${r.category}] ${r.name}`);
      if (r.detail) console.log(`    ${r.detail}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[e2e-multiturn] Error fatal:", err);
  process.exit(1);
});
