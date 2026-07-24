/**
 * POST /api/admin/events/[id]/register-manual-payment
 *
 * Registra un pago manual (efectivo, OXXO, SPEI, tarjeta en puerta,
 * transferencia) para un `event_confirmation`. Sprint pagos-manuales
 * (2026-07-15) + sprint event-payment-progress (2026-07-24 v3).
 *
 * Body esperado:
 *   {
 *     confirmationId: string,        // uuid del event_confirmation
 *     method: "card" | "oxxo" | "spei" | "cash" | "transfer",
 *     voucherInput?: string,         // opcional; solo card/oxxo/spei
 *     amountMXN: number,             // > 0
 *     paymentPurpose?: "reservation" | "balance" | "full",  // NUEVO v3
 *     notes?: string,                // opcional
 *   }
 *
 * Respuesta OK (200):
 *   { ok: true, paymentId, eventAccessId?, paymentStatus, ... }
 *
 * Errores:
 *   - 400: body invalido, paymentPurpose invalido, monto invalido
 *   - 401: no autenticado como admin
 *   - 409: el confirmado ya esta 'paid_full' (sin saldo cobrable)
 *   - 500: Supabase no configurado o error de DB / Stripe
 *
 * El lib `src/lib/payments/manual-payment.ts` es el que hace el flow
 * completo: lee confirmation, valida contra Stripe (si method lo
 * amerita y hay input), crea payment, crea/actualiza event_access,
 * marca payment_status, audit log. La validacion de centavos y la
 * logica de `payment_purpose` se hace dentro de ese lib (correccion
 * #3 v3).
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

const VALID_PURPOSES = ["reservation", "balance", "full"] as const;
type ManualPaymentPurpose = (typeof VALID_PURPOSES)[number];

function isValidMethod(m: unknown): m is ManualPaymentMethod {
  return typeof m === "string" && VALID_METHODS.includes(m as ManualPaymentMethod);
}

function isValidPurpose(p: unknown): p is ManualPaymentPurpose {
  return typeof p === "string" && (VALID_PURPOSES as readonly string[]).includes(p);
}

interface RegisterBody {
  confirmationId?: unknown;
  method?: unknown;
  voucherInput?: unknown;
  amountMXN?: unknown;
  paymentPurpose?: unknown;
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
  // paymentPurpose es OPCIONAL pero si viene, debe ser valido.
  // Si NO viene, el lib lo deriva del contexto (compat con sprints
  // anteriores y flujo de "Confirmar pagado" rapido).
  let paymentPurpose: ManualPaymentPurpose | undefined;
  if (body.paymentPurpose !== undefined) {
    if (!isValidPurpose(body.paymentPurpose)) {
      return NextResponse.json(
        {
          ok: false,
          error: `'paymentPurpose' invalido. Valores permitidos: ${VALID_PURPOSES.join(", ")}.`,
        },
        { status: 400 },
      );
    }
    paymentPurpose = body.paymentPurpose;
  }
  if (
    typeof body.amountMXN !== "number" ||
    !Number.isFinite(body.amountMXN) ||
    body.amountMXN <= 0
  ) {
    return NextResponse.json(
      { ok: false, error: "'amountMXN' debe ser un numero > 0." },
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
    paymentPurpose,
    notes,
    actorEmail: admin.email,
  });

  if (!result.ok) {
    // Mapeamos el mensaje a un status code razonable.
    const note = result.error ?? "No se pudo registrar el pago.";
    let status: number;
    if (
      note.includes("ya esta liquidado") ||
      note.includes("ya esta pagado completo") ||
      note.includes("No registres otro pago")
    ) {
      status = 409;
    } else if (note.includes("no existe") || note.includes("no pertenece")) {
      status = 404;
    } else if (note.includes("requiere") || note.includes("debe")) {
      status = 400;
    } else {
      status = 500;
    }
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
