#!/usr/bin/env node
/**
 * E2E Real Validation — add_event_guest FAILURE MODE (Sprint v0.11).
 *
 * Verifica el comportamiento del bot cuando el lead pide inscribir a
 * un acompañante SIN tener fila en event_attendees:
 *   - El LLM NO debe llamar add_event_guest (la tool fallaría).
 *   - O si la llama, debe recibir error honesto y NO inventar el
 *     resultado en su respuesta.
 *   - La respuesta debe ser HONESTA: "no te encuentro registrado en
 *     este evento" o similar.
 *
 * Setup: lead sintético SIN attendee en event_attendees (no creamos
 * la fila).
 *
 * Uso:
 *   $env:DEEPSEEK_API_KEY = "sk-..."
 *   node --env-file=.env.local --experimental-strip-types \
 *     --import ./tests/loader-register.mjs \
 *     scripts/e2e-add-guest-no-attendee.mjs
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
    messageId: `e2e_noatt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

  console.log("=== E2E add_event_guest FAILURE MODE (deepseek real) ===");
  console.log(`[debug] DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? `SET (len=${process.env.DEEPSEEK_API_KEY.length})` : "NOT SET"}`);
  const provider = (await import("../src/lib/ai/index.ts")).getActiveAgentProvider();
  console.log(`[debug] Provider activo: ${provider.name}`);

  await setSystemSetting(KEY_BOT_GLOBAL_MODE, "human_first", "e2e-no-attendee");
  await setSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED, "true", "e2e-no-attendee");
  console.log("[setup] human_first + deepseek_tools_enabled = true");

  try {
    section("Setup: lead sintético SIN attendee en event_attendees");

    await deleteAllSyntheticLeads();

    const lead = await createSyntheticLead({ createdBy: "e2e-no-attendee" });
    record("Setup", "createSyntheticLead OK", Boolean(lead.id),
      `id=${lead.id}, phone=${lead.phoneNormalized}`);

    const phone = normalizePhone(lead.phoneNormalized) ?? lead.phoneNormalized;

    // Verificar que NO hay attendee para este lead.
    const { data: existingAttendees, error: attErr } = await sb
      .from("event_attendees")
      .select("id, lead_id")
      .eq("lead_id", lead.id);
    if (attErr) throw new Error(`checkAttendees: ${attErr.message}`);
    record("Setup", "0 attendees para este lead (failure mode setup)",
      existingAttendees.length === 0,
      `attendees count=${existingAttendees.length}`);

    /* ---------- Turno único: lead pide inscribir invitado sin estar registrado ---------- */
    section("Turno único: 'inscribe a mi socio Carlos Mendoza, carlos@example.com' (sin attendee)");

    const t1Text = "Inscribe también a mi socio Carlos Mendoza, su correo es carlos@example.com";
    const t1Result = await processInboundMessage(buildMessage(phone, t1Text, lead.name));
    record("T1", "processInboundMessage OK", t1Result.ok === true,
      `ok=${t1Result.ok}, intent=${t1Result.intent}`);

    /* ---------- Verificación: el LLM NO debe crear attendees falsos ---------- */
    section("Verificación: NO debe haber guest en ningún lado");

    // Re-leer attendees del lead.
    const { data: attendeesAfter } = await sb
      .from("event_attendees")
      .select("id, lead_id, guests")
      .eq("lead_id", lead.id);
    const allGuests = (attendeesAfter ?? []).flatMap((a) => Array.isArray(a.guests) ? a.guests : []);
    record("Verify", "0 guests creados (failure mode: no se inventaron attendees)",
      allGuests.length === 0,
      `total guests across all attendees: ${allGuests.length}`);

    // La respuesta del LLM debe ser HONESTA: NO debe decir "Listo, ya quedó
    // registrado Carlos" si Carlos NO fue registrado.
    const preview = t1Result.responsePreview ?? "";
    const claimsRegistered = /listo|registrado|agregad|incluido/i.test(preview) &&
                            /carlos/i.test(preview);
    record("Verify", "response NO reclama 'Carlos registrado' si NO se persistió",
      !claimsRegistered,
      `preview="${preview.slice(0, 200).replace(/\n/g, " ")}"`);

    /* ---------- Cleanup ---------- */
    section("Cleanup");
    // No attendees to delete (we never created any).
    const delRes = await deleteAllSyntheticLeads();
    record("Cleanup", "deleteAllSyntheticLeads OK", delRes.ok,
      `deletedLeads=${delRes.deletedLeads}`);
  } finally {
    await setSystemSetting(KEY_BOT_GLOBAL_MODE, originalMode ?? "super_executive", "e2e-no-attendee-cleanup");
    await setSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED, originalTools ?? "false", "e2e-no-attendee-cleanup");
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("REPORTE FINAL — E2E failure mode add_event_guest");
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
  console.error("[e2e-no-attendee] Error fatal:", err);
  process.exit(1);
});
