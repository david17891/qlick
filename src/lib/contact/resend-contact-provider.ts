/**
 * Proveedor Resend (email) — STUB.
 *
 * Resend es una API moderna para enviar emails transaccionales.
 *
 * ESTE ARCHIVO ES UN STUB. La implementación real queda para una fase posterior.
 * Para activarla:
 *   1. npm i resend
 *   2. Configurar RESEND_API_KEY y NEXT_PUBLIC_CONTACT_TO_EMAIL en .env
 *   3. Implementar send() con resend.emails.send().
 *   4. Cambiar NEXT_PUBLIC_CONTACT_PROVIDER=resend
 *
 * Ver docs/CONTACT_AND_WHATSAPP_STRATEGY.md.
 */

import type {
  ContactMessage,
  ContactProvider,
  ContactResult
} from "./contact-provider";

export const resendContactProvider: ContactProvider = {
  name: "resend",
  displayName: "Email (Resend) — stub",

  async send(message: ContactMessage): Promise<ContactResult> {
    if (!process.env.RESEND_API_KEY) {
      throw new Error(
        "Resend no está configurado. Define RESEND_API_KEY o usa NEXT_PUBLIC_CONTACT_PROVIDER=mock."
      );
    }

    // TODO(futura fase): enviar email real.
    //   const resend = new Resend(process.env.RESEND_API_KEY);
    //   await resend.emails.send({
    //     from: "plataforma@qlick.mx",
    //     to: process.env.NEXT_PUBLIC_CONTACT_TO_EMAIL!,
    //     subject: `Nuevo contacto: ${message.topic}`,
    //     reply_to: message.email,
    //     text: `De: ${message.name} <${message.email}>\nTel: ${message.phone}\n\n${message.message}`
    //   });

    void message;
    return {
      ok: true,
      messageId: `resend-stub-${Date.now()}`,
      provider: "resend",
      note: "Email enviado (stub)."
    };
  }
};
