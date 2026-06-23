/**
 * Proveedor WhatsApp Business Platform / Cloud API (Meta) — STUB.
 *
 * ESTE ARCHIVO ES UN STUB. No realiza llamadas a la API de Meta.
 *
 * Para activarlo (fase futura) se requiere:
 *  1. App en Meta for Developers con WhatsApp Business habilitado.
 *  2. Phone Number ID y token de acceso permanente (System User).
 *  3. Verificación del número de negocio.
 *  4. Opt-in del cliente antes de cualquier envío outbound.
 *  5. Plantillas (templates) aprobadas por Meta para mensajes de marketing.
 *  6. Webhook público configurado (ver src/lib/whatsapp/webhooks/).
 *  7. Cumplir con las políticas de Commerce/Business de Meta.
 *
 * Ver docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md.
 *
 * Riesgos de NO usar este camino oficial:
 *  - Métodos no oficiales (librerías que emulan la app) violan los Términos de
 *    Servicio de WhatsApp y pueden provocar el BAN del número.
 *  - No hay escalado, plantillas ni métricas.
 */

import type {
  WhatsAppProvider,
  WhatsAppSendRequest,
  WhatsAppSendResult
} from "./whatsapp-provider";

export const metaCloudApiProvider: WhatsAppProvider = {
  name: "meta_cloud_api",
  displayName: "WhatsApp Cloud API (Meta) — stub",
  active: false,
  stub: true,

  async send(request: WhatsAppSendRequest): Promise<WhatsAppSendResult> {
    const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;

    if (!phoneNumberId || !token) {
      return {
        ok: false,
        provider: "meta_cloud_api",
        demo: true,
        note:
          "Cloud API no configurada. Se requiere WHATSAPP_CLOUD_PHONE_NUMBER_ID y WHATSAPP_CLOUD_ACCESS_TOKEN (stub, sin implementar)."
      };
    }

    // TODO(futura fase): llamada real a
    //   POST https://graph.facebook.com/v20.0/<phone_number_id>/messages
    // con body:
    //   { messaging_product: "whatsapp", to, type: "text"|"template", ... }
    // y Authorization: Bearer <token>.

    void request;
    return {
      ok: true,
      provider: "meta_cloud_api",
      demo: true,
      note: "Envío Cloud API (stub). No se llamó a la API."
    };
  }
};
