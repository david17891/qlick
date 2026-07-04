/**
 * Cron: limpieza diaria de tokens QR viejos no usados (Fase 7a, P1-1).
 *
 * Vercel Cron llama este endpoint una vez al día (configurado en
 * `vercel.json`, schedule "0 3 * * *" = 3 AM UTC). El job borra tokens
 * que expiraron hace más de 30 días y nunca fueron usados.
 *
 * **Auth:** Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`.
 * Si está seteado, validamos; si no, aceptamos (modo dev).
 *
 * **Response:** JSON con el resultado del run (ok, deletedCount, ranAt).
 *
 * Documentación del job: `src/lib/cron/cleanup-qr-tokens.ts`.
 */

import { NextResponse } from "next/server";
import { runCleanupQrTokensJob } from "@/lib/cron/cleanup-qr-tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // FIX 2026-07-04 (auditoria nocturna, security gate):
  // Antes: si CRON_SECRET no estaba seteada, el cron corría sin auth.
  // Vercel manda Bearer pero el helper `if (cronSecret)` permitia skip
  // total del check. En produccion eso = endpoint publico si olvidaste
  // setear la env var.
  //
  // Nuevo: CRON_SECRET OBLIGATORIO en produccion. Si falta, 503 explicito
  // (no 404, asi el operador sabe "falta env var" vs "no existe el endpoint").
  // En dev, omitimos el gate para no romper pruebas locales.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "CRON_SECRET no está configurado en producción. El endpoint no puede correr sin auth. Seteala en Vercel → Environment Variables."
        },
        { status: 503 }
      );
    }
    // dev: continuamos sin auth (testing local).
  } else {
    const auth = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${cronSecret}`;
    if (auth !== expected) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  try {
    const result = await runCleanupQrTokensJob();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/cron/cleanup-qr-tokens] excepción", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Vercel Cron también puede mandar POST — aceptamos ambos por compat.
export const POST = GET;