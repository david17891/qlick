/**
 * Webhook de Conekta — POST /api/webhooks/conekta
 *
 * Conekta notifica eventos de pago (charges, refunds, etc.) vía este
 * endpoint. Cada request viene firmada con HMAC SHA256 en el header
 * `X-Conekta-Signature` sobre el body crudo:
 *
 *   signature = HMAC_SHA256(CONEKTA_WEBHOOK_SECRET, rawBody)
 *
 * Si la firma no coincide, devolvemos 401 (rechazo sin procesar).
 * Si la firma coincide, procesamos el evento (en este sprint: skeleton
 * con 200 OK; la lógica de activar acceso al curso vive en el sprint
 * siguiente).
 *
 * IMPORTANTE: Este webhook es crítico para confirmar pagos de cursos
 * en producción. AUDIT-005 del súper-audit 2026-07-12.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

interface ConektaEvent {
  type: "charge.succeeded" | "charge.failed" | "charge.refunded" | string;
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      metadata?: Record<string, unknown>;
    };
  };
}

function verifyConektaSignature(
  rawBody: string,
  signature: string | null,
): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.CONEKTA_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        reason: "CONEKTA_WEBHOOK_SECRET no configurado en producción",
      };
    }
    return { ok: true };
  }
  if (!signature) {
    return { ok: false, reason: "Falta header X-Conekta-Signature" };
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) {
    return { ok: false, reason: "Firma de longitud inválida" };
  }
  if (!timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "Firma no coincide" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-conekta-signature");

  let event: ConektaEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body no es JSON válido" },
      { status: 400 },
    );
  }

  const verification = verifyConektaSignature(rawBody, signature);
  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, error: verification.reason },
      { status: 401 },
    );
  }

  // eslint-disable-next-line no-console
  console.log("[conekta-webhook] event recibido", {
    type: event.type,
    objectId: event.data?.object?.id,
  });

  // Conekta espera 200 OK rápido. Si necesitamos más tiempo, encolar.
  return NextResponse.json({ ok: true });
}
