/** Cron de recuperación de leads comerciales dentro de la ventana WhatsApp. */

import { NextResponse } from "next/server";
import { checkStrictCronAuth } from "@/lib/api/cron-auth";
import { runLeadFollowupJob } from "@/lib/cron/lead-followup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const authResult = checkStrictCronAuth(req, "LEAD_FOLLOWUP_CRON_SECRET");
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }

  try {
    return NextResponse.json(await runLeadFollowupJob(new Date()));
  } catch (error) {
    console.error("[cron/lead-followup] excepción", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export const POST = GET;
