/**
 * PATCH /api/admin/leads/[id]/bot-pause
 *
 * FIX 2026-07-08 (sesión madrugada David "poder apagar y encender el bot
 * por momentos, por conversación"): el admin pausa/reanuda el bot para
 * un lead específico. Mientras `bot_paused=true`, el bot NO procesa
 * nuevos mensajes de ese lead (los persiste con metadata
 * `bot_paused_skip=true` para visibilidad, pero no responde).
 *
 * Auth: `requireAdmin()` (gate via ADMIN_EMAIL_ALLOWLIST). Audit log
 * persiste cada toggle con el email del admin y el before/after.
 *
 * Request body:
 *   { botPaused: boolean, reason?: string }
 *
 * Response:
 *   {
 *     ok: true,
 *     leadId,
 *     botPaused: boolean,
 *     botPausedAt: string | null,
 *     botPausedByEmail: string | null,
 *   }
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/crm/audit-server";

interface RouteParams {
  params: { id: string };
}

interface RequestBody {
  botPaused?: boolean;
  reason?: string;
}

/* UUID v4-ish shape check. */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin." },
      { status: 401 },
    );
  }

  if (!UUID_LIKE.test(params.id)) {
    return NextResponse.json(
      { ok: false, error: "leadId inválido (UUID)." },
      { status: 400 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body JSON inválido." },
      { status: 400 },
    );
  }

  if (typeof body.botPaused !== "boolean") {
    return NextResponse.json(
      {
        ok: false,
        error: "Falta `botPaused` (boolean) en el body.",
      },
      { status: 400 },
    );
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 500)
      : undefined;

  const supabase = createSupabaseAdminClient();

  // Fetch el estado actual para audit log (before/after).
  const { data: current, error: curErr } = await supabase
    .from("leads")
    .select("id, bot_paused, bot_paused_by_email")
    .eq("id", params.id)
    .maybeSingle();
  if (curErr) {
    return NextResponse.json(
      { ok: false, error: `Lead lookup falló: ${curErr.message}` },
      { status: 500 },
    );
  }
  if (!current) {
    return NextResponse.json(
      { ok: false, error: "Lead no existe." },
      { status: 404 },
    );
  }

  const beforePaused = Boolean((current as { bot_paused?: boolean }).bot_paused);

  // Si ya está en el estado pedido, idempotente (no error, devuelve OK).
  if (beforePaused === body.botPaused) {
    return NextResponse.json({
      ok: true,
      leadId: params.id,
      botPaused: beforePaused,
      botPausedAt: null,
      botPausedByEmail: null,
      note: "idempotente: ya estaba en ese estado.",
    });
  }

  // Update. Si activamos (true), seteamos timestamp + email del admin + reason='manual'.
  // Si desactivamos (false), limpiamos timestamp + reason pero dejamos el email
  // para histórico (en DB queda claro quién fue el último en tocar).
  // Sprint v15: la razón 'manual' es para pausas iniciadas por el operador desde CRM.
  // Las pausas automáticas (regex/LLM) usan 'keyword_escalation' y 'ai_semantic_escalation'
  // respectivamente y son seteadas en src/lib/whatsapp/bot-engine.ts (PR #2).
  const patch: Record<string, unknown> = {
    bot_paused: body.botPaused,
  };
  if (body.botPaused) {
    patch.bot_paused_at = new Date().toISOString();
    patch.bot_paused_by_email = admin.email ?? "unknown";
    patch.bot_paused_reason = "manual";
  } else {
    patch.bot_paused_at = null;
    patch.bot_paused_reason = null;
    // No limpiamos bot_paused_by_email — queda como "último que pausó".
  }

  const { data: updated, error: updErr } = await supabase
    .from("leads")
    .update(patch as never)
    .eq("id", params.id)
    .select("id, bot_paused, bot_paused_at, bot_paused_by_email")
    .maybeSingle();
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: `Update falló: ${updErr.message}` },
      { status: 500 },
    );
  }

  // Audit log (best-effort).
  try {
    await logAdminAction({
      action: body.botPaused ? "bot_paused_for_lead" : "bot_resumed_for_lead",
      entity_type: "lead",
      entity_id: params.id,
      actor_email: admin.email ?? "unknown",
      metadata: {
        beforePaused,
        afterPaused: body.botPaused,
        reason: reason ?? null,
      },
    });
  } catch {
    /* swallow */
  }

  const u = updated as {
    bot_paused: boolean;
    bot_paused_at: string | null;
    bot_paused_by_email: string | null;
  } | null;

  return NextResponse.json({
    ok: true,
    leadId: params.id,
    botPaused: u?.bot_paused ?? body.botPaused,
    botPausedAt: u?.bot_paused_at ?? null,
    botPausedByEmail: u?.bot_paused_by_email ?? null,
  });
}