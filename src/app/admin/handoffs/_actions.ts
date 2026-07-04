"use server";

/**
 * Server actions del admin de handoffs (Fase 7a.3 → G-10).
 *
 * Capa de mutaciones invocadas desde el Client Component
 * `<HandoffsClient>` (botones "Marcar contacted" / "Marcar closed").
 *
 * Validación: cada action valida su input y devuelve `{ ok, note }` para
 * feedback al usuario. `revalidatePath("/admin/handoffs")` recarga la
 * tabla después de cada cambio.
 *
 * Audit log: cada cambio de status se registra vía `logAdminAction`
 * (entidad `handoff_request`, action `handoff_status_change`). El
 * snapshot from→to ya lo escribe `updateHandoffStatus` (esta action
 * solo es el wrapper que llama al server lib).
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import {
  updateHandoffStatus,
  type HandoffStatus,
  type UpdateHandoffStatusResult,
} from "@/lib/crm/handoffs-server";

/**
 * Cambia el status de un handoff. Server action expuesta al Client
 * Component.
 *
 * Input: handoffId (string), newStatus (HandoffStatus), notes (opcional).
 *
 * Devuelve `{ ok, note }`. En error 401-like (sin admin) devuelve
 * `{ ok: false, note: "No autorizado." }` sin lanzar.
 */
export async function updateHandoffStatusAction(
  input: {
    handoffId: string;
    newStatus: HandoffStatus;
    notes?: string | null;
  },
): Promise<UpdateHandoffStatusResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autorizado." };
  }

  const result = await updateHandoffStatus({
    handoffId: input.handoffId,
    newStatus: input.newStatus,
    actorEmail: admin.email,
    notes: input.notes ?? null,
  });

  if (result.ok) {
    revalidatePath("/admin/handoffs");
  }
  return result;
}
