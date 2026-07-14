#!/usr/bin/env node
/**
 * E2E Real Validation — add_event_guest MULTI-EVENTO (Sprint v0.11).
 *
 * Verifica que cuando un lead tiene 2 attendees (en eventos distintos),
 * el add_event_guest se agrega a la inscripción MÁS RECIENTE (per
 * `checked_in_at desc limit 1`), no a la más antigua.
 *
 * Setup:
 *   - Lead sintético.
 *   - 2 attendees para el mismo lead:
 *     - Evento VIEJO: checked_in_at = 6 meses atrás.
 *     - Evento NUEVO: checked_in_at = ahora.
 *   - Ambos con guests=[].
 *
 * Verificación:
 *   - Después de "inscribe a mi socio Carlos", el guest queda en el
 *     evento NUEVO (no en el viejo).
 *   - El evento VIEJO sigue con guests=[].
 *
 * Esto valida que el `order("checked_in_at", { ascending: false })` del
 * executor `executeAddEventGuest` funciona correctamente.
 *
 * Uso:
 *   $env:DEEPSEEK_API_KEY = "sk-..."
 *   node --env-file=.env.local --experimental-strip-types \
 *     --import ./tests/loader-register.mjs \
 *     scripts/e2e-add-guest-multievent.mjs
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
    messageId: `e2e_mev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

  console.log("=== E2E add_event_guest MULTI-EVENTO (deepseek real) ===");
  console.log(`[debug] DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? `SET (len=${process.env.DEEPSEEK_API_KEY.length})` : "NOT SET"}`);
  const provider = (await import("../src/lib/ai/index.ts")).getActiveAgentProvider();
  console.log(`[debug] Provider activo: ${provider.name}`);

  await setSystemSetting(KEY_BOT_GLOBAL_MODE, "human_first", "e2e-multievent");
  await setSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED, "true", "e2e-multievent");
  console.log("[setup] human_first + deepseek_tools_enabled = true");

  try {
    section("Setup: lead + 2 attendees (evento viejo + evento nuevo)");

    await deleteAllSyntheticLeads();

    const lead = await createSyntheticLead({ createdBy: "e2e-multievent" });
    record("Setup", "createSyntheticLead OK", Boolean(lead.id),
      `id=${lead.id}`);

    const phone = normalizePhone(lead.phoneNormalized) ?? lead.phoneNormalized;

    // Necesitamos 2 eventos distintos. Si no hay 2 eventos, creamos uno.
    const { data: events } = await sb
      .from("events")
      .select("id, title, starts_at, status")
      .eq("status", "published")
      .order("starts_at", { ascending: false })
      .limit(2);
    let eventOld, eventNew;
    if (events && events.length >= 2) {
      eventNew = events[0];
      eventOld = events[1];
    } else {
      // Solo hay 1 evento, creamos uno sintético viejo.
      const slugOld = `e2e-mev-old-${Date.now()}`;
      const { data: oldEvent } = await sb
        .from("events")
        .insert({
          slug: slugOld,
          title: "E2E multi-evento OLD event",
          description: "Evento viejo para validar add_event_guest multi-evento",
          starts_at: "2026-01-01T00:00:00Z",
          ends_at: null,
          location: "CDMX",
          status: "published",
          price: 0,
          max_attendees: 100
        })
        .select("id, title")
        .maybeSingle();
      eventOld = oldEvent;
      eventNew = events?.[0] ?? null;
      // Si tampoco hay evento nuevo, crearlo.
      if (!eventNew) {
        const slugNew = `e2e-mev-new-${Date.now()}`;
        const { data: newEvent } = await sb
          .from("events")
          .insert({
            slug: slugNew,
            title: "E2E multi-evento NEW event",
            description: "Evento nuevo para validar add_event_guest multi-evento",
            starts_at: new Date().toISOString(),
            ends_at: null,
            location: "CDMX",
            status: "published",
            price: 0,
            max_attendees: 100
          })
          .select("id, title")
          .maybeSingle();
        eventNew = newEvent;
      }
    }
    record("Setup", "2 eventos distintos", Boolean(eventOld?.id && eventNew?.id && eventOld.id !== eventNew.id),
      `eventOld.id=${eventOld?.id}, eventNew.id=${eventNew?.id}`);

    // Insertar attendee VIEJO (checked_in_at = 6 meses atrás).
    const SIX_MONTHS_AGO = new Date();
    SIX_MONTHS_AGO.setMonth(SIX_MONTHS_AGO.getMonth() - 6);
    const { data: attOld, error: errOld } = await sb
      .from("event_attendees")
      .insert({
        event_id: eventOld.id,
        lead_id: lead.id,
        confirmation_id: null,
        name: lead.name,
        email: lead.email,
        phone_normalized: lead.phoneNormalized,
        checked_in_at: SIX_MONTHS_AGO.toISOString(),
        checked_in_by: "e2e-multievent-script-old",
        source: "check_in"
      })
      .select("id, lead_id, event_id, guests, checked_in_at")
      .maybeSingle();
    if (errOld) {
      record("Setup", "createAttendee OLD OK", false, `error: ${errOld.message}`);
      return;
    }
    record("Setup", "createAttendee OLD (6 meses atrás)",
      Boolean(attOld?.id),
      `id=${attOld.id}, checked_in_at=${attOld.checked_in_at}`);

    // Insertar attendee NUEVO (checked_in_at = ahora).
    const NOW = new Date();
    const { data: attNew, error: errNew } = await sb
      .from("event_attendees")
      .insert({
        event_id: eventNew.id,
        lead_id: lead.id,
        confirmation_id: null,
        name: lead.name,
        email: lead.email,
        phone_normalized: lead.phoneNormalized,
        checked_in_at: NOW.toISOString(),
        checked_in_by: "e2e-multievent-script-new",
        source: "check_in"
      })
      .select("id, lead_id, event_id, guests, checked_in_at")
      .maybeSingle();
    if (errNew) {
      record("Setup", "createAttendee NEW OK", false, `error: ${errNew.message}`);
      return;
    }
    record("Setup", "createAttendee NEW (ahora)",
      Boolean(attNew?.id),
      `id=${attNew.id}, checked_in_at=${attNew.checked_in_at}`);

    /* ---------- Turno único: lead pide inscribir invitado ---------- */
    section("Turno único: 'inscribe a mi socio Carlos Mendoza, carlos@example.com'");

    const t1Text = "Inscribe también a mi socio Carlos Mendoza, su correo es carlos@example.com";
    const t1Result = await processInboundMessage(buildMessage(phone, t1Text, lead.name));
    record("T1", "processInboundMessage OK", t1Result.ok === true,
      `ok=${t1Result.ok}, intent=${t1Result.intent}`);

    /* ---------- Verificación: Carlos en evento NUEVO, NO en viejo ---------- */
    section("Verificación: Carlos debe estar en el attendee NUEVO (no en el viejo)");

    // Re-leer ambos attendees.
    const { data: attOldAfter, error: readOldErr } = await sb
      .from("event_attendees")
      .select("id, lead_id, event_id, guests, checked_in_at")
      .eq("id", attOld.id)
      .maybeSingle();
    const { data: attNewAfter, error: readNewErr } = await sb
      .from("event_attendees")
      .select("id, lead_id, event_id, guests, checked_in_at")
      .eq("id", attNew.id)
      .maybeSingle();
    if (readOldErr || readNewErr) {
      record("Verify", "readAttendees OK", false, readOldErr?.message ?? readNewErr?.message);
      return;
    }
    const oldGuests = Array.isArray(attOldAfter?.guests) ? attOldAfter.guests : [];
    const newGuests = Array.isArray(attNewAfter?.guests) ? attNewAfter.guests : [];
    record("Verify", "attendee VIEJO sin Carlos (guests=[])",
      oldGuests.length === 0,
      `eventOld guest count=${oldGuests.length}`);
    record("Verify", "attendee NUEVO tiene a Carlos (guests.length >= 1)",
      newGuests.length >= 1,
      `eventNew guest count=${newGuests.length}`);
    const carlosInNew = newGuests.find((g) => /carlos/i.test(g?.name ?? ""));
    record("Verify", "guest 'Carlos' está en attendee NUEVO (no viejo)",
      Boolean(carlosInNew),
      `carlosInNew=${JSON.stringify(carlosInNew)}`);

    /* ---------- Cleanup ---------- */
    section("Cleanup");
    await sb.from("event_attendees").delete().in("id", [attOld.id, attNew.id]);
    const delRes = await deleteAllSyntheticLeads();
    record("Cleanup", "deleteAllSyntheticLeads OK", delRes.ok,
      `deletedLeads=${delRes.deletedLeads}`);
  } finally {
    await setSystemSetting(KEY_BOT_GLOBAL_MODE, originalMode ?? "super_executive", "e2e-multievent-cleanup");
    await setSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED, originalTools ?? "false", "e2e-multievent-cleanup");
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("REPORTE FINAL — E2E multi-evento add_event_guest");
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
  console.error("[e2e-multievent] Error fatal:", err);
  process.exit(1);
});
