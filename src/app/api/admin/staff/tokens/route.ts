/**
 * Endpoint admin: lista los tokens QR activos de un evento.
 *
 * GET /api/admin/staff/tokens?eventId=...
 *   Auth: requireAdmin() (defensa en profundidad, ademas del middleware).
 *   Response: { ok, tokens: [{ token, attendeeName, attendeePhone, attendeeEmail, checkedInAt }] }
 *
 * FIX 2026-07-03 v8 (sesion David): para que David pueda probar el scanner
 * sin necesidad de generar QRPs de asistentes reales, este endpoint le
 * da los tokens ya generados del evento. Limite: 10 mas recientes activos.
 *
 * Server-only.
 */

import { NextResponse } from "next/server";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface TokenRow {
  token: string;
  attendee_name: string;
  attendee_phone_normalized: string | null;
  attendee_email: string | null;
  checked_in_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  is_shared_qr: boolean;
  max_check_ins: number;
  check_in_count: number;
}

export async function GET(req: Request) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json({ ok: false, error: "Supabase no configurado." }, { status: 501 });
  }

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ ok: false, error: "Falta eventId." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("event_qr_tokens" as never)
    .select("token, attendee_name, attendee_phone_normalized, attendee_email, checked_in_at, expires_at, revoked_at, is_shared_qr, max_check_ins, check_in_count")
    .eq("event_id" as never, eventId)
    .is("revoked_at" as never, null)
    .gt("expires_at" as never, nowIso)
    .order("created_at" as never, { ascending: false })
    .limit(10);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `DB error (${(error as { code?: string }).code ?? "?"})` },
      { status: 500 },
    );
  }

  const tokens = ((data ?? []) as unknown as TokenRow[]).map((r) => ({
    token: r.token,
    attendeeName: r.attendee_name,
    attendeePhone: r.attendee_phone_normalized,
    attendeeEmail: r.attendee_email,
    checkedInAt: r.checked_in_at,
    isSharedQr: r.is_shared_qr,
    maxCheckIns: r.max_check_ins,
    checkInCount: r.check_in_count,
  }));

  return NextResponse.json({ ok: true, tokens });
}
