/**
 * Proveedor WhatsApp BSP (Business Solution Provider) — STUB.
 *
 * Un BSP es un proveedor autorizado por Meta que ofrece la WhatsApp Business
 * Platform como servicio: ejemplos son 360dialog, YCloud, Twilio, MessageBird,
 * Wati, entre otros.
 *
 * ESTE ARCHIVO ES UN STUB. No realiza llamadas a ningún BSP.
 *
 * Razones para elegir un BSP en lugar de Cloud API directa:
 *  - Menos infraestructura propia (el BSP gestiona webhooks, reintentos).
 *  - Panel de administración y plantillas.
 *  - A veces coexistencia con la WhatsApp Business App.
 *
 * Para activarlo (fase futura):
 *  1. Decidir el BSP (360dialog, YCloud, Twilio…).
 *  2. Crear cuenta y obtener la API key del BSP.
 *  3. Configurar el webhook con la URL del BSP.
 *  4. Implementar send() con la API específica del BSP elegido.
 *
 * Ver docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md.
 *
 * NOTA: por regla del proyecto NO se conecta a WhiteCloud, YCloud, Evolution
 * API ni ningún proveedor real en esta fase. Esto es solo arquitectura.
 */

import type {
  WhatsAppProvider,
  WhatsAppSendRequest,
  WhatsAppSendResult
} from "./whatsapp-provider";

export const bspProvider: WhatsAppProvider = {
  name: "bsp",
  displayName: "Proveedor BSP — stub",
  active: false,
  stub: true,

  async send(request: WhatsAppSendRequest): Promise<WhatsAppSendResult> {
    const apiKey = process.env.WHATSAPP_BSP_API_KEY;

    if (!apiKey) {
      return {
        ok: false,
        provider: "bsp",
        demo: true,
        note:
          "BSP no configurado. Se requiere WHATSAPP_BSP_API_KEY tras elegir proveedor (stub, sin implementar)."
      };
    }

    // TODO(futura fase): llamada real a la API del BSP elegido.

    void request;
    return {
      ok: true,
      provider: "bsp",
      demo: true,
      note: "Envío BSP (stub). No se llamó a ninguna API."
    };
  }
};
