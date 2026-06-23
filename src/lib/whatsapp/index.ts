/**
 * Punto de entrada único para la capa de mensajería de WhatsApp.
 *
 * - Providers (contrato + 3 implementaciones).
 * - Webhooks (tipos + verificación + handler placeholder).
 *
 * El proveedor ACTIVO hoy es `manual_wa`. Los demás son stubs documentados.
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
 * Devuelve el proveedor activo. En el MVP siempre es `manual_wa`.
 * En el futuro puede leerse de una env var cuando se active la Cloud API.
 */
export function getActiveWhatsAppProvider(): WhatsAppProvider {
  const fromEnv = process.env.NEXT_PUBLIC_WHATSAPP_PROVIDER as
    | WhatsAppProviderName
    | undefined;
  return (fromEnv && REGISTRY[fromEnv]) ?? manualWaProvider;
}

/** Lista todos los proveedores (para el panel de configuración). */
export function listWhatsAppProviders(): WhatsAppProvider[] {
  return [
    manualWaProvider,
    metaCloudApiProvider,
    bspProvider
  ];
}
