/**
 * GET /api/admin/bot/stats
 *
 * Endpoint de auditoría y métricas de seguridad (D-025) para el bot de WhatsApp.
 * Devuelve:
 *   - total_bot_messages_24h / 7d: conteo de outbound con auto_sent_source = 'bot'.
 *   - paused_leads_count: leads con bot_paused = true.
 *   - pause_reasons: desglose por bot_paused_reason (keyword/semantic/manual).
 *   - bot_global_mode: modo activo actual (socratic_autopilot_v2 / socratic_no_tools_v1 / super_executive / human_first).
 *   - bot_max_active_rules: top N reglas inyectadas por turno.
 *
 * Sprint v16 PR #2.2 — Radar de Costos (M5/R3/M6):
 *   - bot_usage_today: tokens y costo de DeepSeek V4 del día (suma de
 *     ambos modelos).
 *   - bot_usage_projection_30d: proyección mensual del costo (X2: 30d).
 *   - whatsapp_free_quota_used_30d: conteo de conversaciones de servicio
 *     iniciadas por el business en los últimos 30 días (proyección R3:
 *     Meta NO expone el saldo restante; este es el conteo local).
 *   - whatsapp_free_quota_total: 1000 (constante Meta, hardcoded).
 *   - whatsapp_free_quota_note: disclaimer "≈ Proyección rolling 30d".
 *   - bot_paused_global: switch maestro (M4).
 *   - bot_daily_outbound_limit: Kill-Switch diario (default 50).
 *
 * Requiere admin (requireAdmin).
 *
 * Sprint v15: el flag `auto_sent_source = 'bot'` lo setea bot-engine.ts
 * (PR #2). En PR #1 el conteo puede ser 0 hasta que PR #2 mergee.
 *
 * @server
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  readSystemSetting,
  KEY_BOT_GLOBAL_MODE,
  KEY_BOT_MAX_ACTIVE_RULES,
  KEY_BOT_PAUSED_GLOBAL,
  KEY_BOT_DAILY_OUTBOUND_LIMIT
} from "@/lib/admin/system-settings-server";
import {
  projectMonthlyUsdCents
} from "@/lib/ai/deepseek-cost";

export const dynamic = "force-dynamic";

interface BotStatsResponse {
  ok: boolean;
  data?: {
    total_bot_messages_24h: number;
    total_bot_messages_7d: number;
    paused_leads_count: number;
    pause_reasons: {
      keyword_escalation: number;
      ai_semantic_escalation: number;
      manual: number;
    };
    bot_global_mode: string | null;
    bot_max_active_rules: number;
    // Sprint v16 PR #2.2 — Radar de Costos.
    bot_usage_today: {
      prompt_tokens: number;
      completion_tokens: number;
      call_count: number;
      estimated_cost_cents: number;
    } | null;
    bot_usage_projection_30d_cents: number;
    whatsapp_free_quota_used_30d: number;
    whatsapp_free_quota_total: number;
    whatsapp_free_quota_note: string;
    bot_paused_global: boolean;
    bot_daily_outbound_limit: number;
    bot_daily_outbound_count: number;
    generated_at: string;
  };
  error?: string;
}

// Sprint v16 (R3): la cuota gratuita de Meta es 1,000 conversaciones
// de servicio por mes (rolling 30d). El endpoint NO consulta la API
// de Meta (no expone saldo). Es una PROYECCIÓN local: contamos
// conversaciones outbound en los últimos 30 días. Disclaimer obligatorio
// en el payload para que la UI muestre "≈" y David no se confunda.
const META_FREE_QUOTA_TOTAL = 1000;
const META_FREE_QUOTA_ROLLING_DAYS = 30;

export async function GET(): Promise<NextResponse<BotStatsResponse>> {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  // 1. Mensajes bot (outbound) en 24h y 7d.
  //    Filtra por metadata->>'auto_sent_source' = 'bot'. En PR #1 esto
  //    devuelve 0 (el flag lo setea bot-engine.ts en PR #2).
  //
  // FIX 2026-07-12 (auditoría v16 R4 + A5): antes el kill-switch
  // counter usaba `created_at >= medianoche UTC` (zona horaria del
  // server), lo que en zonas al oeste (Phoenix UTC-7, Hermosillo
  // UTC-7) subestimaba los envíos hechos entre 17:00 y 24:00 hora
  // local. Cambiamos a ventana rolling 24h: refleja "últimas 24
  // horas" sin depender de zona. `bot_daily_outbound_limit` se
  // interpreta como "tope rolling 24h" en la UI.
  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7dIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30dIso = new Date(
    Date.now() - META_FREE_QUOTA_ROLLING_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const todayDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (zona server, para bot_usage_daily)

  const [
    r24,
    r7d,
    r30d,
    pausedAll,
    pausedKeyword,
    pausedSemantic,
    pausedManual,
    usageToday,
    countLast24h
  ] = await Promise.all([
    supabase
      .from("lead_whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("metadata->>auto_sent_source", "bot")
      .gte("created_at", since24hIso),
    supabase
      .from("lead_whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("metadata->>auto_sent_source", "bot")
      .gte("created_at", since7dIso),
    // Sprint v16 (R3): proyección rolling 30d del cupo Meta.
    supabase
      .from("lead_whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .gte("created_at", since30dIso),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("bot_paused", true),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("bot_paused", true)
      .eq("bot_paused_reason", "keyword_escalation"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("bot_paused", true)
      .eq("bot_paused_reason", "ai_semantic_escalation"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("bot_paused", true)
      .eq("bot_paused_reason", "manual"),
    // Sprint v16 (M5): tokens y costo DeepSeek de HOY. Suma de ambos
    // modelos (chat + reasoner) del día actual.
    supabase
      .from("bot_usage_daily")
      .select("prompt_tokens, completion_tokens, call_count, estimated_cost_cents")
      .eq("date", todayDate),
    // Kill-Switch counter: outbound auto_enviados en las últimas 24h
    // (ventana rolling, no día calendario UTC). FIX 2026-07-12 (R4):
    // antes filtraba por `created_at >= medianoche UTC`, lo que
    // subestimaba envíos en zonas al oeste. FIX 2026-07-12 (A5):
    // reusamos `since24hIso` en lugar de recalcular.
    supabase
      .from("lead_whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("metadata->>auto_sent_source", "bot")
      .gte("created_at", since24hIso)
  ]);

  // 2. Settings actuales.
  const mode = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
  const maxRules = await readSystemSetting(KEY_BOT_MAX_ACTIVE_RULES);
  const globalPaused = await readSystemSetting(KEY_BOT_PAUSED_GLOBAL);
  const dailyLimit = await readSystemSetting(KEY_BOT_DAILY_OUTBOUND_LIMIT);

  // 3. Sumar uso de hoy (puede haber 0, 1 o 2 filas: chat + reasoner).
  type UsageRow = {
    prompt_tokens: number;
    completion_tokens: number;
    call_count: number;
    estimated_cost_cents: number;
  };
  const usageRows = (Array.isArray(usageToday.data) ? usageToday.data : []) as unknown as UsageRow[];
  const usageTodayAgg =
    usageRows.length === 0
      ? null
      : usageRows.reduce<UsageRow>(
          (acc, r) => ({
            prompt_tokens: acc.prompt_tokens + r.prompt_tokens,
            completion_tokens: acc.completion_tokens + r.completion_tokens,
            call_count: acc.call_count + r.call_count,
            estimated_cost_cents: acc.estimated_cost_cents + r.estimated_cost_cents
          }),
          { prompt_tokens: 0, completion_tokens: 0, call_count: 0, estimated_cost_cents: 0 }
        );

  return NextResponse.json({
    ok: true,
    data: {
      total_bot_messages_24h: r24.count ?? 0,
      total_bot_messages_7d: r7d.count ?? 0,
      paused_leads_count: pausedAll.count ?? 0,
      pause_reasons: {
        keyword_escalation: pausedKeyword.count ?? 0,
        ai_semantic_escalation: pausedSemantic.count ?? 0,
        manual: pausedManual.count ?? 0,
      },
      bot_global_mode: typeof mode === "string" ? mode : null,
      bot_max_active_rules: typeof maxRules === "number" ? maxRules : 8,
      // Sprint v16 PR #2.2 — Radar de Costos.
      bot_usage_today: usageTodayAgg,
      bot_usage_projection_30d_cents: usageTodayAgg
        ? projectMonthlyUsdCents(usageTodayAgg.estimated_cost_cents, 30)
        : 0,
      // R3: proyección rolling 30d del cupo Meta. NO es saldo real.
      whatsapp_free_quota_used_30d: r30d.count ?? 0,
      whatsapp_free_quota_total: META_FREE_QUOTA_TOTAL,
      whatsapp_free_quota_note:
        "≈ Proyección rolling 30d (Meta no expone el saldo exacto de las 1,000 conversaciones gratuitas de servicio). El conteo es local.",
      // M4: switch maestro de pausa global.
      bot_paused_global: globalPaused === true,
      // Kill-Switch rolling 24h: default 50 envíos/día en pruebas.
      // FIX 2026-07-12 (R4): el conteo es rolling, no día calendario UTC.
      bot_daily_outbound_limit: typeof dailyLimit === "number" ? dailyLimit : 50,
      bot_daily_outbound_count: countLast24h.count ?? 0,
      generated_at: new Date().toISOString(),
    },
  });
}
