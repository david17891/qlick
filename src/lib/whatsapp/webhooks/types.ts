/**
 * Tipos para los webhooks de WhatsApp (Cloud API / BSP).
 *
 * PLACEHOLDERS SEGUROS. No procesan datos reales.
 *
 * La Cloud API de Meta envía dos tipos de requests al webhook configurado:
 *  - GET  → verificación del webhook (hub.challenge).
 *  - POST → notificaciones de mensajes (status, mensajes entrantes, etc.).
 *
 * Ver docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md.
 */

/** Estados de un mensaje saliente reportados por la API. */
export type WhatsAppMessageStatus =
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "deleted"
  | "unknown";

/** Resultado de verificar el webhook GET. */
export interface WebhookVerifyResult {
  ok: boolean;
  /** El challenge que debe devolverse tal cual si ok=true. */
  challenge?: string;
  note: string;
}

/** Un mensaje entrante parseado desde el payload del webhook. */
export interface IncomingWhatsAppMessage {
  /** WhatsApp Message ID (wamid). */
  messageId: string;
  /** Número de quien escribe (internacional, dígitos). */
  from: string;
  /** Nombre del contacto (profile name), si viene. */
  contactName?: string;
  /** Texto del mensaje (solo tipo text). Para interactive, usar `buttonId` o `selectedRowId`. */
  text?: string;
  /** Timestamp de Meta (segundos). */
  timestamp?: string;
  /** Tipo de mensaje. */
  type: "text" | "button" | "interactive" | "image" | "unknown";
  /** ID del botón clickeado (Reply Button) o fila seleccionada (List). Solo si type=interactive. */
  buttonId?: string;
  /** Título legible del botón/fila (para logging y fallback). */
  buttonTitle?: string;
}

/** Resultado de procesar un POST del webhook. */
export interface WebhookHandleResult {
  ok: boolean;
  /** Mensajes entrantes parseados (vacío si no había mensajes). */
  messages: IncomingWhatsAppMessage[];
  note: string;
}
