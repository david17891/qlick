/**
 * Endpoint admin: dispara recordatorios manualmente.
 *
 * FIX 2026-07-10 (Sprint 2 v2 David): para casos donde el cron no
 * ejecutó a tiempo (ej. recordatorio 24h del 11/jul/2026 que ya pasó),
 * David puede disparar manualmente desde este endpoint.
 *
 * POST /api/admin/events/[id]/trigger-reminder
 *   body: { kind?: '24h' | '8am' | '10am' | '2h' | '1h' } (opcional)
 *
 * Si no se pasa `kind`, dispara TODAS las ventanas elegibles ahora.
 * Si se pasa `kind`, dispara solo esa ventana (filtra el resultado).
 *
 * Auth: requireAdmin (cookie de sesión del admin).
 * Idempotente: usa event_reminder_log_v2 UNIQUE constraint. Re-correr
 * no duplica envíos.
 *
 * Response: { ok, eventId, sent, failed, skipped, details }
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { runEventRemindersJob } from "@/lib/cron/event-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  // 1. Auth gate.
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  // 2. Parse body (kind opcional).
  let body: { kind?: string } = {};
  try {
    body = (await req.json()) as { kind?: string };
  } catch {
    // Body vacío es OK (dispara todas las ventanas).
    body = {};
  }

  // 3. Correr el job (procesa todas las ventanas elegibles).
  const result = await runEventRemindersJob(new Date());

  // 4. Si el admin pidió una ventana específica, filtrar.
  const validKinds = new Set(["24h", "8am", "10am", "2h", "1h"]);
  if (body.kind && validKinds.has(body.kind)) {
    const filteredDetails = result.details.filter(
      (d) => d.kind === body.kind
    );
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const d of filteredDetails) {
      sent += d.sent;
      failed += d.failed;
      skipped += d.skipped;
    }
    result.details = filteredDetails;
    result.sent = sent;
    result.failed = failed;
    result.skipped = skipped;
    result.note = `Trigger manual (kind=${body.kind}): ${sent} enviados, ${failed} fallidos, ${skipped} skipped.`;
  } else {
    result.note = `Trigger manual (todas las ventanas): ${result.sent} enviados, ${result.failed} fallidos, ${result.skipped} skipped.`;
  }

  return NextResponse.json({
    eventId: params.id,
    triggeredBy: auth.email ?? "admin",
    triggeredAt: new Date().toISOString(),
    ...result,
    ok: true,
  });
}
