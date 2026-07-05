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
 *
 * FIX 2026-07-03 (sesion David, admin cleanup): se agregaron
 * `deleteConfirmationAction` y `deleteAttendeeAction` para que David
 * pueda limpiar registros de prueba desde el admin (antes no habia
 * forma de hacerlo).
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { markSurveyReviewed, deleteEventSurvey } from "@/lib/events/surveys-server";
import { linkAttendeeToConfirmation, deleteAttendee } from "@/lib/events/attendees-server";
import { deleteConfirmation } from "@/lib/events/confirmations-server";
import { markWhatsAppStatus, isValidWhatsAppStatus, type WhatsAppStatus } from "@/lib/leads/whatsapp-status";
import { generateEventQrTokens, getEventQrTokens } from "@/lib/qr/event-tokens";
import { logAdminAction } from "@/lib/crm/audit-server";
import { promoteSurveyToLead } from "@/lib/events/promotion";

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
 * FIX 2026-07-05 (Fase 7d.1 cleanup): elimina una encuesta por ID. Solo
 * para uso admin — limpia registros duplicados que pasaron antes del
 * dedupe. NO es para uso normal; el flujo principal es "Marcar
 * revisada" o "Promover a lead".
 *
 * FormData: surveyId, eventId.
 */
export async function deleteSurveyAction(
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
  if (!surveyId || !eventId) {
    return { ok: false, note: "surveyId o eventId vacíos." };
  }
  const result = await deleteEventSurvey(surveyId);
  if (result.ok) {
    revalidatePath(`/admin/eventos/${eventId}`);
  }
  return result;
}

/**
 * FIX 2026-07-05 (Fase 7d.1 cleanup): promoción manual de una encuesta a
 * lead. Reemplaza el flujo auto-promote del wizard — ahora el admin
 * decide desde esta tab Encuestas cuando una encuesta con
 * `consentToContact=true` debe promoverse.
 *
 * Reusa `promoteSurveyToLead` (Fase 4 funnel-survey) que aplica las 3
 * reglas del concept §5: lead_id existente, score, qualification.
 * Idempotente: si ya estaba promovida, devuelve ok:true con nota.
 *
 * FormData: surveyId, eventId.
 */
export async function promoteSurveyAction(
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
  if (!surveyId || !eventId) {
    return { ok: false, note: "surveyId o eventId vacíos." };
  }
  const result = await promoteSurveyToLead(surveyId, {
    actorEmail: admin.email
  });
  if (result.ok) {
    revalidatePath(`/admin/eventos/${eventId}`);
    revalidatePath("/admin");
  }
  return {
    ok: result.ok,
    note: result.note
  };
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

// ─────────────────────────────────────────────────────────────
// QR tokens para check-in en puerta (Sub-bloque D / Fase 6 Hito C)
// ─────────────────────────────────────────────────────────────

/**
 * Genera (o reutiliza) tokens QR para todos los confirmados del evento.
 *
 * Devuelve un payload con la lista de tokens + QRs en data URL. La
 * server action devuelve `{ok, note, csv}` — el `csv` se usa para que
 * el admin descargue un CSV imprimible con las URLs (cada QR se imprime
 * físicamente y se pega en la acreditación del asistente).
 *
 * FormData esperado:
 *   - eventId: string (UUID)
 *
 * Re-llamar la action es idempotente: si ya hay tokens activos (no
 * expirados, no checkeados) para el (event_id, phone), los reutiliza.
 */
export async function generateQrTokensAction(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState & { csv?: string; count?: number; created?: number }> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string" || !eventId) {
    return { ok: false, note: "Falta eventId." };
  }

  const result = await generateEventQrTokens({ eventId });
  if (!result.ok) {
    return { ok: false, note: result.note };
  }

  // Audit log del admin action.
  await logAdminAction({
    actor_email: admin.email ?? "system@qlick",
    action: "event_qr_tokens_generate",
    entity_type: "event",
    entity_id: eventId,
    metadata: {
      total: result.totalAttempted,
      created: result.newlyCreated,
      alreadyCheckedIn: result.alreadyCheckedIn,
    },
  });

  // CSV descargable: nombre, telefono, email, url, qr_data_url.
  const header = "name,phone,email,url,qr_data_url";
  const rows = result.tokens.map((t) => {
    const escapeCsv = (s: string): string => {
      // CSV simple: si contiene coma, comilla o salto de línea, encerrar en comillas.
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    return [
      escapeCsv(t.attendeeName),
      escapeCsv(t.attendeePhone ?? ""),
      escapeCsv(t.attendeeEmail ?? ""),
      escapeCsv(t.url),
      escapeCsv(t.qrDataUrl),
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");

  revalidatePath(`/admin/eventos/${eventId}`);
  return {
    ok: true,
    note: result.note,
    csv,
    count: result.tokens.length,
    created: result.newlyCreated,
  };
}

/**
 * Lista los tokens QR ya emitidos para el evento (sin generar nuevos).
 * Útil para re-imprimir QRs después.
 */
export async function listEventQrTokensAction(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState & { csv?: string; count?: number }> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string" || !eventId) {
    return { ok: false, note: "Falta eventId." };
  }
  const result = await getEventQrTokens(eventId);
  if (!result.ok) {
    return { ok: false, note: result.note };
  }
  const header = "name,phone,email,url,qr_data_url,checked_in_at";
  const rows = result.tokens.map((t) => {
    const escapeCsv = (s: string): string =>
      /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    return [
      escapeCsv(t.attendeeName),
      escapeCsv(t.attendeePhone ?? ""),
      escapeCsv(t.attendeeEmail ?? ""),
      escapeCsv(t.url),
      escapeCsv(t.qrDataUrl),
      escapeCsv(t.checkedInAt ?? ""),
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");
  return {
    ok: true,
    note: result.note,
    csv,
    count: result.tokens.length,
  };
}

/**
 * Check-in manual de un asistente (búsqueda por nombre/email/phone).
 *
 * Si el asistente ya existe en `event_attendees` para este evento,
 * solo marcamos `checked_in_at`. Si NO existe, lo creamos al vuelo
 * (walk-in).
 *
 * FormData esperado:
 *   - eventId: string (UUID)
 *   - q: string (nombre/email/phone a buscar)
 *   - attendeeId?: string (opcional: si ya lo eligió del dropdown)
 */
export async function manualCheckInAction(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }
  const eventId = formData.get("eventId");
  const query = formData.get("q");
  const attendeeId = formData.get("attendeeId");
  if (typeof eventId !== "string" || !eventId) {
    return { ok: false, note: "Falta eventId." };
  }

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // Caso 1: el admin ya eligió el attendeeId del dropdown.
  if (typeof attendeeId === "string" && attendeeId) {
    const { error } = await supabase
      .from("event_attendees")
      .update({
        checked_in_at: nowIso,
        checked_in_by: admin.email ?? null,
      })
      .eq("id", attendeeId);
    if (error) {
      return { ok: false, note: `No se pudo checkear (${error.code ?? "?"}).` };
    }
    await logAdminAction({
      actor_email: admin.email ?? "system@qlick",
      action: "check_in_manual",
      entity_type: "event_attendee",
      entity_id: attendeeId,
      metadata: { eventId },
    });
    revalidatePath(`/admin/eventos/${eventId}`);
    return { ok: true, note: "Check-in manual registrado." };
  }

  // Caso 2: el admin tipeó nombre/email/phone. Buscamos primero.
  if (typeof query !== "string" || !query.trim()) {
    return { ok: false, note: "Falta query de búsqueda." };
  }
  const q = query.trim();
  const { findConfirmationByEmailOrPhone } = await import(
    "@/lib/events/confirmations-server"
  );
  // 1. Buscar confirmation primero.
  const confirmation = await findConfirmationByEmailOrPhone(eventId, q, q);
  if (confirmation) {
    // Upsert attendee con confirmationId + check-in.
    const { createAttendee } = await import(
      "@/lib/events/attendees-server"
    );
    const result = await createAttendee({
      eventId,
      confirmationId: confirmation.id,
      name: confirmation.name,
      email: confirmation.email ?? null,
      phoneNormalized: confirmation.phoneNormalized ?? null,
      source: "check_in",
      checkedInBy: admin.email ?? null,
    });
    if (!result.ok && !result.persisted) {
      return { ok: false, note: result.note };
    }
    // Si el upsert no creó (ya existía), forzamos el UPDATE de check-in.
    if (!result.created && result.attendee) {
      await supabase
        .from("event_attendees")
        .update({
          checked_in_at: nowIso,
          checked_in_by: admin.email ?? null,
        })
        .eq("id", result.attendee.id);
    }
    await logAdminAction({
      actor_email: admin.email ?? "system@qlick",
      action: "check_in_manual",
      entity_type: "event_confirmation",
      entity_id: confirmation.id,
      metadata: { eventId, query: q },
    });
    revalidatePath(`/admin/eventos/${eventId}`);
    return {
      ok: true,
      note: `Check-in de ${confirmation.name} registrado.`,
    };
  }

  // 2. Walk-in: no hay confirmation. Creamos attendee crudo.
  const { createAttendee } = await import("@/lib/events/attendees-server");
  const result = await createAttendee({
    eventId,
    confirmationId: null,
    name: q, // usamos el query como name (el admin lo corrige después si quiere)
    email: null,
    phoneNormalized: null,
    source: "check_in",
    checkedInBy: admin.email ?? null,
  });
  if (!result.ok && !result.persisted) {
    return { ok: false, note: result.note };
  }
  await logAdminAction({
    actor_email: admin.email ?? "system@qlick",
    action: "check_in_manual",
    entity_type: "event_attendee",
    entity_id: result.attendee?.id ?? null,
    metadata: { eventId, walkIn: true, query: q },
  });
  revalidatePath(`/admin/eventos/${eventId}`);
  return { ok: true, note: `Walk-in "${q}" registrado como asistente.` };
}

// ─────────────────────────────────────────────────────────────
// Delete (FIX 2026-07-03 admin cleanup)
// ─────────────────────────────────────────────────────────────

/**
 * Elimina un asistente (event_attendee) por ID.
 *
 * IMPORTANTE: NO elimina el event_qr_tokens asociado. El QR queda
 * huérfano (sin attendee matcheado). Si querés limpiar tambien el
 * QR, primero borra el confirmado asociado (que si cascade-elimina
 * los QR del mismo phone).
 *
 * FormData: attendeeId, eventId.
 */
export async function deleteAttendeeAction(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }
  const attendeeId = formData.get("attendeeId");
  const eventId = formData.get("eventId");
  if (typeof attendeeId !== "string" || !attendeeId) {
    return { ok: false, note: "Falta attendeeId." };
  }
  if (typeof eventId !== "string" || !eventId) {
    return { ok: false, note: "Falta eventId." };
  }
  const result = await deleteAttendee(attendeeId);
  if (result.ok) {
    revalidatePath(`/admin/eventos/${eventId}`);
  }
  return result;
}

/**
 * Elimina una confirmación (event_confirmation) por ID.
 *
 * Side effects:
 *   - Cascade-delete: borra los event_qr_tokens del mismo
 *     (event_id, phone_normalized) — son los pases generados para
 *     esta persona via el bot de WhatsApp.
 *   - NO borra event_attendees (la constraint es ON DELETE SET NULL
 *     en confirmation_id, los asistentes quedan con confirmation_id=NULL).
 *
 * FormData: confirmationId, eventId.
 */
export async function deleteConfirmationAction(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }
  const confirmationId = formData.get("confirmationId");
  const eventId = formData.get("eventId");
  if (typeof confirmationId !== "string" || !confirmationId) {
    return { ok: false, note: "Falta confirmationId." };
  }
  if (typeof eventId !== "string" || !eventId) {
    return { ok: false, note: "Falta eventId." };
  }
  const result = await deleteConfirmation(confirmationId);
  if (result.ok) {
    revalidatePath(`/admin/eventos/${eventId}`);
  }
  return { ok: result.ok, note: result.note };
}
