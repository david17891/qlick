/**
 * Auth gate para endpoints de Vercel Cron.
 *
 * Vercel Cron manda `Authorization: Bearer <CRON_SECRET>` cuando la env
 * var está seteada en el dashboard. Si NO está seteada, Vercel no manda
 * auth y el endpoint queda accesible (modo dev friendly).
 *
 * Reglas (post-revert del hard-fail 2026-07-04):
 *   - Si `CRON_SECRET` está seteada: validar Bearer. Match → ok. No match → 401.
 *   - Si `CRON_SECRET` NO está seteada: pasar (modo dev / antes del setup).
 *
 * Defensa-en-profundidad: en producción, `CRON_SECRET` DEBE estar
 * seteada. El operador lo configura en Vercel → Environment Variables
 * (ver `docs/VERCEL_ENV_SETUP.md`). El hard-fail 503 cuando falta el
 * secret fue revertido (`14f9c7c`) porque rompía crons en prod si el
 * operador olvidaba setearlo antes del primer deploy. La validación
 * presente aquí cubre el caso normal (secret seteado + Bearer correcto).
 *
 * Server-only.
 *
 * @server
 */

export interface CronAuthOk {
  ok: true;
}
export interface CronAuthFail {
  ok: false;
  status: 401;
  error: "unauthorized";
}
export type CronAuthResult = CronAuthOk | CronAuthFail;

export interface StrictCronAuthMissing {
  ok: false;
  status: 503;
  error: "cron_secret_missing";
}
export type StrictCronAuthResult = CronAuthOk | CronAuthFail | StrictCronAuthMissing;

/**
 * Lee el header `authorization` y compara con `Bearer <CRON_SECRET>`.
 *
 * Pure: no toca I/O, no instancia nada. Toma el `Request` para extraer
 * headers — testeable con un `new Request("http://x", { headers: {...} })`.
 */
export function checkCronAuth(req: Request): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Modo dev: secret no seteado, dejamos pasar (Vercel Cron no manda auth).
    return { ok: true };
  }
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;
  if (auth !== expected) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

/**
 * Auth estricta para schedulers externos que deben fallar cerrado.
 * No reutiliza el fallback dev-friendly de `checkCronAuth`, porque un
 * workflow externo sin secreto podría disparar envíos proactivos.
 */
export function checkStrictCronAuth(
  req: Request,
  envKey: string,
): StrictCronAuthResult {
  const cronSecret = process.env[envKey];
  if (!cronSecret) {
    return { ok: false, status: 503, error: "cron_secret_missing" };
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}
