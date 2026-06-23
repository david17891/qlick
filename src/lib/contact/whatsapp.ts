/**
 * Helper central para enlaces de WhatsApp.
 *
 * MVP usa variables de entorno públicas para configurar números/grupo.
 * Si no están configuradas, los componentes deben mostrar un estado claro
 * ("pendiente de configuración") en lugar de un link falso.
 *
 * Ver docs/CONTACT_AND_WHATSAPP_STRATEGY.md.
 */

export type WhatsAppIntent =
  | "sales" // información / compra de cursos
  | "support" // soporte con acceso a la plataforma
  | "enroll" // inscribirse a un curso concreto
  | "group"; // acceso al grupo de alumnos

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

const MESSAGES: Record<WhatsAppIntent, string> = {
  sales: "Hola, quiero información sobre los cursos de Qlick.",
  support: "Hola, necesito soporte con mi acceso a la plataforma Qlick.",
  enroll: "Hola, quiero inscribirme al curso: [nombre del curso].",
  group: "Hola, quiero acceso al grupo de alumnos de Qlick."
};

/**
 * Construye el link de WhatsApp según la intención.
 * Si no hay número/grupo configurado, devuelve `{ configured: false }`
 * para que la UI muestre un fallback claro (nunca un link falso).
 */
export function getWhatsAppLink(
  intent: WhatsAppIntent,
  options?: { courseName?: string }
): WhatsAppLink {
  // Grupo: usa URL directa si existe.
  if (intent === "group") {
    const groupUrl = getGroupUrl();
    if (groupUrl) {
      return {
        href: groupUrl,
        configured: true,
        label: "Unirme al grupo de WhatsApp"
      };
    }
    // Sin grupo configurado → fallback a "solicitar acceso" por WhatsApp de ventas.
    const sales = getSalesNumber();
    if (sales) {
      return {
        href: buildWaLink(sales, MESSAGES.group),
        configured: true,
        label: "Solicitar acceso al grupo"
      };
    }
    return {
      href: "#",
      configured: false,
      label: "Grupo de WhatsApp (próximamente)"
    };
  }

  // Inscripción a curso concreto: personaliza el mensaje.
  if (intent === "enroll") {
    const sales = getSalesNumber();
    const msg = options?.courseName
      ? `Hola, quiero inscribirme al curso: ${options.courseName}.`
      : MESSAGES.enroll;
    if (sales) {
      return {
        href: buildWaLink(sales, msg),
        configured: true,
        label: "Inscribirme por WhatsApp"
      };
    }
    return {
      href: "#",
      configured: false,
      label: "Inscripción por WhatsApp (próximamente)"
    };
  }

  if (intent === "support") {
    const support = getSupportNumber();
    if (support) {
      return {
        href: buildWaLink(support, MESSAGES.support),
        configured: true,
        label: "Soporte por WhatsApp"
      };
    }
    return {
      href: "#",
      configured: false,
      label: "Soporte por WhatsApp (próximamente)"
    };
  }

  // Default: sales.
  const sales = getSalesNumber();
  if (sales) {
    return {
      href: buildWaLink(sales, MESSAGES.sales),
      configured: true,
      label: "Hablar por WhatsApp"
    };
  }
  return {
    href: "#",
    configured: false,
    label: "WhatsApp (próximamente)"
  };
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
