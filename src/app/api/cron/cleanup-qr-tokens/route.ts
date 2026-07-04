/**
 * Cron: limpieza diaria de tokens QR viejos no usados (Fase 7a, P1-1).
 *
 * Vercel Cron llama este endpoint una vez al día (configurado en
 * `vercel.json`, schedule "0 3 * * *" = 3 AM UTC). El job borra tokens
 * que expiraron hace más de 30 días y nunca fueron usados.
 *
 * **Auth:** Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`.
 * Si está seteado, validamos; si no, aceptamos (modo dev).
 * Validación en `src/lib/api/cron-auth.ts`.
 *
 * **Response:** JSON con el resultado del run (ok, deletedCount, ranAt).
 *
 * Documentación del job: `src/lib/cron/cleanup-qr-tokens.ts`.
 */

import { NextResponse } from "next/server";
import { runCleanupQrTokensJob } from "@/lib/cron/cleanup-qr-tokens";
import { checkCronAuth } from "@/lib/api/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // 1. Auth gate (Bearer contra CRON_SECRET si está seteado).
  const authResult = checkCronAuth(req);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
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