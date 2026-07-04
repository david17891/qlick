/**
 * Verificación de firma + hard-fail gate para el webhook de WhatsApp.
 *
 * Extraído del route handler (`src/app/api/whatsapp/webhook/route.ts`)
 * para hacerlo testeable sin importar `next/server`.
 *
 * **Meta manda:** `X-Hub-Signature-256: sha256=<hex>` con HMAC SHA256
 * del body crudo usando el app secret.
 *
 * **Reglas (post-fix 2026-07-04):**
 *   - Si `WHATSAPP_WEBHOOK_SECRET` NO está seteada:
 *     - production → 503 (hard-fail, defense vs inyecciones).
 *     - dev → skip validación (infoLog del caller).
 *   - Si secret está seteada y firma válida → ok.
 *   - Si secret está seteada y firma falta → 401.
 *   - Si secret está seteada y firma inválida → 401.
 *
 * Usa `timingSafeEqual` para evitar timing attacks en la comparación.
 *
 * Server-only.
 *
 * @server
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const META_SIGNATURE_HEADER = "x-hub-signature-256";
const SIGNATURE_PREFIX = "sha256=";

export interface SignatureGateOk {
  ok: true;
}
export interface SignatureGateFail {
  ok: false;
  status: 401 | 503;
  message: string;
}
export type SignatureGateResult = SignatureGateOk | SignatureGateFail;

/**
 * HMAC SHA256 del body crudo vs `X-Hub-Signature-256` header.
 *
 * Pure function (no lee env). Toma el secret como param para que sea
 * trivial de testear con diferentes secrets sin tocar process.env.
 */
export function verifySignature(
  rawBody: string,
  header: string,
  secret: string
): boolean {
  if (!header.startsWith(SIGNATURE_PREFIX)) return false;
  const providedHex = header.slice(SIGNATURE_PREFIX.length);
  const computedHex = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  if (providedHex.length !== computedHex.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(providedHex, "hex"),
      Buffer.from(computedHex, "hex"),
    );
  } catch {
    // Buffer.from con hex inválido puede tirar — defensivo.
    return false;
  }
}

/**
 * Gate completo: lee `WHATSAPP_WEBHOOK_SECRET` del env, decide si el
 * request puede pasar, y devuelve el status HTTP apropiado si no.
 *
 * El caller traduce el `{ ok: false, status, message }` a un NextResponse.
 */
export function checkWebhookSignatureGate(
  req: Request,
  rawBody: string
): SignatureGateResult {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 503,
        message:
          "WHATSAPP_WEBHOOK_SECRET no está configurado en producción. La validación de firma es obligatoria para evitar inyecciones. Seteala en Vercel → Environment Variables.",
      };
    }
    // Dev: secret no seteado, dejamos pasar (caller loggea infoLog).
    return { ok: true };
  }

  const provided = req.headers.get(META_SIGNATURE_HEADER);
  if (!provided) {
    return {
      ok: false,
      status: 401,
      message: "Falta X-Hub-Signature-256.",
    };
  }
  if (!verifySignature(rawBody, provided, secret)) {
    return {
      ok: false,
      status: 401,
      message: "Firma inválida.",
    };
  }
  return { ok: true };
}

/** Header name — exportado por si el caller lo quiere usar (logs). */
export const WEBHOOK_SIGNATURE_HEADER = META_SIGNATURE_HEADER;