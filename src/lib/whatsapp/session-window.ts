export const WHATSAPP_SESSION_MS = 24 * 60 * 60 * 1000;

export type WhatsAppSessionState = "open" | "closed" | "unknown";

export interface WhatsAppSessionWindow {
  state: WhatsAppSessionState;
  lastInboundAt: string | null;
  openUntil: string | null;
}

/** Calcula la ventana de servicio de WhatsApp sin hacer llamadas externas. */
export function getWhatsAppSessionWindow(
  lastInboundAt: string | null | undefined,
  now = new Date(),
): WhatsAppSessionWindow {
  if (!lastInboundAt) {
    return { state: "unknown", lastInboundAt: null, openUntil: null };
  }

  const lastInboundMs = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(lastInboundMs)) {
    return { state: "unknown", lastInboundAt: null, openUntil: null };
  }

  const openUntil = new Date(lastInboundMs + WHATSAPP_SESSION_MS).toISOString();
  return {
    state: now.getTime() < lastInboundMs + WHATSAPP_SESSION_MS ? "open" : "closed",
    lastInboundAt: new Date(lastInboundMs).toISOString(),
    openUntil,
  };
}
