import { NextResponse, type NextRequest } from "next/server";
import { runEventPaymentFollowupsJob } from "@/lib/cron/event-payment-followups";

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
    const result = await runEventPaymentFollowupsJob(new Date());
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    console.error("[cron/event-payment-followups] excepción", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
