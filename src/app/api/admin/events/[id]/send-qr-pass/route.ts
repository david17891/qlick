/**
 * POST /api/admin/events/[id]/send-qr-pass
 *
 * Re-envía el email de "pase digital / QR pass" al asistente de un evento.
 *
 * Caso de uso (sesión 2026-07-07 ~22:00): David atendió a Gabriela Terán
 * por WhatsApp directo, la registró vía `scripts/_register-attendee-manual.mjs`,
 * pero en ese momento Brevo API key no estaba disponible en la session
 * local (sí en Vercel runtime). Ahora David quiere disparar el email desde
 * la sesión de admin sin pegar la key localmente.
 *
 * Auth: `requireAdmin()` (gate via ADMIN_EMAIL_ALLOWLIST). Loggeado en
 * `admin_audit_log` con snapshots before/after.
 *
 * Request body:
 *   { email: string }       OR
 *   { attendeeEmail: string } OR
 *   { phone: string }       OR
 *   { attendeePhone: string }
 *
 * Resolution order:
 *   1. lookup by email (case-insensitive exact)
 *   2. lookup by phone_normalized (E.164)
 *   3. fallback: si no encuentra en estos, 404 con mensaje claro
 *
 * Response:
 *   {
 *     ok: true | false,
 *     eventId, eventTitle,
 *     lead: { id, name, email, phoneMasked } | null,
 *     confirmation: { id } | null,
 *     qr: { token, url } | null,
 *     email: {
 *       ok: boolean,
 *       mode: "dev" | "prod",
 *       id?: string,            // Brevo messageId (solo prod exitoso)
 *       error?: string,
 *     },
 *   }
 *
 * FIX 2026-07-07 (sesión David "no tengo Brevo local"): este endpoint
 * usa la Brevo API key de VERCEL RUNTIME (que sí está configurada),
 * NO requiere que David pegue la key en .env.local. Self-service.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getEventById } from "@/lib/events/events-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEventQrPassEmail } from "@/lib/email/event-qr-pass";
import { logAdminAction } from "@/lib/crm/audit-server";
import { normalizePhone } from "@/lib/crm/phone-utils";

interface RouteParams {
  params: { id: string };
}

interface RequestBody {
  email?: string;
  attendeeEmail?: string;
  phone?: string;
  attendeePhone?: string;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return "****";
  return `${phone.slice(0, 2)}****${phone.slice(-4)}`;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin." },
      { status: 401 },
    );
  }

  const event = await getEventById(params.id);
  if (!event) {
    return NextResponse.json(
      { ok: false, error: "Evento no existe." },
      { status: 404 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body JSON inválido." },
      { status: 400 },
    );
  }

  const targetEmail = (body.email ?? body.attendeeEmail)?.trim().toLowerCase();
  const targetPhoneRaw = body.phone ?? body.attendeePhone;
  const targetPhone = targetPhoneRaw ? normalizePhone(targetPhoneRaw) : null;
  if (!targetEmail && !targetPhone) {
    return NextResponse.json(
      { ok: false, error: "Falta `email` o `phone` en el body." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  // 1. Buscar confirmation del attendee en este evento.
  let confirmationQuery = supabase
    .from("event_confirmations")
    .select("id, name, email, phone_normalized")
    .eq("event_id", event.id);
  if (targetEmail) {
    confirmationQuery = confirmationQuery.ilike("email", targetEmail);
  } else if (targetPhone) {
    confirmationQuery = confirmationQuery.eq("phone_normalized", targetPhone);
  }
  const { data: confirmation, error: confErr } = await confirmationQuery
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (confErr) {
    return NextResponse.json(
      { ok: false, error: `Confirmation lookup falló: ${confErr.message}` },
      { status: 500 },
    );
  }
  if (!confirmation) {
    return NextResponse.json(
      {
        ok: false,
        error: "Asistente no encontrado en este evento. Verifica email/phone.",
      },
      { status: 404 },
    );
  }

  // 2. Buscar QR token vigente o regenerar uno nuevo.
  let qrToken: { token: string; url: string } | null = null;
  const phoneSentinel =
    confirmation.phone_normalized ||
    `+1manual${(confirmation.email ?? "").replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
  const { data: existingToken } = await supabase
    .from("event_qr_tokens")
    .select("token")
    .eq("event_id", event.id)
    .eq("attendee_phone_normalized", phoneSentinel)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.qlick.digital";
  if (existingToken) {
    const t = (existingToken as { token: string }).token;
    qrToken = { token: t, url: `${baseUrl}/check-in/${t}` };
  } else {
    const token = randomBytes(24).toString("base64url").slice(0, 32);
    const endsAt = event.endsAt ? new Date(event.endsAt) : new Date();
    const expiresAt = new Date(endsAt.getTime() + 6 * 60 * 60 * 1000);
    const { data: newToken, error: qrErr } = await supabase
      .from("event_qr_tokens")
      .insert({
        event_id: event.id,
        attendee_phone_normalized: phoneSentinel,
        attendee_name: confirmation.name,
        attendee_email: confirmation.email,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select("token")
      .maybeSingle();
    if (qrErr) {
      return NextResponse.json(
        { ok: false, error: `QR insert falló: ${qrErr.message}` },
        { status: 500 },
      );
    }
    const t = (newToken as { token: string } | null)?.token;
    if (t) {
      qrToken = { token: t, url: `${baseUrl}/check-in/${t}` };
    }
  }

  // 3. Resolver lead (para audit log / admin UI).
  let lead = null;
  if (confirmation.email) {
    const { data } = await supabase
      .from("leads")
      .select("id, name, email, phone_normalized")
      .eq("email", confirmation.email.toLowerCase())
      .maybeSingle();
    lead = data ?? null;
  }

  // 4. Disparar email via Brevo (runtime Vercel).
  if (!confirmation.email) {
    return NextResponse.json(
      {
        ok: false,
        error: "Confirmation sin email — no se puede enviar QR pass.",
      },
      { status: 400 },
    );
  }
  if (!qrToken) {
    return NextResponse.json(
      { ok: false, error: "No se pudo generar/obtener QR token." },
      { status: 500 },
    );
  }

  const qrImageUrl = `${baseUrl}/api/event-qr/${qrToken.token}.png`;
  const gateUrl =
    event.format && event.format !== "in_person"
      ? `${baseUrl}/api/event-gate/${encodeURIComponent(qrToken.token)}/click`
      : undefined;

  // FIX 2026-07-15 (sprint pagos-manuales): si el evento es de cobro,
  // pasamos el bloque de pago al template para que el email re-enviado
  // también incluya el CTA al checkout (mismo comportamiento que el
  // form público). Sin esto, el botón "Reenviar email" mostraba el
  // email SIN el bloque de pago aunque el evento costara.
  const paymentUrl =
    event.priceMXN && event.priceMXN > 0
      ? `${baseUrl}/pagar/evento/${event.slug}?confirmation=${confirmation.id}`
      : undefined;

  let emailResult: {
    ok: boolean;
    mode: "dev" | "prod";
    id?: string;
    error?: string;
  };
  try {
    const result = await sendEventQrPassEmail(
      {
        attendeeName: confirmation.name ?? "Asistente",
        attendeeEmail: confirmation.email,
      eventTitle: event.title,
      eventStartsAt: new Date(event.startsAt).toISOString(),
      eventLocation: event.location ?? null,
        qrImageUrl,
        checkInUrl: qrToken.url,
        format: event.format ?? "in_person",
        gateUrl,
        streamingAccessNote: event.streamingAccessNote ?? undefined,
        priceMXN: event.priceMXN,
        paymentUrl,
      },
      { eventId: event.id, eventQrTokenId: null },
    );
    emailResult = {
      ok: result.ok,
      mode: result.mode,
      id: result.id,
      error: result.error,
    };
  } catch (sendErr) {
    emailResult = {
      ok: false,
      mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
      error: sendErr instanceof Error ? sendErr.message : String(sendErr),
    };
  }

  // 5. Audit log (best-effort, no rompe el flow si falla).
  try {
    await logAdminAction({
      action: "manual_send_qr_pass",
      entity_type: "event_qr_token",
      entity_id: qrToken.token,
      actor_email: admin.email ?? "unknown",
      metadata: {
        eventId: event.id,
        leadId: lead?.id ?? null,
        confirmationId: confirmation.id,
        attendeeEmail: confirmation.email,
        emailResult,
      },
    });
  } catch {
    /* swallow */
  }

  return NextResponse.json({
    ok: emailResult.ok,
    eventId: event.id,
    eventTitle: event.title,
    lead: lead
      ? {
          id: lead.id,
          name: confirmation.name,
          email: confirmation.email,
          phoneMasked: confirmation.phone_normalized
            ? maskPhone(confirmation.phone_normalized)
            : null,
        }
      : null,
    confirmation: { id: confirmation.id },
    qr: qrToken,
    email: emailResult,
  });
}
