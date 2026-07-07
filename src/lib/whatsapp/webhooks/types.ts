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

/**
 * Sub-shape de un mensaje entrante de tipo `image` (Cloud API de Meta).
 * Los campos vienen como `msg.image = { id, mime_type, sha256, caption? }`
 * en el payload crudo. Los persistimos tal cual en `metadata.image`
 * (más el caption en `body` si existe, porque es texto del lead).
 */
export interface IncomingWhatsAppImage {
  /** Media ID de Meta. Sirve para descargar el archivo vía `/{media_id}`. */
  id: string;
  mimeType?: string;
  sha256?: string;
  /** Caption que el usuario escribió acompañando la foto. Texto buscable. */
  caption?: string;
}

/**
 * Sub-shape de un mensaje entrante de tipo `document` (PDF, etc).
 */
export interface IncomingWhatsAppDocument {
  id: string;
  mimeType?: string;
  sha256?: string;
  filename?: string;
  caption?: string;
}

/**
 * Sub-shape de un mensaje entrante de tipo `audio` (incluye voice notes).
 */
export interface IncomingWhatsAppAudio {
  id: string;
  mimeType?: string;
  sha256?: string;
  /** true = voice note (push-to-talk); false = audio file. */
  voice?: boolean;
}

/** Un mensaje entrante parseado desde el payload del webhook. */
export interface IncomingWhatsAppMessage {
  /** WhatsApp Message ID (wamid). */
  messageId: string;
  /** Número de quien escribe (internacional, dígitos). */
  from: string;
  /** Nombre del contacto (profile name), si viene. */
  contactName?: string;
  /**
   * Texto del mensaje. Para `text` es el body. Para `interactive` es el
   * título del botón/fila (lo que el usuario "dijo"). Para `image`/`document`
   * es el caption si viene (texto acompañando el archivo).
   */
  text?: string;
  /** Timestamp de Meta (segundos). */
  timestamp?: string;
  /** Tipo de mensaje (alineado con CHECK constraint `message_type`). */
  type:
    | "text"
    | "button"
    | "interactive"
    | "image"
    | "document"
    | "audio"
    | "video"
    | "sticker"
    | "unknown";
  /** ID del botón clickeado (Reply Button) o fila seleccionada (List). Solo si type=interactive. */
  buttonId?: string;
  /** Título legible del botón/fila (para logging y fallback). */
  buttonTitle?: string;
  /** Sub-shape para mensajes tipo `image`. */
  image?: IncomingWhatsAppImage;
  /** Sub-shape para mensajes tipo `document`. */
  document?: IncomingWhatsAppDocument;
  /** Sub-shape para mensajes tipo `audio`. */
  audio?: IncomingWhatsAppAudio;
}

/** Resultado de procesar un POST del webhook. */
export interface WebhookHandleResult {
  ok: boolean;
  /** Mensajes entrantes parseados (vacío si no había mensajes). */
  messages: IncomingWhatsAppMessage[];
  note: string;
}
