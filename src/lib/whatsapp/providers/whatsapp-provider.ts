/**
 * Contrato común para proveedores de mensajería de WhatsApp.
 *
 * Mismo principio que `PaymentProvider` / `VideoProvider` / `ContactProvider`
 * (ver D-005 y D-013): la UI y el CRM no se acoplan a un proveedor concreto.
 *
 * Sprint housekeeping 2026-07-12 (G-16): el comentario anterior decía
 * "Hoy el único proveedor ACTIVO es `manual_wa`". ESTO ES INCORRECTO.
 * El provider activo en producción desde 2026-07-01 es `meta_cloud_api`
 * (Meta WhatsApp Business Cloud API). `manual_wa` (click-to-chat wa.me) es
 * el fallback histórico. Ver `src/lib/whatsapp/index.ts:46` (`getActiveWhatsAppProvider`).
 *
 * Los providers `bsp` y `openrouter` son STUBS documentados (ver TODOs en
 * `bsp-provider.ts:52` y `openrouter-provider.ts:52`).
 *
 * Ver docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md.
 */

import type { WhatsAppIntent } from "@/lib/contact/whatsapp";

export type WhatsAppProviderName = "manual_wa" | "meta_cloud_api" | "bsp";

/** Dirección del mensaje. */
export type WhatsAppMessageDirection = "inbound" | "outbound";

/** Resultado de un intento de envío (proveedores outbound). */
export interface WhatsAppSendResult {
  ok: boolean;
  /** ID externo del mensaje (cuando lo da la API). */
  externalId?: string;
  /** Proveedor que procesó el mensaje. */
  provider: WhatsAppProviderName;
  /** Demo: true si no se envió realmente. */
  demo?: boolean;
  /** Mensaje para la UI / logs. */
  note: string;
}

/** Petición de envío outbound (plantilla o texto). */
export interface WhatsAppSendRequest {
  /** Número de destino en formato internacional (dígitos). */
  to: string;
  /** Texto del mensaje (texto libre o variables de plantilla). */
  body: string;
  /** Intención comercial del mensaje (para auditoría y plantillas). */
  intent?: WhatsAppIntent;
  /** Nombre de la plantilla aprobada (Cloud API). */
  templateName?: string;
  /** Idioma de la plantilla, ej. "es_MX". */
  templateLanguage?: string;
  /**
   * Mensaje interactivo (Reply Buttons o List Message). Si está presente,
   * se envía como `type: "interactive"` y se ignora `body` / `templateName`.
   * Gratis dentro de la ventana 24h (igual que text).
   */
  interactive?: InteractiveMessage;
}

/* ------------------------------------------------------------------ */
/*  Interactive messages (Fase 7a)                                    */
/* ------------------------------------------------------------------ */

/** Botón individual en un Reply Button message. */
export interface InteractiveReplyButtonItem {
  type: "reply";
  reply: { id: string; title: string };
}

/** Mensaje con hasta 3 Reply Buttons (respuesta rápida). */
export interface InteractiveReplyButtons {
  type: "button";
  body: { text: string };
  action: { buttons: InteractiveReplyButtonItem[] };
  header?: { type: "text"; text: string };
  footer?: { text: string };
}

/** Fila individual en un List Message. */
export interface InteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

/** Sección de un List Message (las secciones agrupan filas). */
export interface InteractiveListSection {
  title?: string;
  rows: InteractiveListRow[];
}

/** Mensaje con lista navegable (hasta 10 items, agrupados en secciones). */
export interface InteractiveListMessage {
  type: "list";
  body: { text: string };
  action: {
    button: string;
    sections: InteractiveListSection[];
  };
  header?: { type: "text"; text: string };
  footer?: { text: string };
}

export type InteractiveMessage = InteractiveReplyButtons | InteractiveListMessage;

/**
 * Interfaz que todo proveedor de WhatsApp implementa.
 *
 * El proveedor activo se resuelve por nombre. El manual_wa NO implementa
 * `send()` real (solo click-to-chat), por lo que su `send()` devuelve un
 * resultado `demo: true`.
 */
export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;
  readonly displayName: string;
  /** true si está activo en el MVP (manual_wa). */
  readonly active: boolean;
  /** true si es un stub (no implementado todavía). */
  readonly stub: boolean;
  /** Envía un mensaje outbound. En stubs devuelve error controlado. */
  send(request: WhatsAppSendRequest): Promise<WhatsAppSendResult>;
}
