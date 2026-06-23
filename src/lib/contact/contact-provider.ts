/**
 * Contrato común para proveedores de contacto.
 *
 * Igual que con pagos y video, la UI no se acopla a un servicio concreto.
 * El MVP usa mock-contact-provider. En fases posteriores se activan
 * resend-contact-provider (email) o crm-contact-provider (HubSpot, etc.).
 *
 * Ver docs/CONTACT_AND_WHATSAPP_STRATEGY.md.
 */

export interface ContactMessage {
  name: string;
  email: string;
  phone?: string;
  topic: string;
  message: string;
  /** Curso de interés si aplica (para ventas). */
  courseSlug?: string;
  /**
   * Consentimiento explícito para ser contactado (WhatsApp, llamada o correo).
   * Obligatorio en la UI del formulario; el CRM no debe aceptar leads sin él.
   */
  consentToContact?: boolean;
}

export interface ContactResult {
  ok: boolean;
  /** Identificador interno del mensaje (para seguimiento). */
  messageId: string;
  /** Qué pasó realmente (lo muestra la UI). */
  note: string;
  /** El proveedor que procesó el mensaje. */
  provider: "mock" | "resend" | "crm";
}

export interface ContactProvider {
  readonly name: "mock" | "resend" | "crm";
  readonly displayName: string;
  /** Procesa el mensaje y devuelve el resultado. */
  send(message: ContactMessage): Promise<ContactResult>;
}

/* --------------------- Factory de proveedor activo --------------------- */

export function getActiveContactProviderName(): "mock" | "resend" | "crm" {
  const fromEnv = process.env.NEXT_PUBLIC_CONTACT_PROVIDER;
  if (fromEnv === "resend" || fromEnv === "crm") return fromEnv;
  return "mock";
}

/* --------------------- Validación compartida --------------------- */

export interface ValidationError {
  field: keyof ContactMessage;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Teléfono mexicano tolerante: acepta +52, espacios, guiones, 10 dígitos.
const PHONE_RE = /^[\d\s+()-]{8,}$/;

export function validateContactMessage(
  message: ContactMessage
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!message.name || message.name.trim().length < 2) {
    errors.push({ field: "name", message: "Escribe tu nombre." });
  }
  if (!message.email || !EMAIL_RE.test(message.email)) {
    errors.push({ field: "email", message: "Escribe un email válido." });
  }
  if (message.phone && !PHONE_RE.test(message.phone)) {
    errors.push({
      field: "phone",
      message: "El teléfono tiene un formato inválido."
    });
  }
  if (!message.message || message.message.trim().length < 10) {
    errors.push({
      field: "message",
      message: "Cuéntanos un poco más (mínimo 10 caracteres)."
    });
  }
  if (message.consentToContact === false) {
    errors.push({
      field: "consentToContact",
      message: "Debes aceptar ser contactado para enviar el formulario."
    });
  }

  return errors;
}
