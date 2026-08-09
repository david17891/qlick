import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig, createSupabaseAdminClient } from "@/lib/supabase";
import {
  discoverHistoricalInfoRecovery,
  HISTORICAL_INFO_RECOVERY_CAMPAIGN,
} from "@/lib/cron/lead-recovery";

export const dynamic = "force-dynamic";

async function guard(): Promise<NextResponse | null> {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json({ ok: false, error: "Supabase no configurado." }, { status: 501 });
  }
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: "No autenticado como admin." }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("lead_recovery_campaigns" as never)
    .select("state, window_kind, updated_at")
    .eq("campaign_key", HISTORICAL_INFO_RECOVERY_CAMPAIGN)
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, error: "No se pudo leer la cola de recuperación." }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  const windows: Record<string, number> = {};
  for (const row of (data ?? []) as unknown as Array<{ state?: string; window_kind?: string }>) {
    if (row.state) counts[row.state] = (counts[row.state] ?? 0) + 1;
    if (row.window_kind) windows[row.window_kind] = (windows[row.window_kind] ?? 0) + 1;
  }
  return NextResponse.json({
    ok: true,
    campaignKey: HISTORICAL_INFO_RECOVERY_CAMPAIGN,
    counts,
    windows,
    total: data?.length ?? 0,
    lastUpdatedAt: (data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null,
  });
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  let body: { action?: unknown } = {};
  try {
    body = (await req.json()) as { action?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  if (body.action !== "discover") {
    return NextResponse.json({ ok: false, error: "Acción no permitida." }, { status: 400 });
  }

  const result = await discoverHistoricalInfoRecovery(createSupabaseAdminClient());
  return NextResponse.json({ ok: true, result });
}
