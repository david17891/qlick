/**
 * POST /api/admin/events/[id]/confirmations
 *
 * Alta manual de un confirmado al evento (admin).
 *
 * Caso de uso (sesión David 2026-07-07): David quiere poder agregar
 * confirmados desde el panel admin (no solo vía Excel/WhatsApp bot) — ej:
 * alguien que llamó por teléfono, walk-in que pidió registro previo,
 * o un amigo que confirmó fuera de banda. También dispara el email del
 * QR pass automáticamente si tiene email.
 *
 * Auth: `requireAdmin()` (gate via ADMIN_EMAIL_ALLOWLIST).
 *
 * Request body:
 *   {
 *     name: string,                  // requerido
 *     email?: string,
 *     phone?: string,                // E.164 idealmente; sino raw que normalizePhone pueda arreglar
 *     sendEmail?: boolean = true,    // si tiene email, dispara sendEventQrPassEmail
 *   }
 *
 * Validaciones:
 *   - name requerido.
 *   - Al menos uno de email o phone (igual que _register-attendee-manual.mjs).
 *   - phone se normaliza con `normalizePhone`.
 *
 * Pasos:
 *   1. Resolver evento (404 si no existe).
 *   2. Crear o actualizar lead (idempotente por email/phone).
 *   3. Crear confirmation (idempotente — reusa si ya existe).
 *   4. Generar QR token (idempotente — reusa si hay vigente).
 *   5. Si sendEmail=true y confirmation.email: enviar QR pass.
 *   6. Audit log.
 *
 * Response:
 *   {
 *     ok: true,
 *     eventId, eventTitle,
 *     lead: { id, name, email, phoneMasked } | null,
 *     confirmation: { id, name, email, phoneMasked, created },
 *     qr: { token, url } | null,
 *     email: { ok, mode, id?, error? } | null,
 *   }
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getEventById } from "@/lib/events/events-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/crm/phone-utils";
import { sendEventQrPassEmail } from "@/lib/email/event-qr-pass";
import { logAdminAction } from "@/lib/crm/audit-server";

interface RouteParams {
  params: { id: string };
}

interface RequestBody {
  name?: string;
  email?: string;
  phone?: string;
  sendEmail?: boolean;
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

  const name = body.name?.trim();
  const emailRaw = body.email?.trim().toLowerCase() || null;
  const phoneRaw = body.phone?.trim() || null;
  const phoneNormalized = phoneRaw
    ? (() => {
        try {
          return normalizePhone(phoneRaw);
        } catch {
          return null;
        }
      })()
    : null;
  const sendEmail = body.sendEmail !== false;

  // Patrón `placeholder.local` (mismo que usa el bot-engine.ts cuando
  // alguien se registra sin email): email sintético no-enviable para
  // satisfacer el constraint NOT NULL en leads.email. Marcamos
  // internamente con @placeholder.local para no mandarle nada.
  const emailForDb =
    emailRaw ??
    (phoneNormalized
      ? `${phoneNormalized.replace(/\D/g, "").slice(-10)}@placeholder.local`
      : `unknown-${Date.now()}@placeholder.local`);

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Falta `name`." },
      { status: 400 },
    );
  }
  if (!emailRaw && !phoneNormalized) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Falta `email` o `phone`. Se requiere al menos uno (no se puede confirmar sin contacto).",
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  // 1. Crear o actualizar lead (idempotente).
  let lead = null;
  try {
    // Buscar primero.
    let existing = null;
    if (emailRaw) {
      const { data } = await supabase
        .from("leads")
        .select("id, name, email, phone_normalized")
        .eq("email", emailRaw)
        .maybeSingle();
      existing = data;
    }
    if (!existing && phoneNormalized) {
      const { data } = await supabase
        .from("leads")
        .select("id, name, email, phone_normalized")
        .eq("phone_normalized", phoneNormalized)
        .maybeSingle();
      existing = data;
    }

    if (existing) {
      // Update nombre + phone si difieren. Tipado explícito para que el
      // `.update()` acepte el patch sin chocar con el tipo generado.
      const patch: { name?: string; phone_normalized?: string } = {};
      if (name && existing.name !== name) patch.name = name;
      if (phoneNormalized && existing.phone_normalized !== phoneNormalized) {
        patch.phone_normalized = phoneNormalized;
      }
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await supabase
          .from("leads")
          .update(patch as never)
          .eq("id", existing.id);
        if (updErr) throw updErr;
      }
      lead = existing;
    } else {
      // Crear lead nuevo.
      const { data: created, error: insErr } = await supabase
        .from("leads")
        .insert({
          name,
          email: emailForDb,
          phone_normalized: phoneNormalized ?? undefined,
          consent_to_contact: true,
          whatsapp_status: "no_contactado",
          source: "manual",
        })
        .select("id, name, email, phone_normalized")
        .maybeSingle();
      if (insErr) throw insErr;
      lead = created;
    }
  } catch (leadErr) {
    return NextResponse.json(
      {
        ok: false,
        error: `Lead upsert falló: ${leadErr instanceof Error ? leadErr.message : String(leadErr)}`,
      },
      { status: 500 },
    );
  }

  // 2. Crear confirmation (idempotente).
  let confirmation = null;
  let confirmationCreated = false;
  try {
    // Buscar existente por email o phone.
    let existingConf = null;
    if (emailRaw) {
      const { data } = await supabase
        .from("event_confirmations")
        .select("id, name, email, phone_normalized")
        .eq("event_id", event.id)
        .ilike("email", emailRaw)
        .maybeSingle();
      existingConf = data;
    }
    if (!existingConf && phoneNormalized) {
      const { data } = await supabase
        .from("event_confirmations")
        .select("id, name, email, phone_normalized")
        .eq("event_id", event.id)
        .eq("phone_normalized", phoneNormalized)
        .maybeSingle();
      existingConf = data;
    }

    if (existingConf) {
      confirmation = existingConf;
      confirmationCreated = false;
    } else {
      const { data, error: confErr } = await supabase
        .from("event_confirmations")
        .insert({
          event_id: event.id,
          name,
          email: emailRaw,
          phone_raw: phoneRaw,
          phone_normalized: phoneNormalized,
          source: "manual",
        })
        .select("id, name, email, phone_normalized")
        .maybeSingle();
      if (confErr) throw confErr;
      confirmation = data;
      confirmationCreated = true;
    }
  } catch (confErr) {
    return NextResponse.json(
      {
        ok: false,
        error: `Confirmation upsert falló: ${confErr instanceof Error ? confErr.message : String(confErr)}`,
      },
      { status: 500 },
    );
  }

  // 3. Generar / reutilizar QR token (idempotente).
  let qrToken: { token: string; url: string } | null = null;
  try {
    const phoneSentinel =
      phoneNormalized ||
      `+1manual${(emailRaw ?? "").replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
    const { data: existingToken } = await supabase
      .from("event_qr_tokens")
      .select("token, expires_at")
      .eq("event_id", event.id)
      .eq("attendee_phone_normalized", phoneSentinel)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://www.qlick.digital";

    if (existingToken) {
      qrToken = {
        token: (existingToken as { token: string }).token,
        url: `${baseUrl}/check-in/${(existingToken as { token: string }).token}`,
      };
    } else {
      const token = randomBytes(24).toString("base64url").slice(0, 32);
      const endsAt = event.endsAt ? new Date(event.endsAt) : new Date();
      const expiresAt = new Date(endsAt.getTime() + 6 * 60 * 60 * 1000);
      const { data, error: qrErr } = await supabase
        .from("event_qr_tokens")
        .insert({
          event_id: event.id,
          attendee_phone_normalized: phoneSentinel,
          attendee_name: name,
          attendee_email: emailRaw,
          token,
          expires_at: expiresAt.toISOString(),
        })
        .select("token")
        .maybeSingle();
      if (qrErr) throw qrErr;
      const t = (data as { token: string } | null)?.token;
      if (t) qrToken = { token: t, url: `${baseUrl}/check-in/${t}` };
    }
  } catch (qrErr) {
    return NextResponse.json(
      {
        ok: false,
        error: `QR token falló: ${qrErr instanceof Error ? qrErr.message : String(qrErr)}`,
      },
      { status: 500 },
    );
  }

  // 4. Enviar email (best-effort).
  let emailResult: {
    ok: boolean;
    mode: "dev" | "prod";
    id?: string;
    error?: string;
  } | null = null;
  if (sendEmail && emailRaw && qrToken) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.qlick.digital";
    const qrImageUrl = `${baseUrl}/api/event-qr/${qrToken.token}.png`;
    const gateUrl =
      event.format && event.format !== "in_person"
        ? `${baseUrl}/api/event-gate/${encodeURIComponent(qrToken.token)}/click`
        : undefined;
    try {
      const result = await sendEventQrPassEmail(
        {
          attendeeName: name,
          attendeeEmail: emailRaw,
          eventTitle: event.title,
          eventStartsAt: new Date(event.startsAt).toISOString(),
          eventLocation: event.location ?? null,
          qrImageUrl,
          checkInUrl: qrToken.url,
          format: event.format ?? "in_person",
          gateUrl,
          streamingAccessNote: event.streamingAccessNote ?? undefined,
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
  }

  // 5. Audit log.
  try {
    await logAdminAction({
      action: "manual_create_confirmation",
      entity_type: "event_confirmation",
      entity_id: confirmation?.id ?? "unknown",
      actor_email: admin.email ?? "unknown",
      metadata: {
        eventId: event.id,
        leadId: lead?.id ?? null,
        confirmationId: confirmation?.id ?? null,
        attendeeEmail: emailRaw,
        attendeePhone: phoneNormalized ? maskPhone(phoneNormalized) : null,
        sendEmail,
        emailResult,
        confirmationCreated,
      },
    });
  } catch {
    /* swallow */
  }

  return NextResponse.json({
    ok: true,
    eventId: event.id,
    eventTitle: event.title,
    lead: lead
      ? {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phoneMasked: lead.phone_normalized ? maskPhone(lead.phone_normalized) : null,
        }
      : null,
    confirmation: confirmation
      ? {
          id: confirmation.id,
          name: confirmation.name,
          email: confirmation.email,
          phoneMasked: confirmation.phone_normalized
            ? maskPhone(confirmation.phone_normalized)
            : null,
          created: confirmationCreated,
        }
      : null,
    qr: qrToken,
    email: emailResult,
  });
}