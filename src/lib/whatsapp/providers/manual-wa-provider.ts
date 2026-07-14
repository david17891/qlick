/**
 * Proveedor WhatsApp MANUAL (wa.me / click-to-chat).
 *
 * FIX housekeeping 2026-07-14 (G-16 collateral): el comentario anterior
 * decía "Es el ÚNICO proveedor activo en el MVP". ESTO ES INCORRECTO.
 * El provider activo en producción desde 2026-07-01 es `meta_cloud_api`
 * (Meta WhatsApp Business Cloud API). Este provider MANUAL es el
 * fallback histórico: se usa para construir enlaces wa.me en la UI pública
 * (CTAs de "hablar por WhatsApp") y como referencia del contrato común.
 * NO envía mensajes automatizados.
 *
 * Qué hace:
 * - Construye enlaces `https://wa.me/<número>?text=<mensaje>` a partir de las
 *   env vars públicas (NEXT_PUBLIC_WHATSAPP_SALES_NUMBER, etc.).
 * - Reutiliza el helper `getWhatsAppLink` de `src/lib/contact/whatsapp.ts`.
 *
 * Qué NO hace:
 * - No envía mensajes outbound automatizados.
 * - No usa la WhatsApp Business API / Cloud API.
 * - No necesita tokens ni webhooks.
 *
 * Su `send()` existe solo para cumplir el contrato del provider y devuelve
 * siempre `demo: true`, porque el envío real lo hace el humano al abrir wa.me.
 */

import type {
  WhatsAppProvider,
  WhatsAppSendRequest,
  WhatsAppSendResult
} from "./whatsapp-provider";
import {
  getWhatsAppLink,
  type WhatsAppIntent
} from "@/lib/contact/whatsapp";

export const manualWaProvider: WhatsAppProvider = {
  name: "manual_wa",
  displayName: "WhatsApp manual (wa.me)",
  active: true,
  stub: false,

  async send(request: WhatsAppSendRequest): Promise<WhatsAppSendResult> {
    // El "envío" manual es construir el link wa.me para que un humano lo abra.
    const link = getWhatsAppLink(
      (request.intent as WhatsAppIntent) ?? "sales",
      { customMessage: request.body }
    );

    if (!link.configured) {
      return {
        ok: false,
        provider: "manual_wa",
        demo: true,
        note:
          "WhatsApp no configurado. Define NEXT_PUBLIC_WHATSAPP_SALES_NUMBER para habilitar el click-to-chat."
      };
    }

    return {
      ok: true,
      provider: "manual_wa",
      demo: true,
      note: `Link wa.me generado para envío manual por un asesor: ${link.href}`
    };
  }
};
