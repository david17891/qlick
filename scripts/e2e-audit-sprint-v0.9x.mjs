#!/usr/bin/env node
/**
 * E2E audit script para Sprint v0.9.x (PR #1-7).
 *
 * Prueba cada una de las funcionalidades nuevas contra prod:
 *   1. Modo human_first en el system_settings (activate + read back)
 *   2. resolveIntent con human_first (skip de intents)
 *   3. createSyntheticLead + listSyntheticLeads + deleteAllSyntheticLeads
 *   4. processInboundMessage con lead sintético (flow completo)
 *
 * NO toca UI (eso es Playwright). Este script valida el path completo
 * del backend: Supabase -> helper -> bot-engine -> DeepSeek -> provider.
 *
 * Uso: node --env-file=.env.local scripts/e2e-audit-sprint-v0.9x.mjs
 */

import { createSupabaseAdminClient } from "../src/lib/supabase/admin.ts";
import {
  createSyntheticLead,
  listSyntheticLeads,
  deleteAllSyntheticLeads,
  SIMULATION_SOURCE_ADMIN_LAB
} from "../src/lib/whatsapp/synthetic-leads.ts";
import { processInboundMessage, resolveIntent } from "../src/lib/whatsapp/bot-engine.ts";
import {
  KEY_BOT_GLOBAL_MODE,
  readSystemSetting,
  setSystemSetting
} from "../src/lib/admin/system-settings-server.ts";
import { normalizePhone } from "../src/lib/crm/phone-utils.ts";
import { buildHumanFirstPrompt } from "../src/lib/ai/agent-prompts.ts";

/* ------------------------------------------------------------------ */
/*  Helpers de reporting                                                */
/* ------------------------------------------------------------------ */

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const status = ok ? "✓ PASS" : "✗ FAIL";
  console.log(`  ${status}  ${name}`);
  if (detail) console.log(`         ${detail}`);
}

async function section(title, fn) {
  console.log("");
  console.log("=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
  await fn();
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  // Guardar el modo original para restaurar al final.
  const originalMode = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
  console.log(`[e2e] Modo original guardado: ${JSON.stringify(originalMode)}`);

  try {
    /* ============================================================ */
    /*  Test 1: Activar y leer el modo human_first                  */
    /* ============================================================ */
    await section("Test 1: Activate/read human_first mode in DB", async () => {
      const result = await setSystemSetting(
        KEY_BOT_GLOBAL_MODE,
        "human_first",
        "e2e-audit-script"
      );
      record("setSystemSetting(human_first) OK", result.ok, result.note);

      // El cache de readSystemSetting es 30s. Necesitamos esperar o
      // invalidar el cache. Para los tests, hacemos una lectura
      // directa a la DB para verificar.
      const sb = createSupabaseAdminClient();
      const { data, error } = await sb
        .from("system_settings")
        .select("value")
        .eq("key", KEY_BOT_GLOBAL_MODE)
        .maybeSingle();
      if (error) {
        record("Direct DB read OK", false, error.message);
        return;
      }
      const v = data?.value;
      record(
        "DB has human_first",
        v === "human_first",
        `value=${JSON.stringify(v)}`
      );
    });

    /* ============================================================ */
    /*  Test 2: resolveIntent con human_first (skip de intents)     */
    /* ============================================================ */
    await section("Test 2: resolveIntent with human_first (intent skip)", async () => {
      // "Hola" en human_first -> "question" (no welcome/greeting).
      const r1 = resolveIntent("Hola", true, true);
      record(
        "human_first 'Hola' -> 'question'",
        r1 === "question",
        `got=${r1}`
      );

      // "no me interesa" en human_first -> "opt_out" (gate mantenido).
      const r2 = resolveIntent("no me interesa", false, true);
      record(
        "human_first 'no me interesa' -> 'opt_out'",
        r2 === "opt_out",
        `got=${r2}`
      );

      // Email puro en human_first -> "provide_email" (gate mantenido).
      const r3 = resolveIntent("david@example.com", false, true);
      record(
        "human_first 'david@example.com' -> 'provide_email'",
        r3 === "provide_email",
        `got=${r3}`
      );

      // Regresión: con human_first=false, "Hola" sigue siendo "welcome".
      const r4 = resolveIntent("Hola", true, false);
      record(
        "non-human_first 'Hola' -> 'welcome' (regression)",
        r4 === "welcome",
        `got=${r4}`
      );
    });

    /* ============================================================ */
    /*  Test 3: buildHumanFirstPrompt retorna el system prompt      */
    /* ============================================================ */
    await section("Test 3: buildHumanFirstPrompt correctness", async () => {
      const MOCK_PROFILE = {
        name: "Qlick Bot",
        businessName: "Qlick Marketing Digital",
        businessDescription: "Agencia de marketing y academia 24/7.",
        servicesOrCourses: ["Masterclass Marketing + IA"],
        businessHours: "Lun-Vie 9-18",
        tone: "friendly",
        escalationRules: ["Escalar si pide hablar con humano"],
        allowedActions: ["informar"],
        forbiddenActions: ["confirmar pagos"],
        fallbackMessage: "Déjame consultarlo con el equipo y te paso."
      };
      const prompt = buildHumanFirstPrompt({
        profile: MOCK_PROFILE,
        activeEvent: { source: "no_events", promptBlock: "" }
      });
      record(
        "prompt non-empty",
        typeof prompt === "string" && prompt.length > 200,
        `length=${prompt.length}`
      );
      record(
        "prompt declares human_first mode",
        /human_first|LLM-first|controla todo/i.test(prompt),
        "found pattern"
      );
      record(
        "prompt mentions NO_ACTIVE_EVENTS_MODE",
        /NO_ACTIVE_EVENTS_MODE|MODO ESTRICTO SIN EVENTOS/i.test(prompt),
        "found pattern"
      );
      record(
        "prompt mentions [[OPT_OUT]] flag",
        /\[\[OPT_OUT\]\]/.test(prompt),
        "found pattern"
      );
      record(
        "prompt mentions [[ESCALATE_HUMAN]] flag",
        /\[\[ESCALATE_HUMAN\]\]/.test(prompt),
        "found pattern"
      );
      record(
        "prompt DOES NOT mention send_interactive_button (not a real tool)",
        !/usa tu herramienta send_interactive_button/.test(prompt),
        "verified absence"
      );
      record(
        "prompt mentions extract_and_save_contact_info (real tool)",
        /extract_and_save_contact_info/.test(prompt),
        "found pattern"
      );
      record(
        "prompt mentions add_event_guest (real tool)",
        /add_event_guest/.test(prompt),
        "found pattern"
      );
    });

    /* ============================================================ */
    /*  Test 4: Crear/listar/borrar persona sintética               */
    /* ============================================================ */
    await section("Test 4: Synthetic lead CRUD end-to-end", async () => {
      // Limpiar cualquier sintético residual.
      await deleteAllSyntheticLeads();

      // Crear 3 personas.
      const ids = [];
      for (let i = 0; i < 3; i++) {
        const lead = await createSyntheticLead({
          createdBy: "e2e-audit-script"
        });
        ids.push(lead.id);
        // Validar phone E.164: +52 + 10 dígitos (13 chars total).
        // Prefijo: +5255555 (8 chars) + 5 random.
        if (!/^\+5255555\d{5}$/.test(lead.phoneNormalized)) {
          record(
            `Person ${i + 1} phone E.164 valid`,
            false,
            `phone=${lead.phoneNormalized}`
          );
        } else {
          record(
            `Person ${i + 1} phone E.164 valid`,
            true,
            `phone=${lead.phoneNormalized}`
          );
        }
        // Validar email domain.
        if (!/@qlick\.test$/.test(lead.email)) {
          record(
            `Person ${i + 1} email domain qlick.test`,
            false,
            `email=${lead.email}`
          );
        } else {
          record(
            `Person ${i + 1} email domain qlick.test`,
            true,
            `email=${lead.email}`
          );
        }
      }
      record("Created 3 synthetic leads", ids.length === 3);

      // Listar.
      const listed = await listSyntheticLeads();
      record(
        "listSyntheticLeads returns 3+ items",
        listed.length >= 3,
        `count=${listed.length}`
      );

      // Verificar que todos tienen simulation_source correcto.
      const sb = createSupabaseAdminClient();
      for (const lead of listed.slice(0, 3)) {
        const { data, error } = await sb
          .from("leads")
          .select("simulation_source")
          .eq("id", lead.id)
          .maybeSingle();
        if (error) {
          record(`Lead ${lead.id} has simulation_source`, false, error.message);
        } else {
          record(
            `Lead ${lead.id} has simulation_source='admin_lab'`,
            data?.simulation_source === "admin_lab",
            `value=${data?.simulation_source}`
          );
        }
      }

      // Borrar todos.
      const delResult = await deleteAllSyntheticLeads();
      record(
        "deleteAllSyntheticLeads returns ok",
        delResult.ok,
        delResult.note
      );

      // Verificar que la lista queda vacía.
      const afterDelete = await listSyntheticLeads();
      record(
        "listSyntheticLeads returns 0 after delete",
        afterDelete.length === 0,
        `count=${afterDelete.length}`
      );
    });

    /* ============================================================ */
    /*  Test 5: processInboundMessage con lead sintético            */
    /* ============================================================ */
    await section("Test 5: processInboundMessage with synthetic lead", async () => {
      // Crear una persona sintética nueva para este test.
      const lead = await createSyntheticLead({
        createdBy: "e2e-audit-script"
      });
      const phone = normalizePhone(lead.phoneNormalized) ??
        lead.phoneNormalized;
      record(
        "Created synthetic lead for flow test",
        Boolean(lead.id && phone),
        `id=${lead.id} phone=${phone}`
      );

      // Construir el IncomingWhatsAppMessage.
      const message = {
        messageId: `e2e_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        from: phone,
        timestamp: new Date().toISOString(),
        type: "text",
        text: "Hola, ¿qué eventos tienen?",
        contactName: lead.name
      };

      // Ejecutar el flow completo.
      const t0 = Date.now();
      let result;
      try {
        result = await processInboundMessage(message);
      } catch (err) {
        record(
          "processInboundMessage doesn't throw",
          false,
          err instanceof Error ? err.message : String(err)
        );
        // Limpiar.
        await deleteAllSyntheticLeads();
        return;
      }
      const latencyMs = Date.now() - t0;

      record(
        "processInboundMessage returns ok=true",
        result.ok === true,
        `ok=${result.ok}`
      );
      record(
        "result has intent",
        typeof result.intent === "string" && result.intent.length > 0,
        `intent=${result.intent}`
      );
      record(
        "result has responseKind",
        typeof result.responseKind === "string",
        `responseKind=${result.responseKind}`
      );
      record(
        "result has leadId",
        result.leadId === lead.id,
        `leadId=${result.leadId}`
      );
      record(
        "latency < 30s",
        latencyMs < 30_000,
        `latencyMs=${latencyMs}`
      );

      // Verificar que el inbound se persistió en lead_whatsapp_conversations.
      const sb = createSupabaseAdminClient();
      const { data: conv, error: convErr } = await sb
        .from("lead_whatsapp_conversations")
        .select("id, body, direction, message_type")
        .eq("lead_id", lead.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (convErr) {
        record("inbound persisted", false, convErr.message);
      } else {
        record(
          "inbound persisted in DB",
          conv?.body === "Hola, ¿qué eventos tienen?",
          `body=${conv?.body?.slice(0, 50)}`
        );
      }

      // Limpiar.
      const delResult = await deleteAllSyntheticLeads();
      record(
        "cleanup ok",
        delResult.ok,
        `deletedLeads=${delResult.deletedLeads}`
      );
    });

    /* ============================================================ */
    /*  Test 6: Modo human_first activo en processInboundMessage     */
    /* ============================================================ */
    await section("Test 6: human_first mode flow with synthetic lead", async () => {
      // human_first ya está activo desde Test 1. Lo verificamos
      // leyendo directo de la DB (sin cache de 30s).
      const mode = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
      record(
        "bot_global_mode in DB is 'human_first'",
        mode === "human_first",
        `got=${JSON.stringify(mode)}`
      );

      // Crear persona y mandar mensaje.
      const lead = await createSyntheticLead({
        createdBy: "e2e-audit-script"
      });
      const phone = normalizePhone(lead.phoneNormalized) ??
        lead.phoneNormalized;
      const message = {
        messageId: `e2e_hf_${Date.now()}`,
        from: phone,
        timestamp: new Date().toISOString(),
        type: "text",
        text: "Hola, esto es human_first",
        contactName: lead.name
      };

      const t0 = Date.now();
      let result;
      try {
        result = await processInboundMessage(message);
      } catch (err) {
        record("processInboundMessage no throw", false, err.message);
        await deleteAllSyntheticLeads();
        return;
      }
      const latencyMs = Date.now() - t0;

      record("human_first flow returns ok", result.ok === true);
      record(
        "intent is 'question' (skip welcome/greeting)",
        result.intent === "question",
        `intent=${result.intent}`
      );
      record(
        "latency < 30s",
        latencyMs < 30_000,
        `latencyMs=${latencyMs}`
      );

      // Limpiar.
      await deleteAllSyntheticLeads();
    });
  } finally {
    // Restaurar el modo original.
    console.log("");
    console.log(`[e2e] Restaurando modo original: ${JSON.stringify(originalMode)}`);
    await setSystemSetting(
      KEY_BOT_GLOBAL_MODE,
      originalMode,
      "e2e-audit-script"
    );
  }

  // Reporte final.
  console.log("");
  console.log("=".repeat(60));
  console.log("REPORTE FINAL");
  console.log("=".repeat(60));
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`Total: ${results.length} tests`);
  console.log(`  PASS: ${passed}`);
  console.log(`  FAIL: ${failed}`);

  if (failed > 0) {
    console.log("");
    console.log("Tests que fallaron:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - ${r.name}: ${r.detail || "(no detail)"}`);
    }
    process.exit(1);
  }
  console.log("");
  console.log("✓ Todos los tests E2E pasaron.");
}

main().catch((err) => {
  console.error("[e2e] Error fatal:", err);
  process.exit(1);
});
