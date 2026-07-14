#!/usr/bin/env node
/**
 * E2E Real Validation — add_event_guest tool (Sprint v0.10 post-E2E #3).
 *
 * Verifica que el flujo completo de la tool `add_event_guest` persiste
 * correctamente el array JSONB `guests` en `event_attendees` cuando el
 * LLM (DeepSeek real) la llama.
 *
 * Pasos:
 *   1. Activa `human_first` en `system_settings` + tools.
 *   2. Crea un lead sintético con `createSyntheticLead`.
 *   3. Crea una fila en `event_attendees` con `lead_id = leadId` (modelo
 *      multi-evento de Sprint v0.11, migration
 *      `20260714120000_event_attendees_lead_id_fk.sql`). El `id` de
 *      la fila es un PK independiente (gen_random_uuid()), no el UUID
 *      del lead.
 *   4. Crea un evento si no existe (mínimo: 1 evento activo).
 *   5. Procesa UN turno con body "inscribe también a mi socio Carlos
 *      Mendoza, correo carlos.socio@example.com".
 *   6. Verifica que el LLM emitió `add_event_guest` y que el JSONB
 *      `guests` en event_attendees se actualizó.
 *   7. Limpia: borra la fila de event_attendees (por lead_id) y el lead.
 *
 * Nota: este script NO está pensado para correr en CI/CD — requiere
 * la DEEPSEEK_API_KEY real en process.env. Solo para verificación
 * end-to-end con la API key de David.
 *
 * Uso:
 *   $env:DEEPSEEK_API_KEY = "sk-..."
 *   node --env-file=.env.local --experimental-strip-types \
 *     --import ./tests/loader-register.mjs \
 *     scripts/e2e-add-guest-real-validation.mjs
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

/* ------------------------------------------------------------------ */
/*  Helpers de reporting                                                */
/* ------------------------------------------------------------------ */

const results = [];
function record(category, name, ok, detail) {
  results.push({ category, name, ok, detail });
  const status = ok ? "✓ PASS" : "✗ FAIL";
  const color = ok ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  console.log(`  ${color}${status}${reset}  ${name}`);
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
    messageId: `e2e_guest_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    from: phone,
    timestamp: new Date().toISOString(),
    type: "text",
    text,
    contactName
  };
}

/* ------------------------------------------------------------------ */
/*  Setup: lead sintético + attendee row + event mínimo               */
/* ------------------------------------------------------------------ */

async function findOrCreateEvent(sb) {
  // Buscar un evento existente (cualquiera, la primera).
  const { data, error } = await sb
    .from("events")
    .select("id, title, slug, starts_at, status")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`findOrCreateEvent: ${error.message}`);
  }
  if (data) return data;

  // Si no hay eventos, crear uno mínimo.
  const slug = `e2e-guest-${Date.now()}`;
  const { data: created, error: createErr } = await sb
    .from("events")
    .insert({
      slug,
      title: "E2E add_event_guest test event",
      description: "Evento de prueba para validar add_event_guest tool",
      starts_at: new Date().toISOString(),
      ends_at: null,
      location: "CDMX",
      status: "published",
      price: 0,
      max_attendees: 100
    })
    .select("id, title, slug, starts_at, status")
    .maybeSingle();
  if (createErr) {
    throw new Error(`createEvent: ${createErr.message}`);
  }
  return created;
}

async function main() {
  const sb = createSupabaseAdminClient();
  const originalMode = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
  const originalTools = await readSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED);

  console.log("=== E2E add_event_guest (deepseek real) ===");
  console.log(`[debug] DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? `SET (len=${process.env.DEEPSEEK_API_KEY.length})` : "NOT SET"}`);
  const provider = (await import("../src/lib/ai/index.ts")).getActiveAgentProvider();
  console.log(`[debug] Provider activo: ${provider.name}`);
  console.log(`Modo original: ${JSON.stringify(originalMode)}`);
  console.log(`Tools original: ${JSON.stringify(originalTools)}`);

  // Habilitar modo + tools.
  await setSystemSetting(KEY_BOT_GLOBAL_MODE, "human_first", "e2e-add-guest");
  await setSystemSetting(KEY_DEEPSEEK_TOOLS_ENABLED, "true", "e2e-add-guest");
  console.log("[setup] human_first + deepseek_tools_enabled = true");

  try {
    section("Setup: lead + attendee + event");

    // Limpiar sintéticos residuales.
    await deleteAllSyntheticLeads();

    const lead = await createSyntheticLead({
      createdBy: "e2e-add-guest"
    });
    record("Setup", "createSyntheticLead OK", Boolean(lead.id),
      `id=${lead.id}, phone=${lead.phoneNormalized}`);

    const phone = normalizePhone(lead.phoneNormalized) ?? lead.phoneNormalized;
    const event = await findOrCreateEvent(sb);
    record("Setup", "event OK", Boolean(event.id), `event.id=${event.id}, title=${event.title}`);

    // Insertar attendee con `lead_id = leadId` (Sprint v0.11 multi-evento).
    // Ya NO usamos el workaround de v0.10 (id = leadId). Ahora el
    // modelo es 1:N (1 lead puede tener N filas de event_attendees,
    // una por evento), gracias a la migration
    // `20260714120000_event_attendees_lead_id_fk.sql` que agregó
    // la columna `lead_id` con FK a `leads(id)`. El executor
    // `executeAddEventGuest` busca por `lead_id OR id` con
    // `checked_in_at desc limit 1`, así que la inscripción más
    // reciente del lead es la que recibe al acompañante.
    const { data: attendee, error: attErr } = await sb
      .from("event_attendees")
      .insert({
        event_id: event.id,
        lead_id: lead.id, // multi-evento: FK a leads, no id = leadId
        confirmation_id: null,
        name: lead.name,
        email: lead.email,
        phone_normalized: lead.phoneNormalized,
        checked_in_at: new Date().toISOString(),
        checked_in_by: "e2e-add-guest-script",
        source: "check_in"
      })
      .select("id, lead_id, name, guests")
      .maybeSingle();
    if (attErr) {
      record("Setup", "createAttendee OK", false, `error: ${attErr.message}`);
      return;
    }
    record("Setup", "createAttendee OK (id=leadId)", Boolean(attendee?.id),
      `attendee.id=${attendee.id}, guests=[]`);

    // Verificar guests inicial está vacío.
    const initialGuests = Array.isArray(attendee.guests) ? attendee.guests : [];
    record("Setup", "guests inicial = []", initialGuests.length === 0,
      `guests.length=${initialGuests.length}`);

    section("Turno: 'inscribe a mi socio Carlos Mendoza, carlos.socio@example.com'");

    const t1Text = "Inscribe también a mi socio Carlos Mendoza, su correo es carlos.socio@example.com";
    const t1Result = await processInboundMessage(
      buildMessage(phone, t1Text, lead.name)
    );
    record("Turno", "processInboundMessage OK", t1Result.ok === true,
      `ok=${t1Result.ok}, intent=${t1Result.intent}`);
    record("Turno", "intent = question", t1Result.intent === "question",
      `intent=${t1Result.intent}`);
    record("Turno", "responsePreview no-vacío",
      typeof t1Result.responsePreview === "string" &&
        t1Result.responsePreview.length > 0,
      `length=${t1Result.responsePreview?.length ?? 0}, preview="${(t1Result.responsePreview ?? "").slice(0, 120).replace(/\n/g, " ")}"`);

    section("Verificación final: event_attendees.guests debe tener a Carlos");

    // Releer la fila del attendee (Sprint v0.11 multi-evento: por
    // lead_id, no por id).
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
    const guestsAfter = Array.isArray(attendeeAfter?.guests)
      ? attendeeAfter.guests
      : [];
    record("Verify", "guests.length >= 1", guestsAfter.length >= 1,
      `guests.length=${guestsAfter.length}`);

    if (guestsAfter.length > 0) {
      const carlos = guestsAfter.find(
        (g) => typeof g?.name === "string" && /carlos/i.test(g.name)
      );
      record("Verify", "guest con 'carlos' en name", Boolean(carlos),
        `found=${JSON.stringify(carlos)}`);

      if (carlos) {
        record("Verify", "guest.email presente y válido",
          typeof carlos.email === "string" && /carlos\.socio/i.test(carlos.email),
          `email=${carlos.email}`);
        record("Verify", "guest.id presente (UUID)",
          typeof carlos.id === "string" && /^[0-9a-f-]{36}$/i.test(carlos.id),
          `id=${carlos.id}`);
        record("Verify", "guest.added_at presente (ISO)",
          typeof carlos.added_at === "string",
          `added_at=${carlos.added_at}`);
      }
    }

    // Verificar que la conversación outbound se persistió.
    const { data: convs, error: convErr } = await sb
      .from("lead_whatsapp_conversations")
      .select("id, direction, body")
      .eq("lead_id", lead.id)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1);
    if (!convErr && convs && convs.length > 0) {
      record("Verify", "outbound persistido",
        /socio|Carlos/i.test(convs[0].body ?? ""),
        `body="${(convs[0].body ?? "").slice(0, 100).replace(/\n/g, " ")}"`);
    }

    section("Cleanup: borrar attendee + lead sintético");

    // Borrar attendee (Sprint v0.11 multi-evento: por lead_id).
    const { error: delAttErr } = await sb
      .from("event_attendees")
      .delete()
      .eq("lead_id", lead.id);
    record("Cleanup", "deleteAttendee OK", !delAttErr,
      delAttErr ? `error: ${delAttErr.message}` : "attendee borrado");

    // Borrar todos los sintéticos (incluye el lead).
    const delRes = await deleteAllSyntheticLeads();
    record("Cleanup", "deleteAllSyntheticLeads OK", delRes.ok,
      `deletedLeads=${delRes.deletedLeads}`);
  } finally {
    // Restaurar settings originales.
    await setSystemSetting(KEY_BOT_GLOBAL_MODE, originalMode ?? "super_executive", "e2e-add-guest-cleanup");
    await setSystemSetting(
      KEY_DEEPSEEK_TOOLS_ENABLED,
      originalTools ?? "false",
      "e2e-add-guest-cleanup"
    );
  }

  // Reporte final.
  console.log("");
  console.log("=".repeat(70));
  console.log("REPORTE FINAL");
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
  console.error("[e2e-add-guest] Error fatal:", err);
  process.exit(1);
});
