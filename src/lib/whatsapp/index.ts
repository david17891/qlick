/**
 * Punto de entrada único para la capa de mensajería de WhatsApp.
 *
 * - Providers (contrato + 3 implementaciones).
 * - Webhooks (tipos + verificación + handler).
 *
 * Selección del proveedor activo (resuelve por prioridad):
 *   1. `NEXT_PUBLIC_WHATSAPP_PROVIDER` (override explícito del operador).
 *   2. Si `WHATSAPP_CLOUD_PHONE_NUMBER_ID` + `WHATSAPP_CLOUD_ACCESS_TOKEN`
 *      están seteadas → `meta_cloud_api` (bot conversacional + envíos).
 *   3. Fallback → `manual_wa` (click-to-chat; comportamiento histórico).
 *
 * `bsp` solo se elige si está explícitamente seleccionado por env var.
 */

export * from "./providers/whatsapp-provider";
export { manualWaProvider } from "./providers/manual-wa-provider";
export { metaCloudApiProvider } from "./providers/meta-cloud-api-provider";
export { bspProvider } from "./providers/bsp-provider";

export * from "./webhooks/types";
export { verifyWebhook } from "./webhooks/verify";
export { handleWebhookPayload } from "./webhooks/handler";

import type { WhatsAppProvider, WhatsAppProviderName } from "./providers/whatsapp-provider";
import { manualWaProvider } from "./providers/manual-wa-provider";
import { metaCloudApiProvider } from "./providers/meta-cloud-api-provider";
import { bspProvider } from "./providers/bsp-provider";

const REGISTRY: Record<WhatsAppProviderName, WhatsAppProvider> = {
  manual_wa: manualWaProvider,
  meta_cloud_api: metaCloudApiProvider,
  bsp: bspProvider
};

/**
 * Devuelve el proveedor activo.
 *
 * Prioridad:
 *   1. `NEXT_PUBLIC_WHATSAPP_PROVIDER` (override del operador).
 *   2. Si hay credenciales de Meta Cloud API → `meta_cloud_api`.
 *   3. Fallback → `manual_wa`.
 */
export function getActiveWhatsAppProvider(): WhatsAppProvider {
  const fromEnv = process.env.NEXT_PUBLIC_WHATSAPP_PROVIDER as
    | WhatsAppProviderName
    | undefined;
  if (fromEnv && REGISTRY[fromEnv]) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[whatsapp] getActiveWhatsAppProvider: fromEnv", { fromEnv });
    }
    return REGISTRY[fromEnv];
  }
  const metaConfigured =
    Boolean(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID) &&
    Boolean(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN);
  if (process.env.NODE_ENV !== "production") {
// eslint-disable-next-line no-console
  console.error("[whatsapp] getActiveWhatsAppProvider", {
    metaConfigured,
    hasPhoneId: Boolean(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID),
    hasToken: Boolean(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN)
  });
  }
  if (metaConfigured) {
    return metaCloudApiProvider;
  }
  return manualWaProvider;
}

/** Lista todos los proveedores (para el panel de configuración). */
export function listWhatsAppProviders(): WhatsAppProvider[] {
  return [
    manualWaProvider,
    metaCloudApiProvider,
    bspProvider
  ];
}
