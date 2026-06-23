/**
 * Proveedor CRM (HubSpot/similar) — STUB.
 *
 * Cuando se quiera llevar los leads a un CRM, este provider crea el contacto
 * y el deal/ticket correspondiente vía API del CRM elegido.
 *
 * ESTE ARCHIVO ES UN STUB. La implementación real queda para una fase posterior.
 * Para activarla:
 *   1. Elegir CRM (HubSpot, Zoho, Pipedrive…).
 *  2. Configurar las credenciales (CRM_API_KEY, etc.) en .env.
 *   3. Implementar send() con la API del CRM.
 *   4. Cambiar NEXT_PUBLIC_CONTACT_PROVIDER=crm
 *
 * Ver docs/CONTACT_AND_WHATSAPP_STRATEGY.md.
 */

import type {
  ContactMessage,
  ContactProvider,
  ContactResult
} from "./contact-provider";

export const crmContactProvider: ContactProvider = {
  name: "crm",
  displayName: "CRM — stub",

  async send(message: ContactMessage): Promise<ContactResult> {
    if (!process.env.CRM_API_KEY) {
      throw new Error(
        "CRM no está configurado. Define CRM_API_KEY o usa NEXT_PUBLIC_CONTACT_PROVIDER=mock."
      );
    }

    // TODO(futura fase): crear contacto + deal en el CRM.

    void message;
    return {
      ok: true,
      messageId: `crm-stub-${Date.now()}`,
      provider: "crm",
      note: "Lead creado en CRM (stub)."
    };
  }
};
