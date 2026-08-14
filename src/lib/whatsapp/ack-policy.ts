/**
 * Política pura para acuses cortos de WhatsApp.
 *
 * Un "ok", "listo" o "gracias" no debe reabrir una campaña ni repetir el
 * bloque completo de información. La respuesta depende del estado real del
 * journey, no únicamente del estado global de pago del lead.
 */

export interface ContextualAckInput {
  firstName?: string | null;
  nameVerified?: boolean;
  registrationComplete: boolean;
  paymentPending: boolean;
  registrationStatus?: "payment_pending" | "confirmed" | null;
  awaitingField: "name" | "email" | null;
  lastOutboundBody?: string | null;
}

export interface ContextualAckResult {
  body: string;
  reason:
    | "registration_complete"
    | "payment_pending_repeat_guard"
    | "payment_pending"
    | "awaiting_email"
    | "awaiting_name"
    | "generic";
}

function greeting(firstName?: string | null): string {
  const clean = firstName?.trim();
  return clean ? ` ${clean}` : "";
}

function lastOutboundWasPaymentPrompt(body?: string | null): boolean {
  return /(?:completar tu pago|reservar tu lugar|enlace de pago|aparta aqu[ií]|pago pendiente)/i.test(
    body ?? "",
  );
}

export function buildContextualAck(input: ContextualAckInput): ContextualAckResult {
  const name = input.nameVerified === false ? "" : greeting(input.firstName);

  const isConfirmed = input.registrationStatus === "confirmed"
    || (input.registrationComplete && !input.paymentPending);

  if (isConfirmed) {
    return {
      body: `¡Perfecto${name}! Tu registro ya está confirmado. Conserva tu pase con QR; si necesitas algo más, aquí estoy.`,
      reason: "registration_complete",
    };
  }

  if (input.paymentPending && lastOutboundWasPaymentPrompt(input.lastOutboundBody)) {
    return {
      body: `¡Perfecto${name}! Quedó anotado. Cuando quieras continuar con el pago, te apoyo por aquí.`,
      reason: "payment_pending_repeat_guard",
    };
  }

  if (input.paymentPending) {
    return {
      body: `¡Claro${name}! Tus datos quedaron registrados y el pago sigue pendiente. Cuando se verifique, te envío tu pase.`,
      reason: "payment_pending",
    };
  }

  if (input.awaitingField === "email") {
    return {
      body: `¡Claro${name}! Para completar tu registro, solo me falta tu correo. Mándamelo cuando quieras y seguimos.`,
      reason: "awaiting_email",
    };
  }

  if (input.awaitingField === "name") {
    return {
      body: `¡Claro${name}! Para apartar tu lugar, solo me falta tu nombre completo. Mándamelo cuando quieras y seguimos.`,
      reason: "awaiting_name",
    };
  }

  return {
    body: `¡Con gusto${name}! Aquí sigo pendiente por si te surge cualquier otra duda. Si quieres inscribirte, dime y te ayudo.`,
    reason: "generic",
  };
}
