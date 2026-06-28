"use server";

/**
 * Server actions del admin de eventos (Fase 4).
 *
 * Capa 3 (match manual) + Capa 4 (marcar/des-marcar revisada) viven
 * acá. Usados directamente desde `<form action={...}>` en el page.tsx
 * del admin. Recargan la página automáticamente (revalidatePath).
 *
 * Validación: cada action valida su input y devuelve un objeto
 * con `ok: boolean` y `note` para feedback al usuario.
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { markSurveyReviewed } from "@/lib/events/surveys-server";
import { linkAttendeeToConfirmation } from "@/lib/events/attendees-server";
import { markWhatsAppStatus, isValidWhatsAppStatus, type WhatsAppStatus } from "@/lib/leads/whatsapp-status";

export interface FormState {
  ok: boolean;
  note: string;
}

/**
 * Marca una encuesta como revisada.
 *
 * Recibe FormData con: `surveyId` (UUID), `eventId` (UUID para
 * revalidar la página).
 */
export async function markSurveyReviewedAction(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }

  const surveyId = formData.get("surveyId");
  const eventId = formData.get("eventId");
  if (typeof surveyId !== "string" || typeof eventId !== "string") {
    return { ok: false, note: "Faltan parámetros." };
  }

  const result = await markSurveyReviewed(surveyId, admin.email ?? null);
  revalidatePath(`/admin/eventos/${eventId}`);
  return { ok: result.ok, note: result.note };
}

/**
 * Des-marcar una encuesta (revierte el reviewed_at a NULL).
 *
 * Usado cuando el admin reviso por error o el contenido cambio.
 */
export async function unmarkSurveyReviewedAction(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }

  const surveyId = formData.get("surveyId");
  const eventId = formData.get("eventId");
  if (typeof surveyId !== "string" || typeof eventId !== "string") {
    return { ok: false, note: "Faltan parámetros." };
  }

  // Reutilizamos markSurveyReviewed con reviewedEmail = "" para distinguir
  // "nunca revisada" de "des-revisada". Pero necesitamos una forma de
  // distinguir. Para simplificar, llamamos una variante inline.
  // (Mejor: agregar unmarkSurveyReviewed al server lib. Lo hacemos
  //  ahora.)
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("event_surveys")
    .update({ reviewed_at: null, reviewed_by: null })
    .eq("id", surveyId);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[_actions] unmarkSurveyReviewed falló", {
      code: error.code,
      surveyId,
    });
    return { ok: false, note: `No se pudo des-marcar (${error.code ?? "unknown"}).` };
  }
  revalidatePath(`/admin/eventos/${eventId}`);
  return { ok: true, note: "Encuesta des-marcada como revisada." };
}

/**
 * Match manual de un attendee con una confirmation existente.
 *
 * Caso de uso: la persona llego al evento sin haber confirmado antes
 * (walk-in). El admin la checkeo como attendee y DESPUES confirma
 * que efectivamente habia confirmado. La matchea aca.
 */
export async function linkAttendeeToConfirmationAction(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }

  const attendeeId = formData.get("attendeeId");
  const confirmationId = formData.get("confirmationId");
  const eventId = formData.get("eventId");
  if (
    typeof attendeeId !== "string" ||
    typeof confirmationId !== "string" ||
    typeof eventId !== "string"
  ) {
    return { ok: false, note: "Faltan parámetros." };
  }

  const result = await linkAttendeeToConfirmation(attendeeId, confirmationId);
  revalidatePath(`/admin/eventos/${eventId}`);
  return { ok: result.ok, note: result.note };
}

/**
 * Cambia el estado de WhatsApp de un lead. Loggea el cambio en
 * `lead_whatsapp_log` (audit append-only).
 *
 * FormData: leadId, newStatus, eventId (opcional, para trazabilidad),
 * messagePreview (opcional, primeros 200 chars del mensaje enviado).
 */
export async function markWhatsAppStatusAction(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }

  const leadId = formData.get("leadId");
  const newStatus = formData.get("newStatus");
  const eventId = formData.get("eventId");
  const messagePreview = formData.get("messagePreview");
  if (typeof leadId !== "string" || typeof newStatus !== "string") {
    return { ok: false, note: "Faltan leadId o newStatus." };
  }
  if (!isValidWhatsAppStatus(newStatus)) {
    return { ok: false, note: `Estado invalido: ${newStatus}.` };
  }

  const result = await markWhatsAppStatus({
    leadId,
    newStatus: newStatus as WhatsAppStatus,
    actorEmail: admin.email ?? null,
    eventId: typeof eventId === "string" && eventId ? eventId : null,
    messagePreview:
      typeof messagePreview === "string" && messagePreview
        ? messagePreview.slice(0, 200)
        : null,
  });
  if (typeof eventId === "string" && eventId) {
    revalidatePath(`/admin/eventos/${eventId}`);
  }
  return { ok: result.ok, note: result.note };
}
