/**
 * Handler del webhook de WhatsApp (flujo POST de Meta / BSP).
 *
 * Este módulo SOLO parsea y normaliza el payload de Meta a `IncomingWhatsAppMessage[]`.
 * NO persiste en DB ni dispara el bot directamente. Esa responsabilidad vive en
 * `src/app/api/whatsapp/webhook/route.ts`, que es el route handler que orquesta:
 *   1. Validación HMAC de la firma (si WHATSAPP_WEBHOOK_SECRET está seteada).
 *   2. parseWebhookPayload() (este módulo).
 *   3. Persistencia inbound en `lead_whatsapp_conversations` (con UNIQUE wamid).
 *   4. Disparo del bot engine (fire-and-forget con Promise.race + 8s timeout).
 *
 * Riesgos a controlar al activar de verdad:
 *  - Validar la firma X-Hub-Signature-256 con el App Secret de Meta. ✅ (route.ts)
 *  - Idempotencia por wamid (Meta puede reenviar el mismo mensaje). ✅ (UNIQUE constraint)
 *  - Rate-limit y timeouts (responder 200 rápido, procesar async). ✅ (Promise.race 8s)
 *
 * Ver docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md.
 */

import type {
  IncomingWhatsAppMessage,
  WebhookHandleResult
} from "./types";

/**
 * Normaliza el payload crudo de Meta a una lista de mensajes entrantes.
 * No lanza: devuelve [] ante cualquier estructura inesperada.
 *
 * @param payload cuerpo JSON recibido en el POST.
 */
export function handleWebhookPayload(payload: unknown): WebhookHandleResult {
  try {
    const p = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              id?: string;
              from?: string;
              type?: string;
              timestamp?: string;
              text?: { body?: string };
              // Reply Button click: { type: "button_reply", button: { id, title } }
              button?: { payload?: string; text?: string };
              // List Message selection: { type: "list_reply", list: { id, title, description } }
              interactive?: {
                type?: string;
                button_reply?: { id?: string; title?: string };
                list_reply?: { id?: string; title?: string; description?: string };
              };
            }>;
            contacts?: Array<{
              wa_id?: string;
              profile?: { name?: string };
            }>;
          };
        }>;
      }>;
    };

    const messages: IncomingWhatsAppMessage[] = [];

    for (const entry of p.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        for (const msg of value?.messages ?? []) {
          // Extraer buttonId de interactive button_reply o list_reply.
          let buttonId: string | undefined;
          let buttonTitle: string | undefined;
          const interactiveType = msg.interactive?.type;
          if (interactiveType === "button_reply") {
            buttonId = msg.interactive?.button_reply?.id;
            buttonTitle = msg.interactive?.button_reply?.title;
          } else if (interactiveType === "list_reply") {
            buttonId = msg.interactive?.list_reply?.id;
            buttonTitle = msg.interactive?.list_reply?.title;
          }
          // El body es el título del botón/fila (lo que el usuario "dijo").
          const text =
            msg.text?.body ??
            msg.interactive?.button_reply?.title ??
            msg.interactive?.list_reply?.title;

          // FIX 2026-07-04 (auditoria nocturna, outbound idempotency):
          // Si Meta omite el wamid (msg.id), NO sintetizamos "unknown".
          // Razon: ese string es constante y rompe idempotency porque dos
          // mensajes distintos sin id chocarian en UNIQUE(wamid). Meta
          // SIEMPRE envia wamid en payloads reales; si falta, preferimos
          // log + skip antes que un placeholder que rompe la idempotencia.
          if (!msg.id) {
            // eslint-disable-next-line no-console
            console.warn("[whatsapp/webhook] payload sin wamid; saltando mensaje");
            continue;
          }
          messages.push({
            messageId: msg.id,
            from: msg.from ?? "unknown",
            timestamp: msg.timestamp,
            type: (msg.type as IncomingWhatsAppMessage["type"]) ?? "unknown",
            text,
            buttonId,
            buttonTitle
          });
        }
      }
    }

    if (messages.length === 0) {
      return { ok: true, messages: [], note: "Payload sin mensajes (ej. status update)." };
    }

    return {
      ok: true,
      messages,
      note: `${messages.length} mensaje(s) parseado(s) (placeholder, no persistido).`
    };
  } catch {
    return { ok: false, messages: [], note: "Payload inválido." };
  }
}
