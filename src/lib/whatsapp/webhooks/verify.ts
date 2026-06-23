/**
 * Verificación del webhook de WhatsApp (flujo GET de Meta).
 *
 * Meta envía un GET con query params para confirmar que el endpoint es válido:
 *   hub.mode=subscribe
 *   hub.challenge=<string a devolver>
 *   hub.verify_token=<token que debe coincidir con tu Verify Token>
 *
 * PLACEHOLDER SEGURO: no se ejecuta en producción todavía (no hay endpoint
 * HTTP conectado). Solo valida que el verify token esté configurado.
 *
 * Ver docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md.
 */

import type { WebhookVerifyResult } from "./types";

/**
 * Verifica la petición GET de suscripción de Meta.
 * @param mode       hub.mode (esperado: "subscribe")
 * @param challenge  hub.challenge (a devolver tal cual)
 * @param token      hub.verify_token (a comparar con el configurado)
 */
export function verifyWebhook(
  mode: string | undefined,
  challenge: string | undefined,
  token: string | undefined
): WebhookVerifyResult {
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expectedToken) {
    return {
      ok: false,
      note:
        "Verify token no configurado. Define WHATSAPP_WEBHOOK_VERIFY_TOKEN (placeholder, sin endpoint activo)."
    };
  }

  if (mode !== "subscribe") {
    return { ok: false, note: 'hub.mode inválido (se espera "subscribe").' };
  }

  if (!challenge) {
    return { ok: false, note: "Falta hub.challenge." };
  }

  if (token !== expectedToken) {
    return { ok: false, note: "Verify token no coincide." };
  }

  return { ok: true, challenge, note: "Webhook verificado (placeholder)." };
}
