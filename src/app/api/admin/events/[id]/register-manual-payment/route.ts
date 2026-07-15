/**
 * POST /api/admin/events/[id]/register-manual-payment
 *
 * Registra un pago manual (efectivo, OXXO, SPEI, tarjeta en puerta,
 * transferencia) para un `event_confirmation`. Sprint pagos-manuales
 * (2026-07-15). Server-only, admin (defensa en profundidad).
 *
 * Body esperado:
 *   {
 *     confirmationId: string,        // uuid del event_confirmation
 *     method: "card" | "oxxo" | "spei" | "cash" | "transfer",
 *     voucherInput?: string,         // opcional; solo card/oxxo/spei
 *     amountMXN: number,             // >= 0
 *     notes?: string,                // opcional
 *   }
 *
 * Respuesta OK (200):
 *   { ok: true, paymentId, eventAccessId?, paymentStatus, ... }
 *
 * Errores:
 *   - 400: body invalido o confirmation no pertenece al evento
 *   - 401: no autenticado como admin
 *   - 409: el confirmado ya esta 'paid' (evitar doble cobro)
 *   - 500: Supabase no configurado o error de DB / Stripe
 *
 * El lib `src/lib/payments/manual-payment.ts` es el que hace el flow
 * completo: lee confirmation, valida contra Stripe (si method lo
 * amerita y hay input), crea payment, crea/actualiza event_access,
 * marca payment_status, audit log.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  registerManualPayment,
  type ManualPaymentMethod,
} from "@/lib/payments/manual-payment";

// Forzar Node.js (Stripe SDK + Supabase necesitan Node APIs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_METHODS: ManualPaymentMethod[] = [
  "card",
  "oxxo",
  "spei",
  "cash",
  "transfer",
];

function isValidMethod(m: unknown): m is ManualPaymentMethod {
  return typeof m === "string" && VALID_METHODS.includes(m as ManualPaymentMethod);
}

interface RegisterBody {
  confirmationId?: unknown;
  method?: unknown;
  voucherInput?: unknown;
  amountMXN?: unknown;
  notes?: unknown;
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

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
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
  if (!isValidMethod(body.method)) {
    return NextResponse.json(
      {
        ok: false,
        error: `'method' invalido. Valores permitidos: ${VALID_METHODS.join(", ")}.`,
      },
      { status: 400 },
    );
  }
  if (
    typeof body.amountMXN !== "number" ||
    !Number.isFinite(body.amountMXN) ||
    body.amountMXN < 0
  ) {
    return NextResponse.json(
      { ok: false, error: "'amountMXN' debe ser un numero >= 0." },
      { status: 400 },
    );
  }

  // voucherInput y notes son opcionales.
  const voucherInput =
    typeof body.voucherInput === "string" && body.voucherInput.trim().length > 0
      ? body.voucherInput.trim()
      : null;
  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim()
      : null;

  const result = await registerManualPayment({
    eventId: params.id,
    confirmationId: body.confirmationId,
    method: body.method,
    voucherInput,
    amountMXN: body.amountMXN,
    notes,
    actorEmail: admin.email,
  });

  if (!result.ok) {
    // Mapeamos el mensaje a un status code razonable.
    const note = result.error ?? "No se pudo registrar el pago.";
    const status = note.includes("ya esta marcado como pagado")
      ? 409
      : note.includes("no existe")
        ? 404
        : 500;
    return NextResponse.json({ ok: false, error: note }, { status });
  }

  return NextResponse.json({
    ok: true,
    paymentId: result.paymentId,
    eventAccessId: result.eventAccessId,
    paymentStatus: result.paymentStatus,
    stripePaymentIntentId: result.stripePaymentIntentId,
    note: result.note,
  });
}
