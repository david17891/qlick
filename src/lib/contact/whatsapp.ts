/**
 * Helper central para enlaces de WhatsApp.
 *
 * MVP usa variables de entorno públicas para configurar números/grupo.
 * Si no están configuradas, los componentes deben mostrar un estado claro
 * ("pendiente de configuración") en lugar de un link falso.
 *
 * IMPORTANTE: esto es click-to-chat (wa.me). Abre la app de WhatsApp del
 * cliente/asesor con un mensaje pre-escrito. NO es la WhatsApp Business API:
 * no envía mensajes salientes automatizados. Para mensajería outbound y
 * plantillas se necesita la Cloud API oficial (ver
 * docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md).
 *
 * Ver docs/CONTACT_AND_WHATSAPP_STRATEGY.md.
 */

export type WhatsAppIntent =
  | "sales" // información / compra de cursos
  | "support" // soporte con acceso a la plataforma
  | "enroll" // inscribirse a un curso concreto
  | "group" // acceso al grupo de alumnos
  // --- Intents extendidos para el CRM ---
  | "payment_reminder" // recordatorio/ayuda para completar pago
  | "follow_up" // seguimiento comercial a un lead
  | "course_interest" // interés inicial en un curso
  | "welcome_student" // bienvenida tras inscripción
  | "schedule_call" // agendar llamada de asesoría
  | "reactivation"; // reactivar lead frío

export interface WhatsAppLink {
  href: string;
  /** Si false, no hay destino configurado y la UI debe mostrar fallback. */
  configured: boolean;
  /** Etiqueta sugerida para el botón. */
  label: string;
}

/* --------------------- Configuración desde env --------------------- */

function cleanNumber(raw: string | undefined): string | null {
  if (!raw) return null;
  // wa.me requiere solo dígitos, con código de país, sin + ni espacios.
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 10) return null;
  return digits;
}

export function getSalesNumber(): string | null {
  return cleanNumber(process.env.NEXT_PUBLIC_WHATSAPP_SALES_NUMBER);
}

export function getSupportNumber(): string | null {
  return (
    cleanNumber(process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER) ?? getSalesNumber()
  );
}

export function getGroupUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL;
  if (!url) return null;
  // Aceptamos chat.whatsapp.com o wa.me.
  if (/^(https?:)?\/\//.test(url) || /^chat\.whatsapp\.com/i.test(url)) {
    return url.startsWith("http") ? url : `https://${url}`;
  }
  return null;
}

/* --------------------- Builder de links wa.me --------------------- */

function buildWaLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Mensajes por defecto cuando no hay personalización. */
const DEFAULT_MESSAGES: Record<WhatsAppIntent, string> = {
  sales: "Hola, quiero información sobre los cursos de Qlick.",
  support: "Hola, necesito soporte con mi acceso a la plataforma Qlick.",
  enroll: "Hola, quiero inscribirme al curso: [nombre del curso].",
  group: "Hola, quiero acceso al grupo de alumnos de Qlick.",
  payment_reminder:
    "Hola, necesito ayuda para completar mi pago en Qlick.",
  follow_up:
    "Hola, soy de Qlick y te escribo para dar seguimiento a tu interés en nuestros cursos.",
  course_interest: "Hola, quiero información sobre los cursos de Qlick.",
  welcome_student:
    "Hola, bienvenido a Qlick. Tu acceso a la plataforma está listo.",
  schedule_call:
    "Hola, soy de Qlick. Me gustaría agendar una llamada para resolver tus dudas.",
  reactivation:
    "Hola, soy de Qlick. Te escribo para saber si aún te interesa avanzar con tu formación en marketing."
};

/* --------------------- Etiquetas sugeridas --------------------- */

const DEFAULT_LABELS: Record<WhatsAppIntent, string> = {
  sales: "Hablar por WhatsApp",
  support: "Soporte por WhatsApp",
  enroll: "Inscribirme por WhatsApp",
  group: "Unirme al grupo de WhatsApp",
  payment_reminder: "Ayuda con mi pago",
  follow_up: "Dar seguimiento",
  course_interest: "Pedir información",
  welcome_student: "Dar la bienvenida",
  schedule_call: "Agendar llamada",
  reactivation: "Reactivar lead"
};

/**
 * Opciones para construir el mensaje. `name` y `courseTitle` personalizarán
 * el saludo cuando el intent lo permita.
 */
export interface WhatsAppMessageOptions {
  courseName?: string;
  /** Nombre del lead/alumno para personalizar el saludo. */
  name?: string;
  /** Título del curso (alias legible de courseName). */
  courseTitle?: string;
  /** Mensaje pre-armado (tiene prioridad sobre la plantilla). */
  customMessage?: string;
}

/** Construye "Hola <name>" o "Hola" si no hay nombre. */
function greet(name?: string): string {
  const n = name?.trim();
  return n ? `Hola ${n}` : "Hola";
}

/**
 * Construye el mensaje a enviar según la intención y los datos disponibles.
 * Exportado por separado para que el CRM pueda reutilizarlo (preview en la UI).
 */
export function buildWhatsAppMessage(
  intent: WhatsAppIntent,
  options?: WhatsAppMessageOptions
): string {
  if (options?.customMessage) return options.customMessage;

  const name = options?.name?.trim();
  const course = options?.courseTitle?.trim() ?? options?.courseName?.trim();
  const h = greet(name);

  switch (intent) {
    case "enroll":
      return course
        ? `Hola, quiero inscribirme al curso: ${course}.`
        : DEFAULT_MESSAGES.enroll;

    case "follow_up":
      return course
        ? `${h}, soy de Qlick. Te escribo para dar seguimiento a la información que solicitaste sobre ${course}.`
        : name
          ? `${h}, soy de Qlick. Te escribo para dar seguimiento a la información que solicitaste sobre nuestros cursos.`
          : DEFAULT_MESSAGES.follow_up;

    case "payment_reminder":
      return course
        ? `${h}, te escribimos de Qlick para ayudarte a completar tu inscripción al curso ${course}.`
        : DEFAULT_MESSAGES.payment_reminder;

    case "group":
      return DEFAULT_MESSAGES.group;

    case "welcome_student":
      return course
        ? `${h}, bienvenido a Qlick. Tu acceso al curso ${course} está listo.`
        : `${h}, bienvenido a Qlick. Tu acceso a la plataforma está listo.`;

    case "schedule_call":
      return course
        ? `${h}, soy de Qlick. Podemos agendar una llamada corta para resolver tus dudas sobre ${course}.`
        : `${h}, soy de Qlick. Podemos agendar una llamada corta para resolver tus dudas.`;

    case "reactivation":
      return name
        ? `${h}, soy de Qlick. Te escribo para saber si aún te interesa avanzar con tu formación en marketing.`
        : DEFAULT_MESSAGES.reactivation;

    case "support":
      return DEFAULT_MESSAGES.support;

    case "sales":
    case "course_interest":
    default:
      return DEFAULT_MESSAGES.sales;
  }
}

/** Cuál número usar según el intent (ventas vs soporte vs grupo). */
function resolveNumberForIntent(
  intent: WhatsAppIntent
): { number: string | null; isGroup: boolean } {
  if (intent === "group") {
    return { number: null, isGroup: true };
  }
  if (intent === "support") {
    return { number: getSupportNumber(), isGroup: false };
  }
  // Por defecto, todo el flujo comercial usa el número de ventas.
  return { number: getSalesNumber(), isGroup: false };
}

/**
 * Construye el link de WhatsApp según la intención.
 * Si no hay número/grupo configurado, devuelve `{ configured: false }`
 * para que la UI muestre un fallback claro (nunca un link falso).
 */
export function getWhatsAppLink(
  intent: WhatsAppIntent,
  options?: WhatsAppMessageOptions
): WhatsAppLink {
  const label = options?.customMessage ? "Abrir WhatsApp" : DEFAULT_LABELS[intent];

  // Grupo: usa URL directa si existe.
  if (intent === "group") {
    const groupUrl = getGroupUrl();
    if (groupUrl) {
      return { href: groupUrl, configured: true, label: "Unirme al grupo de WhatsApp" };
    }
    // Sin grupo configurado → fallback a "solicitar acceso" por WhatsApp de ventas.
    const sales = getSalesNumber();
    if (sales) {
      return {
        href: buildWaLink(sales, DEFAULT_MESSAGES.group),
        configured: true,
        label: "Solicitar acceso al grupo"
      };
    }
    return { href: "#", configured: false, label: "Grupo de WhatsApp (próximamente)" };
  }

  const { number } = resolveNumberForIntent(intent);
  const message = buildWhatsAppMessage(intent, options);

  if (number) {
    return { href: buildWaLink(number, message), configured: true, label };
  }
  return { href: "#", configured: false, label: `${label} (próximamente)` };
}

/* --------------------- Helper de email --------------------- */

export function getContactEmail(): string {
  return process.env.NEXT_PUBLIC_CONTACT_TO_EMAIL || "hola@qlick.mx";
}

export function getMailtoLink(
  subject: string,
  body?: string
): string {
  const params = new URLSearchParams({
    subject,
    ...(body ? { body } : {})
  });
  return `mailto:${getContactEmail()}?${params.toString()}`;
}

/* --------------------- Estado de configuración (para UI) --------------------- */

export interface WhatsAppConfigStatus {
  salesNumber: boolean;
  supportNumber: boolean;
  groupUrl: boolean;
  /** true si al menos el número de ventas está configurado. */
  anyConfigured: boolean;
}

/** Devuelve qué partes de WhatsApp están configuradas (para el panel de config). */
export function getWhatsAppConfigStatus(): WhatsAppConfigStatus {
  const salesNumber = Boolean(getSalesNumber());
  const supportNumber = Boolean(getSupportNumber());
  const groupUrl = Boolean(getGroupUrl());
  return {
    salesNumber,
    supportNumber,
    groupUrl,
    anyConfigured: salesNumber || supportNumber || groupUrl
  };
}
