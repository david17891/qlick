/**
 * Job de limpieza de tokens QR viejos (Fase 7a, Bloque 4 - P1-1 auditoria).
 *
 * Borra de `event_qr_tokens` los registros que:
 *   - Expiraron hace más de 30 días (llevan tiempo muertos).
 *   - Nunca fueron usados (checked_in_at IS NULL).
 *
 * Por qué 30 días de gracia: si un evento tuvo delay y el lead llegó
 * tarde, todavía tiene chance de hacer check-in. Después de 30 días, el
 * token ya no tiene valor operativo.
 *
 * Por qué `checked_in_at IS NULL`: los tokens ya usados son data
 * histórica (auditoría). Solo limpiamos tokens no usados.
 *
 * **Idempotencia:** ejecuta DELETE directo. Si corre dos veces en el
 * mismo día, el segundo run no hace nada (los ya borrados no existen).
 *
 * **Cron:** se invoca desde `/api/cron/cleanup-qr-tokens`. Configurado
 * en `vercel.json` una vez al día (3 AM UTC, horario distinto al de
 * recordatorios para no solapar).
 *
 * Server-only.
 */

import { createSupabaseAdminClient } from "../supabase/admin";
import { checkSupabaseConfig } from "../supabase/health";

export interface CleanupResult {
  ok: boolean;
  /** Total de tokens borrados en este run. */
  deletedCount: number;
  /** Días de gracia aplicados (default 30). */
  graceDays: number;
  /** Timestamp del run (ISO). */
  ranAt: string;
  /** Error si algo falló. */
  error?: string;
}

/** Días después de expiración antes de considerar un token "viejo". */
const DEFAULT_GRACE_DAYS = 30;

export async function runCleanupQrTokensJob(
  graceDays: number = DEFAULT_GRACE_DAYS
): Promise<CleanupResult> {
  const ranAt = new Date().toISOString();

  if (!checkSupabaseConfig().configured) {
    return {
      ok: false,
      deletedCount: 0,
      graceDays,
      ranAt,
      error: "Supabase no configurado.",
    };
  }

  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    // DELETE directo. Supabase devuelve `data` con los rows borrados
    // (configurado via .select()).
    const { data, error } = await supabase
      .from("event_qr_tokens" as never)
      .delete()
      .lt("expires_at" as never, cutoff)
      .is("checked_in_at" as never, null)
      .select("id");

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[cron/cleanup-qr-tokens] DELETE falló", {
        code: (error as { code?: string }).code,
      });
      return {
        ok: false,
        deletedCount: 0,
        graceDays,
        ranAt,
        error: `DB error: ${(error as { code?: string }).code ?? "unknown"}`,
      };
    }

    const deletedCount = Array.isArray(data) ? data.length : 0;
    // eslint-disable-next-line no-console
    console.log("[cron/cleanup-qr-tokens] ok", {
      deletedCount,
      graceDays,
      cutoff,
    });

    return {
      ok: true,
      deletedCount,
      graceDays,
      ranAt,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cron/cleanup-qr-tokens] excepción", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      deletedCount: 0,
      graceDays,
      ranAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}