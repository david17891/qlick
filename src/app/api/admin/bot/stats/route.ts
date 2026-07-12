/**
 * GET /api/admin/bot/stats
 *
 * Endpoint de auditoría y métricas de seguridad (D-025) para el bot de WhatsApp.
 * Devuelve:
 *   - total_bot_messages_24h / 7d: conteo de outbound con auto_sent_source = 'bot'.
 *   - paused_leads_count: leads con bot_paused = true.
 *   - pause_reasons: desglose por bot_paused_reason (keyword/semantic/manual).
 *   - bot_global_mode: modo activo actual (socratic_autopilot_v2 / socratic_no_tools_v1).
 *   - bot_max_active_rules: top N reglas inyectadas por turno.
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
} from "@/lib/admin/system-settings-server";

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
    generated_at: string;
  };
  error?: string;
}

export async function GET(): Promise<NextResponse<BotStatsResponse>> {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  // 1. Mensajes bot (outbound) en 24h y 7d.
  //    Filtra por metadata->>'auto_sent_source' = 'bot'. En PR #1 esto
  //    devuelve 0 (el flag lo setea bot-engine.ts en PR #2).
  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7dIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [r24, r7d] = await Promise.all([
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
  ]);

  // 2. Leads en pausa + desglose por razón.
  const [pausedAll, pausedKeyword, pausedSemantic, pausedManual] = await Promise.all([
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
  ]);

  // 3. Settings actuales (bot_global_mode, bot_max_active_rules).
  const mode = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
  const maxRules = await readSystemSetting(KEY_BOT_MAX_ACTIVE_RULES);

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
      generated_at: new Date().toISOString(),
    },
  });
}
