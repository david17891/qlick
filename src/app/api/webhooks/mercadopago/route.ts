/**
 * Webhook de MercadoPago — POST /api/webhooks/mercadopago
 *
 * MercadoPago notifica eventos de pago vía este endpoint. Cada request
 * viene firmada con HMAC SHA256 en el header `x-signature` sobre un
 * manifest string:
 *
 *   manifest = `id=${data.id};request-id=${x-request-id};ts=${ts};`
 *   signature = HMAC_SHA256(MERCADOPAGO_WEBHOOK_SECRET, manifest)
 *
 * Si la firma no coincide, devolvemos 401 (rechazo sin procesar).
 * Si la firma coincide, procesamos el evento (en este sprint: skeleton
 * con 200 OK; la lógica de activar acceso al curso vive en el sprint
 * siguiente).
 *
 * IMPORTANTE: Este webhook es crítico para confirmar pagos de cursos
 * en producción. Sin él, los pagos se quedan en estado "pending" y
 * el cliente nunca recibe acceso. AUDIT-005 del súper-audit 2026-07-12.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

interface MercadoPagoPaymentEvent {
  id: string;
  type: "payment" | string;
  data: { id: string };
}

function verifyMercadoPagoSignature(
  rawBody: string,
  signature: string | null,
  requestId: string | null,
  dataId: string,
): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    // En dev sin secret configurado, aceptamos el webhook sin validar
    // (modo demo). En prod, FALLA sin secret — esto evita que un deploy
    // accidental a prod sin secret acepte webhooks sin firma.
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        reason: "MERCADOPAGO_WEBHOOK_SECRET no configurado en producción",
      };
    }
    return { ok: true };
  }
  if (!signature) {
    return { ok: false, reason: "Falta header x-signature" };
  }
  // ts = timestamp actual; MercadoPago también valida ventana de tiempo.
  // Aquí solo validamos la firma, no la ventana (esa la aplica MP en su retry).
  const ts = Math.floor(Date.now() / 1000);
  const manifest = `id=${dataId};request-id=${requestId ?? ""};ts=${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
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
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  let event: MercadoPagoPaymentEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body no es JSON válido" },
      { status: 400 },
    );
  }

  // Validación de firma. data.id es el ID del recurso notificado.
  const dataId = event.data?.id ?? "";
  const verification = verifyMercadoPagoSignature(
    rawBody,
    xSignature,
    xRequestId,
    dataId,
  );
  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, error: verification.reason },
      { status: 401 },
    );
  }

  // Procesamiento del evento. Skeleton: log + 200 OK. La lógica de
  // activar acceso al curso vive en el sprint siguiente (compara con
  // un payment existente y marca como completed).
  // eslint-disable-next-line no-console
  console.log("[mercadopago-webhook] event recibido", {
    type: event.type,
    dataId,
    requestId: xRequestId,
  });

  // MercadoPago espera 200 OK rápido (<5s) para no reintentar. Si
  // necesitamos más tiempo, encolar (Bull/BullMQ) y responder 200.
  return NextResponse.json({ ok: true });
}
