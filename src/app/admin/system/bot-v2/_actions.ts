"use server";

/**
 * Server actions del admin para el toggle del Motor IA Socrático v2
 * (Sprint 2 sub-sprint 2.1).
 *
 * Expone UN solo action público: `toggleDeepseekToolsAction` que recibe
 * el valor deseado (true/false) y lo persiste en `system_settings`.
 * El toggle es accesible SOLO a admins autenticados (`requireAdmin()`).
 *
 * Tras escribir, invalidamos la caché in-memory de la DB lookup
 * (`setSystemSetting` ya lo hace) y `revalidatePath` para refrescar la UI.
 *
 * Audit: el `actorEmail` del admin se guarda en `updated_by` (columna
 * de la tabla). No usamos `admin_audit_log` para esta acción porque
 * `system_settings` es la fuente de verdad y ya tiene trazabilidad
 * built-in (`updated_at` + `updated_by`).
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import {
  setSystemSetting,
  KEY_DEEPSEEK_TOOLS_ENABLED
} from "@/lib/admin/system-settings-server";

/**
 * Cambia el flag `deepseek_tools_enabled` en `system_settings`.
 *
 * Server action. Solo admins autenticados pueden llamarla.
 *
 * @param enabled Valor deseado (true = activar, false = apagar).
 * @returns `{ ok, note, value }`. En error (sin admin / DB caída) devuelve
 *   `{ ok: false, note }` SIN lanzar.
 */
export async function toggleDeepseekToolsAction(
  enabled: boolean
): Promise<{ ok: boolean; note: string; value?: boolean }> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autorizado. Inicia sesion como admin." };
  }

  // Validacion defensiva: solo booleanos.
  if (typeof enabled !== "boolean") {
    return { ok: false, note: "Valor invalido: se esperaba boolean." };
  }

  const result = await setSystemSetting(
    KEY_DEEPSEEK_TOOLS_ENABLED,
    enabled,
    admin.email
  );
  if (!result.ok) {
    return { ok: false, note: result.note };
  }

  // Refrescar la pagina de admin. La caché in-memory del provider se
  // invalida automaticamente via setSystemSetting.
  revalidatePath("/admin/system/bot-v2");
  revalidatePath("/admin");

  return { ok: true, note: result.note, value: enabled };
}
