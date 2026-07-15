// Verificar que el prompt de human_first ahora empuja inscripción
// cuando hay evento activo y el lead muestra interés.
// Compara el reply ANTES (system prompt anterior) vs DESPUÉS del fix.
import { simulateConversationTurn } from "../src/lib/ai/simulator.ts";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin.ts";
import {
  KEY_BOT_GLOBAL_MODE,
  setSystemSetting,
  readSystemSetting,
} from "../src/lib/admin/system-settings-server.ts";

const sb = createSupabaseAdminClient();

// Setear el modo en la DB para que el safety net del provider se active.
// El modeOverride del simulador solo cambia el system prompt, pero el
// safety net (runWithTimeout→applyHumanFirstSaleGuard) lee el modo de la DB.
const originalMode = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
await setSystemSetting(KEY_BOT_GLOBAL_MODE, "human_first", "verify-sale");
console.log("[setup] bot_global_mode set to human_first (era:", originalMode, ")");

// Buscar un evento activo (el primero que esté published).
const { data: event } = await sb
  .from("events")
  .select("id, title, slug, starts_at, status, location")
  .eq("status", "published")
  .order("starts_at", { ascending: false })
  .limit(1)
  .maybeSingle();

console.log("[setup] evento activo:", event?.title ?? "(ninguno)", "en", event?.location ?? "");

const messages = [
  "hola",
  "me interesa el curso",
  "a qué hora es?",
  "quiero entrar",
];

for (const message of messages) {
  const r = await simulateConversationTurn({
    message,
    history: [],
    modeOverride: "human_first",
    includeEventContext: true,
    includeInjectedRules: true,
    leadContext: null,
    ignoreLeadPause: false,
  });
  const push = r.reply.toLowerCase().includes("inscrib") ||
               r.reply.toLowerCase().includes("apunto") ||
               r.reply.toLowerCase().includes("mándame tu nombre") ||
               r.reply.toLowerCase().includes("dame nombre") ||
               r.reply.toLowerCase().includes("te registro");
  console.log(`\n[lead] "${message}"`);
  console.log(`[bot]  ${r.reply}`);
  console.log(`       push detection: inscrib=${r.reply.toLowerCase().includes("inscrib")}, apunto=${r.reply.toLowerCase().includes("apunto")}, mándame=${r.reply.toLowerCase().includes("mándame")}, dame=${r.reply.toLowerCase().includes("dame")}, registro=${r.reply.toLowerCase().includes("registro")}`);
  console.log(`       ${push ? "✅ EMPUJA INSCRIPCIÓN" : "❌ NO empuja inscripción"}`);
  console.log(`       intent=${r.telemetry.intent}, cost=${r.telemetry.usage.estimatedCostCents}c, model=${r.telemetry.usage.model}, note=${(r.note ?? "").slice(0, 80)}`);
}

// Restaurar el modo original.
await setSystemSetting(KEY_BOT_GLOBAL_MODE, originalMode ?? "human_assistant", "verify-sale-cleanup");
console.log(`\n[cleanup] bot_global_mode restaurado a ${originalMode ?? "human_assistant"}`);
