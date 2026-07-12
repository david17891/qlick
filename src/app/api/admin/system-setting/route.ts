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
 *
 * FIX 2026-07-12 (Auditoría v16 R2 + R3): el endpoint es genérico, pero
 * NO todas las keys deben ser escribibles desde aquí. Algunas (e.g.
 * `bot_global_mode`, `deepseek_tools_enabled`) cambian comportamiento
 * del bot de forma profunda y necesitan un endpoint dedicado con su
 * propio flujo de aprobación. Además, validamos el tipo runtime del
 * `value` contra la key solicitada (e.g. `bot_paused_global` debe ser
 * boolean; `bot_daily_outbound_limit` debe ser number >= 0).
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  readSystemSetting,
  setSystemSetting,
  KEY_BOT_DAILY_OUTBOUND_LIMIT,
  KEY_BOT_PAUSED_GLOBAL,
  KEY_BOT_MAX_ACTIVE_RULES,
  KEY_BOT_CONTEXT_BLOCKS_CONFIG
} from "@/lib/admin/system-settings-server";

export const dynamic = "force-dynamic";

/**
 * Allowlist de keys escribibles desde este endpoint.
 *
 * Reglas (R2):
 *   - Excluye `bot_global_mode` y `deepseek_tools_enabled` (cambios
 *     sensibles con su propio flujo; el toggle UI vive en `BotConfigTab`
 *     contra endpoints dedicados de v15 / v17).
 *   - Solo claves operativas de sprint v16 (Radar de Costos y Kill-Switch).
 *
 * Si en el futuro hay que exponer otra clave, agrégala aquí Y declara
 * su validador de tipo en `validateValueForKey`.
 */
const WRITABLE_KEYS: ReadonlySet<string> = new Set<string>([
  KEY_BOT_DAILY_OUTBOUND_LIMIT, // number >= 0
  KEY_BOT_PAUSED_GLOBAL,         // boolean
  KEY_BOT_MAX_ACTIVE_RULES,      // number >= 0
  KEY_BOT_CONTEXT_BLOCKS_CONFIG  // object (json)
]);

/**
 * Validador runtime de tipo por key (R3).
 *
 * Devuelve `null` si el valor es válido para la key; un string con la
 * razón de rechazo en caso contrario. Mantener alineado con `WRITABLE_KEYS`.
 */
function validateValueForKey(key: string, value: unknown): string | null {
  switch (key) {
    case KEY_BOT_DAILY_OUTBOUND_LIMIT:
    case KEY_BOT_MAX_ACTIVE_RULES:
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return `'${key}' debe ser un número finito >= 0.`;
      }
      // Defensa adicional: tope máximo sano (1 millón de envíos/día es absurdo).
      if (value > 1_000_000) {
        return `'${key}' excede el tope máximo permitido (1,000,000).`;
      }
      return null;
    case KEY_BOT_PAUSED_GLOBAL:
      if (typeof value !== "boolean") {
        return `'${key}' debe ser booleano.`;
      }
      return null;
    case KEY_BOT_CONTEXT_BLOCKS_CONFIG:
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return `'${key}' debe ser un objeto JSON (no array, no null).`;
      }
      return null;
    default:
      // Cualquier key fuera del allowlist cae aquí: por seguridad,
      // siempre rechazamos (mejor pedir que se agregue explícitamente).
      return `'${key}' no está en la allowlist de keys escribibles.`;
  }
}

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

  // R2: solo keys en allowlist.
  if (!WRITABLE_KEYS.has(key)) {
    return NextResponse.json(
      { ok: false, error: `La key '${key}' no se puede modificar desde este endpoint.` },
      { status: 403 }
    );
  }

  // R3: validar tipo del value contra la key.
  const typeError = validateValueForKey(key, body.value);
  if (typeError) {
    return NextResponse.json({ ok: false, error: typeError }, { status: 400 });
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
