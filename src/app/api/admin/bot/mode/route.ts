/**
 * GET  /api/admin/bot/mode
 *   Devuelve { ok, mode: BotMode | null } leyendo `system_settings.bot_global_mode`.
 *   Lee con `requireAdmin`. Si la fila no existe o está en `null`, devuelve `mode: null`
 *   (caller decide fallback a env var o default).
 *
 * POST /api/admin/bot/mode
 *   Body: { mode: "socratic_autopilot_v2" | "socratic_no_tools_v1" | "super_executive" | "human_first" }
 *   UPSERT en system_settings. Idempotente. Invalida la caché in-memory del
 *   provider deepseek (TTL 30s) al escribir.
 *
 * FIX 2026-07-12 (Sprint v16 Hotfix #3 — persistencia real de onSelectMode):
 * La auditoría v16 R2 separó `bot_global_mode` del endpoint genérico
 * `/api/admin/system-setting` porque es una "key sensible" (cambia
 * comportamiento profundo del bot). R2 anticipó que el toggle UI viviría
 * contra endpoints dedicados de v15 / v17 — éste es el endpoint de v17
 * que el toggle en `BotConfigTab` necesita.
 *
 * Validación: el `mode` se valida contra un set cerrado de 3 valores.
 * Cualquier otro string → 400. El provider deepseek rechaza modos
 * desconocidos con fallback al default, pero no queremos guardar basura
 * en system_settings.
 *
 * @server
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  readSystemSetting,
  setSystemSetting,
  KEY_BOT_GLOBAL_MODE,
  type BotGlobalMode,
  isBotGlobalMode,
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
  const v = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
  // readSystemSetting devuelve unknown; revalidamos contra el type guard
  // (cualquier valor inesperado en system_settings se normaliza a null).
  const mode: BotGlobalMode | null = isBotGlobalMode(v) ? v : null;
  return NextResponse.json({ ok: true, mode });
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
  const candidate = body.mode;
  if (!isBotGlobalMode(candidate)) {
    return NextResponse.json(
      {
        ok: false,
        // Sprint v0.9.x (PR #1 modo `human_first`): agregamos el 4to
        // valor al mensaje de error. El type guard `isBotGlobalMode`
        // en system-settings-server.ts es la SSOT; este mensaje solo
        // es legible para el admin.
        error:
          "'mode' debe ser uno de: socratic_autopilot_v2, socratic_no_tools_v1, super_executive, human_first.",
      },
      { status: 400 }
    );
  }
  // Tercer arg = actorEmail (audit trail del UPSERT en system_settings).
  const result = await setSystemSetting(KEY_BOT_GLOBAL_MODE, candidate, admin.email);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.note || "Error al persistir el modo del bot." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, mode: candidate });
}
