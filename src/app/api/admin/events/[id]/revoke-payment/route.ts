/**
 * POST /api/admin/events/[id]/revoke-payment
 *
 * Revoca un pago manual de un `event_confirmation` (lo marca como
 * 'revoked'). Sprint pagos-manuales (2026-07-15).
 *
 * Body esperado:
 *   {
 *     confirmationId: string,    // uuid del event_confirmation
 *     reason: string,             // motivo de la revocacion
 *   }
 *
 * Respuesta OK (200):
 *   { ok: true, paymentStatus: "revoked", note }
 *
 * Errores:
 *   - 400: body invalido
 *   - 401: no autenticado como admin
 *   - 404: confirmation no existe
 *   - 409: el payment_status no es 'paid' o 'pending_verification'
 *   - 500: error de DB
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { revokeManualPayment } from "@/lib/payments/manual-payment";

// Forzar Node.js (Supabase necesita Node APIs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RevokeBody {
  confirmationId?: unknown;
  reason?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  let body: RevokeBody;
  try {
    body = (await req.json()) as RevokeBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON invalido." },
      { status: 400 },
    );
  }

  if (typeof body.confirmationId !== "string" || !body.confirmationId) {
    return NextResponse.json(
      { ok: false, error: "Falta 'confirmationId' en el body." },
      { status: 400 },
    );
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 3) {
    return NextResponse.json(
      { ok: false, error: "Falta 'reason' (minimo 3 chars)." },
      { status: 400 },
    );
  }

  const result = await revokeManualPayment({
    confirmationId: body.confirmationId,
    eventId: params.id,
    reason: body.reason.trim(),
    actorEmail: admin.email,
  });

  if (!result.ok) {
    const note = result.error ?? "No se pudo revocar el pago.";
    const status = note.includes("no existe")
      ? 404
      : note.includes("Solo se puede revocar")
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: note }, { status });
  }

  return NextResponse.json({
    ok: true,
    paymentStatus: result.paymentStatus,
    note: result.note,
  });
}
