/**
 * Helper para construir el link wa.me de envío manual de una constancia
 * por WhatsApp (cuando el asistente no tiene email).
 *
 * Sprint Cert-Individual 2026-07-15.
 *
 * Centraliza el template del mensaje para que el action server-side
 * (que emite el cert) y la UI (que muestra el link directo) usen
 * exactamente el mismo texto. Antes había dos copias inline que podían
 * divergir.
 *
 * Server + Client safe (cero imports externos, solo encodeURIComponent).
 */

export interface CertificateWhatsAppLinkInput {
  /** Nombre del asistente (sin validar; el caller ya filtró placeholders). */
  attendeeName: string;
  /** Teléfono en cualquier formato (E.164, 52..., con espacios, etc). */
  attendeePhone: string;
  /** Folio del cert. Se muestra entre paréntesis. */
  folio: string;
  /** Título del evento. */
  eventTitle: string;
  /** URL absoluta al cert (https://qlick.digital/cert/QLK-...). */
  certUrl: string;
}

/**
 * Devuelve una URL `https://wa.me/{phone}?text={mensaje}` lista para abrir
 * en el browser. NO normaliza agresivamente el teléfono — solo strippea
 * todo lo no numérico (que es lo que `wa.me` espera).
 */
export function buildCertificateWhatsAppLink(
  input: CertificateWhatsAppLinkInput,
): string {
  const safeName = (input.attendeeName || "asistente").trim();
  const message =
    `Hola ${safeName}, ¡felicidades por completar "${input.eventTitle}"! 🎉\n\n` +
    `Tu constancia: ${input.certUrl}\n\n` +
    `Abre el link para ver y guardar tu constancia como PDF (folio ${input.folio}).`;
  const phoneDigits = input.attendeePhone.replace(/\D/g, "");
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
