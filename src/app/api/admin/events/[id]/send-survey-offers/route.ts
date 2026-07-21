import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getEventById } from "@/lib/events/events-server";
import { getAttendeesByEventId } from "@/lib/events/attendees-server";
import { getConfirmationsByEventId } from "@/lib/events/confirmations-server";
import { logAdminAction } from "@/lib/crm/audit-server";
import { metaCloudApiProvider } from "@/lib/whatsapp";
import { buildSurveyOfferMessage } from "@/lib/whatsapp/survey-messages";
import type { EventAttendee } from "@/types/events";
import type { EventConfirmation } from "@/types/events";

/**
 * POST /api/admin/events/[id]/send-survey-offers
 *
 * Manda un WhatsApp interactivo (Sí / Ahora no) ofreciendo la encuesta
 * post-evento a los asistentes del evento (con teléfono válido).
 *
 * Si NO hay asistentes (caso típico de simulación antes del check-in),
 * cae automáticamente a los confirmados. Esto permite a David probar
 * el flujo de encuesta sin necesidad de marcar check-in primero.
 *
 * Devuelve:
 *   {
 *     ok: true | false,
 *     eventId, eventTitle,
 *     scope: "attendees" | "confirmations" | "empty",
 *     sent: number,
 *     failed: number,
 *     skipped: number,           // sin teléfono
 *     items: Array<{
 *       name: string | null,
 *       phone: string,           // enmascarado para no loggear PII completa
 *       ok: boolean,
 *       providerId?: string,     // whatsapp external ID
 *       note: string,
 *     }>
 *   }
 *
 * Pre-requisito WhatsApp 24h: cada envío al lead debe estar dentro de
 * las 24h del último mensaje del lead, si no Meta Cloud API devuelve
 * error 4xx. La UI no valida esto — dejamos que el provider reporte.
 *
 * Manual test 2026-07-05: David estaba probando el flow de encuesta
 * sin haber hecho check-in, así que este endpoint cubre ambos casos.
 */

interface ItemResult {
  attendeeId?: string;
  confirmationId?: string;
  name: string | null;
  phoneMasked: string;
  ok: boolean;
  providerId?: string;
  note: string;
}

function maskPhone(phone: string): string {
  // Enmascarar PII en logs. "521234567890" → "52****7890"
  if (phone.length <= 6) return "****";
  return `${phone.slice(0, 2)}****${phone.slice(-4)}`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  // Recolectar destinatarios. Attendees primero; si no hay, fallback a
  // confirmados. Cada item tiene `phoneNormalized` para enviar.
  interface Recipient {
    name: string | null;
    phone: string;
    attendeeId?: string;
    confirmationId?: string;
  }

  const attendees = await getAttendeesByEventId(params.id);
  let scope: "attendees" | "confirmations" | "empty" = "attendees";
  let recipients: Recipient[] = attendees
    .filter((a: EventAttendee) => !!a.phoneNormalized)
    .map((a: EventAttendee) => ({
      name: a.name ?? null,
      phone: a.phoneNormalized!,
      attendeeId: a.id
    }));

  if (recipients.length === 0) {
    scope = "confirmations";
    const confirms = await getConfirmationsByEventId(params.id);
    recipients = confirms
      .filter((c: EventConfirmation) => !!c.phoneNormalized)
      .map((c: EventConfirmation) => ({
        name: c.name,
        phone: c.phoneNormalized!,
        confirmationId: c.id
      }));
  }
  if (recipients.length === 0) {
    scope = "empty";
  }

  if (recipients.length === 0) {
    // Audit log aunque no haya envíos — la acción del admin es la que
    // importa para trazabilidad ("intentó mandar encuestas, no había
    // destinatarios").
    await logAdminAction({
      actor_email: admin.email,
      action: "send_survey_offers",
      entity_type: "event",
      entity_id: event.id,
      metadata: {
        eventTitle: event.title,
        scope: "empty",
        sent: 0,
        failed: 0,
        skipped: 0
      },
      before: null,
      after: null
    });
    return NextResponse.json({
      ok: true,
      eventId: event.id,
      eventTitle: event.title,
      scope: "empty",
      sent: 0,
      failed: 0,
      skipped: 0,
      items: [],
      note: "No hay asistentes ni confirmados con teléfono. Haz check-in o inscribe gente con teléfono primero."
    });
  }

  // Construir el mensaje una sola vez por evento (mismo título y saludo).
  // El builder del survey-messages.ts usa el `eventTitle` provisto.
  const items: ItemResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    const built = buildSurveyOfferMessage({
      leadName: r.name,
      eventTitle: event.title
    });
    const result = await metaCloudApiProvider.send({
      to: r.phone,
      body: built.text,
      interactive: built.interactive
    });
    items.push({
      attendeeId: r.attendeeId,
      confirmationId: r.confirmationId,
      name: r.name,
      phoneMasked: maskPhone(r.phone),
      ok: result.ok,
      providerId: result.externalId,
      note: result.note
    });
    if (result.ok) sent++;
    else failed++;
  }

  await logAdminAction({
    actor_email: admin.email,
    action: "send_survey_offers",
    entity_type: "event",
    entity_id: event.id,
    metadata: {
      eventTitle: event.title,
      scope,
      sent,
      failed,
      skipped: 0,
      provider: "meta_cloud_api"
    },
    before: null,
    after: null
  });

  return NextResponse.json({
    ok: true,
    eventId: event.id,
    eventTitle: event.title,
    scope,
    sent,
    failed,
    skipped: 0,
    items,
    note:
      sent > 0
        ? `${sent} encuesta${sent === 1 ? "" : "s"} enviada${sent === 1 ? "" : "s"} a ${scope}.`
        : `Fallaron todos los envíos. Revisá la configuración de WhatsApp Cloud (WHATSAPP_CLOUD_PHONE_NUMBER_ID + WHATSAPP_CLOUD_ACCESS_TOKEN).`
  });
}
