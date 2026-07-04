/**
 * Cron: recordatorios automáticos de eventos (Fase 7a, Bloque 3).
 *
 * Vercel Cron llama este endpoint cada 30 min (configurado en
 * `vercel.json`). El job evalúa qué eventos están a 24h o 2h de empezar
 * y manda un email recordatorio a cada confirmado que aún no lo recibió.
 *
 * **Idempotencia:** los inserts en `event_reminder_log` usan la PK
 * compuesta (event_qr_token_id, reminder_kind) + ON CONFLICT. Re-correr
 * no duplica.
 *
 * **Auth:** Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`.
 * Si está seteado, validamos; si no, aceptamos (modo dev).
 *
 * **Response:** JSON con el resumen del run (sent/failed/skipped por
 * ventana y evento). Útil para debug en Vercel Logs.
 */

import { NextResponse } from "next/server";
import { runEventRemindersJob } from "@/lib/cron/event-reminders";

export const dynamic = "force-dynamic";
// No queremos que Next cachee el cron — cada ejecución debe ser fresca.
export const runtime = "nodejs";

export async function GET(req: Request) {
  // 1. Auth: Vercel Cron manda Bearer con CRON_SECRET.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${cronSecret}`;
    if (auth !== expected) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  // 2. Run job.
  try {
    const result = await runEventRemindersJob(new Date());
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/event-reminders] excepción", {
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