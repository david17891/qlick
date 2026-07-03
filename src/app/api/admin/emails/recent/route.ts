/**
 * Endpoint admin: lista emails transaccionales recientes del sistema.
 *
 * FIX P1 2026-07-03 (auditoria pre-scanner, sesion David): antes los
 * emails del bot (QR pass) y del cron (reminders) solo se loggeaban en
 * consola. Cuando un email fallaba en Brevo, el admin no tenia forma de
 * verlo. David reporto "no me llego correo, mismo caso por ahora".
 *
 * Ahora cada email persiste en `event_email_log` (ver `lib/email/log.ts`).
 * Este endpoint devuelve los ultimos N para que el admin los inspeccione.
 *
 * Query params:
 *   - eventId?: string  — filtra por evento especifico
 *   - sinceDays?: number (default 7) — ventana de tiempo
 *   - failedOnly?: boolean (default false) — si true, solo ok=false
 *   - limit?: number (default 50, max 200) — cap de filas
 *
 * Auth: requiere `requireAdmin()` (defensa en profundidad, ademas del
 * middleware /api/admin/*).
 *
 * Server-only.
 */

import { NextResponse } from "next/server";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface EmailLogRow {
  id: string;
  email_type: "qr_pass" | "reminder_24h" | "reminder_2h";
  event_id: string | null;
  event_qr_token_id: string | null;
  recipient: string;
  attendee_name: string | null;
  subject: string;
  ok: boolean;
  error: string | null;
  provider_message_id: string | null;
  sent_at: string;
}

export interface EmailLogEntry {
  id: string;
  emailType: EmailLogRow["email_type"];
  eventId: string | null;
  eventQrTokenId: string | null;
  recipient: string;
  attendeeName: string | null;
  subject: string;
  ok: boolean;
  error: string | null;
  providerMessageId: string | null;
  sentAt: string;
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseBool(value: string | null): boolean {
  return value === "true" || value === "1";
}

export async function GET(req: Request) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json({
      ok: false,
      demo: true,
      entries: [],
      total: 0,
      failed: 0,
      note: "Supabase no configurado.",
    });
  }

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const eventId = url.searchParams.get("eventId");
  const sinceDays = clampInt(url.searchParams.get("sinceDays"), 7, 1, 90);
  const failedOnly = parseBool(url.searchParams.get("failedOnly"));
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);

  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("event_email_log" as never)
    .select("*")
    .gte("sent_at" as never, cutoff)
    .order("sent_at" as never, { ascending: false })
    .limit(limit);

  if (eventId) {
    query = query.eq("event_id" as never, eventId);
  }
  if (failedOnly) {
    query = query.eq("ok" as never, false);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[api/admin/emails/recent] SELECT falló", {
      code: (error as { code?: string }).code,
    });
    return NextResponse.json(
      { ok: false, error: `DB error (${(error as { code?: string }).code ?? "?"})` },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as EmailLogRow[];
  const entries: EmailLogEntry[] = rows.map((r) => ({
    id: r.id,
    emailType: r.email_type,
    eventId: r.event_id,
    eventQrTokenId: r.event_qr_token_id,
    recipient: r.recipient,
    attendeeName: r.attendee_name,
    subject: r.subject,
    ok: r.ok,
    error: r.error,
    providerMessageId: r.provider_message_id,
    sentAt: r.sent_at,
  }));
  const failed = entries.filter((e) => !e.ok).length;

  return NextResponse.json({
    ok: true,
    entries,
    total: entries.length,
    failed,
    filters: { eventId, sinceDays, failedOnly, limit },
    note: failed === 0
      ? "Sin emails fallidos en la ventana."
      : `${failed} email(s) fallido(s) en la ventana.`,
  });
}