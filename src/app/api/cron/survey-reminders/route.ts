/**
 * Cron: recordatorios proactivos de encuesta post-evento
 * (feat/funnel-dynamic-surveys-crm, commit 11, 2026-07-05).
 *
 * Vercel Cron llama este endpoint cada hora (configurado en
 * `vercel.json`). El job busca eventos finalizados en las últimas 4h
 * (±1h drift) y para cada attendee sin survey submitted:
 *   1. Genera (o reutiliza) `event_survey_token` con TTL 30 días.
 *   2. Envía WhatsApp con link privado a `/encuesta/[token]`.
 *   3. Loggea en `event_reminder_log` (idempotente).
 *
 * **Mensajería híbrida:** por ahora texto libre. Cuando David apruebe
 * el Meta template `conf_post_conferencia` en Meta Business Manager
 * (~24-48h), se cambia a template con variables {{1}}, {{2}}, {{3}}.
 *
 * **Idempotencia:** UNIQUE constraint en `event_reminder_log`
 * (event_id, attendee_id, reminder_kind). Re-correr no duplica.
 *
 * **Auth:** Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`.
 * Validación en `src/lib/api/cron-auth.ts`.
 *
 * **Response:** JSON con el resumen del run. Útil para debug.
 */

import { NextResponse } from "next/server";
import { runSurveyRemindersJob } from "@/lib/cron/survey-reminders";
import { checkCronAuth } from "@/lib/api/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // 1. Auth gate.
  const authResult = checkCronAuth(req);
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }

  // 2. Run job.
  try {
    const result = await runSurveyRemindersJob();
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/survey-reminders] excepción", {
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