import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getCRMOwners } from "@/lib/crm/owners-server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json({ ok: true, demo: true, owners: [] });
  }
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "No autenticado como admin." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, demo: false, owners: getCRMOwners() });
}
