/**
 * Proveedor de contacto MOCK.
 *
 * Es el proveedor por defecto del MVP. Simula el envío del mensaje sin tocar
 * ninguna API externa. Útil para desarrollo, demos y QA.
 *
 * No guarda datos sensibles. Solo registra en consola para fines de demo.
 */

import type {
  ContactMessage,
  ContactProvider,
  ContactResult
} from "./contact-provider";

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export const mockContactProvider: ContactProvider = {
  name: "mock",
  displayName: "Mensaje simulado (demo)",

  async send(message: ContactMessage): Promise<ContactResult> {
    // Simulamos latencia de red.
    await new Promise((r) => setTimeout(r, 600));

    const messageId = randomId("msg");

    // Log de demo (no sensitive). Ayuda a verificar durante QA.
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.info("[contact:mock] mensaje registrado", {
        messageId,
        name: message.name,
        email: message.email,
        topic: message.topic
      });
    }

    return {
      ok: true,
      messageId,
      provider: "mock",
      note:
        "Mensaje registrado en modo demo. En producción se conectará a CRM, email o WhatsApp."
    };
  }
};
