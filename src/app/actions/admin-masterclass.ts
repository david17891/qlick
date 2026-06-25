"use server";

/**
 * Server Actions admin para gestión de masterclasses.
 *
 * Server-only. Requieren auth admin (defensa en profundidad con
 * `requireAdmin()`). Usadas desde los Client Components de la admin UI.
 *
 * Si requireAdmin() devuelve null, el server action retorna `{ ok: false,
 * error: "No autorizado" }` sin lanzar (mejor UX que redirect).
 */

import { requireAdmin } from "@/lib/auth/session";
import { updateRegistrationStatus } from "@/lib/masterclasses";
import type {
  MasterclassRegistrationStatus,
  MasterclassAttendanceStatus,
  MasterclassCommercialStatus,
} from "@/types/masterclass";

export interface AdminMasterclassActionResult {
  ok: boolean;
  note?: string;
}

export async function adminUpdateRegistrationAction(
  input: {
    registrationId: string;
    registrationStatus?: MasterclassRegistrationStatus;
    attendanceStatus?: MasterclassAttendanceStatus;
    commercialStatus?: MasterclassCommercialStatus;
    notes?: string | null;
  },
): Promise<AdminMasterclassActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autorizado." };
  }

  return updateRegistrationStatus({
    registrationId: input.registrationId,
    registrationStatus: input.registrationStatus,
    attendanceStatus: input.attendanceStatus,
    commercialStatus: input.commercialStatus,
    notes: input.notes,
  });
}