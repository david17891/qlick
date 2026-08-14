import { NextResponse, type NextRequest } from "next/server";
import { runEventPaymentFollowupsJob } from "@/lib/cron/event-payment-followups";
import { runEventPaymentReconciliationJob } from "@/lib/cron/event-payment-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.EVENT_PAYMENT_FOLLOWUP_CRON_SECRET?.trim()
    || process.env.CRON_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  const authorization = req.headers.get("authorization") ?? "";
  return authorization === `Bearer ${expected}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const now = new Date();
    // La reconciliación corre en el mismo job durable de Supabase (cada 15
    // minutos). Así OXXO/SPEI no dependen de que el webhook haya llegado y
    // no se crea un segundo cron con otra credencial.
    const reconciliation = await runEventPaymentReconciliationJob(now);
    const followups = await runEventPaymentFollowupsJob(now);
    return NextResponse.json({ ...followups, reconciliation }, { status: followups.ok ? 200 : 500 });
  } catch (error) {
    console.error("[cron/event-payment-followups] excepción", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
