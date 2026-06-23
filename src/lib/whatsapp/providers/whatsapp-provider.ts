/**
 * Contrato común para proveedores de mensajería de WhatsApp.
 *
 * Mismo principio que `PaymentProvider` / `VideoProvider` / `ContactProvider`
 * (ver D-005 y D-013): la UI y el CRM no se acoplan a un proveedor concreto.
 *
 * Hoy el único proveedor ACTIVO es `manual_wa` (click-to-chat wa.me): no envía
 * mensajes automatizados, solo construye enlaces para abrir el chat.
 *
 * Los proveedores `meta_cloud_api` y `bsp` son STUBS documentados. No realizan
 * llamadas a APIs externas. Se activan en fases futuras.
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
}

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
