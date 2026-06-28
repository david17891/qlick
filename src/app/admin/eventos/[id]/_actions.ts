"use server";

/**
 * Server actions para encuestas (Capa 4 de Fase 4).
 *
 * Usados directamente desde `<form action={...}>` en el page.tsx
 * del admin. Recargan la página automáticamente (revalidatePath)
 * para que la UI refleje el cambio.
 *
 * Validación: cada action valida su input y devuelve un objeto
 * con `ok: boolean` y `note` para feedback al usuario.
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { markSurveyReviewed } from "@/lib/events/surveys-server";

export interface MarkReviewedFormState {
  ok: boolean;
  note: string;
}

/**
 * Marca una encuesta como revisada.
 *
 * Recibe FormData con: `surveyId` (UUID), `eventId` (UUID para
 * revalidar la página), `from` (path actual, para volver).
 *
 * El admin se obtiene de la sesión via requireAdmin.
 */
export async function markSurveyReviewedAction(
  _prev: MarkReviewedFormState | null,
  formData: FormData,
): Promise<MarkReviewedFormState> {
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

  // Revalidar la página del detalle del evento (cualquier tab o view).
  revalidatePath(`/admin/eventos/${eventId}`);

  return { ok: result.ok, note: result.note };
}
