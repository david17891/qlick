/**
 * Tipos compartidos para emision de certificados de asistencia (eventos).
 *
 * El template PDF del Concept C recibe un `CertificateData` "limpio"
 * (todos los strings ya formateados, los assets ya cargados como
 * data URL). Esto desacopla el render de la fuente de datos.
 *
 * Convenciones:
 * - Todos los textos vienen ya formateados (fechas largas, horas, etc.).
 * - Los assets vienen como data URL PNG (cargados via fs.readFileSync + base64).
 * - El folio es estable por attendee (mismo attendee = mismo folio, emitido una vez).
 */

export interface CertificateData {
  attendeeName: string;
  /**
   * Etiqueta derivada del tipo de evento:
   * "MAESTRIA EN" | "MASTERCLASS DE" | "PARTICIPACION EN" | etc.
   * Ya viene en mayusculas y lista para estampar.
   */
  courseLabel: string;
  eventTitle: string;
  /** Fecha larga en espanol MX, formato "12 de julio de 2026". */
  eventDate: string;
  /** Hora "10:00" (24h). */
  eventTime: string;
  /** "180 minutos" | "3 horas" | etc. */
  eventDuration: string;
  eventLocation: string;
  instructorName: string;
  instructorTitle: string;
  /**
   * Folio unico formato QLK-YYYY-XXXXX.
   * Estable entre emisiones para el mismo attendee.
   */
  folio: string;
  /** PNG data URL del QR (generado con `qrcode.toDataURL`). */
  qrDataUrl: string;
  /** PNG data URL de la firma de Paul (vectorizada). */
  signatureDataUrl: string;
  /** PNG data URL del isotipo Q. */
  qIconDataUrl: string;
  /** Fecha de emision actual, formato "5 de julio de 2026". */
  issueDate: string;
}

/**
 * Resultado de emision de un certificado.
 */
export interface IssuedCertificate {
  folio: string;
  eventId: string;
  attendeeId: string;
  attendeeName: string;
  eventTitle: string;
  issuedAt: string;
  /** True si el certificado ya existia (idempotencia). */
  alreadyIssued: boolean;
  /** URL publica destino del QR (qlick.digital/filosofia). */
  certUrl: string;
}
