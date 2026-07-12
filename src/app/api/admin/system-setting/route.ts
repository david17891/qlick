/**
 * GET  /api/admin/system-setting?key=<string>
 *   Lee y devuelve { ok: true, key, value } desde `system_settings`.
 *   Requiere autenticación de admin.
 *
 * POST /api/admin/system-setting
 *   Body JSON: { key: string, value: unknown }
 *   Persiste el valor en `system_settings` usando `setSystemSetting`.
 *   Requiere autenticación de admin.
 *
 * FIX 2026-07-12 (Sprint v16 Auditoría final): Cierre de la nota #3 de
 * Mavis. Se crea este endpoint genérico para respaldar `handleChangeDailyLimit`
 * en `BotConfigTab.tsx` y cualquier futura configuración dinámica.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  readSystemSetting,
  setSystemSetting
} from "@/lib/admin/system-settings-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  const key = req.nextUrl.searchParams.get("key")?.trim();
  if (!key) {
    return NextResponse.json({ ok: false, error: "Parámetro key requerido." }, { status: 400 });
  }

  const value = await readSystemSetting(key);
  return NextResponse.json({ ok: true, key, value });
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

  let body: { key?: string; value?: unknown };
  try {
    body = (await req.json()) as { key?: string; value?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const key = body.key?.trim();
  if (!key) {
    return NextResponse.json({ ok: false, error: "El campo 'key' es obligatorio." }, { status: 400 });
  }

  const result = await setSystemSetting(key, body.value, admin.email);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.note || `Error al guardar la configuración '${key}'.` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, key, value: body.value });
}
