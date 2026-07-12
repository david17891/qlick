/**
 * GET  /api/admin/bot/global-pause
 *   Devuelve { ok, bot_paused_global: boolean }.
 *   Lee `system_settings.bot_paused_global` con requireAdmin.
 *
 * POST /api/admin/bot/global-pause
 *   Body: { botPausedGlobal: boolean }
 *   UPSERT en system_settings. Idempotente.
 *
 * Sprint v16 (M4): switch maestro "Pausar Bot para Todos". El bot-engine
 * (PR #2) consulta `bot_paused_global` antes de generar respuesta y
 * aborta si está activo, con `bot_paused_reason = 'manual_global'`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  readSystemSetting,
  setSystemSetting,
  KEY_BOT_PAUSED_GLOBAL
} from "@/lib/admin/system-settings-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 }
    );
  }
  const v = await readSystemSetting(KEY_BOT_PAUSED_GLOBAL);
  return NextResponse.json({
    ok: true,
    bot_paused_global: v === true
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 }
    );
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const next = body.botPausedGlobal === true;
  // FIX 2026-07-12: el tipo de `value` en setSystemSetting es `SettingValue`
  // (jsonb). true es JSON boolean nativo, no string. Tercer arg = actorEmail
  // (audit trail del UPSERT en system_settings).
  const result = await setSystemSetting(KEY_BOT_PAUSED_GLOBAL, next, admin.email);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.note || "Error al persistir el switch global." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, bot_paused_global: next });
}
