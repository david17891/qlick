/**
 * Proveedor WhatsApp Business Platform / Cloud API (Meta) — IMPLEMENTACIÓN REAL.
 *
 * Env vars requeridas (server-only, NUNCA NEXT_PUBLIC_*):
 *   - WHATSAPP_CLOUD_PHONE_NUMBER_ID  → ID del número en Meta (obligatorio)
 *   - WHATSAPP_CLOUD_ACCESS_TOKEN     → token permanente (EAA… o nuevo sb_…) (obligatorio)
 *   - WHATSAPP_CLOUD_API_VERSION      → default "v20.0" (obligatorio)
 *   - WHATSAPP_CLOUD_WABA_ID          → WhatsApp Business Account ID (opcional, usado para diagnostic)
 *   - WHATSAPP_CLOUD_APP_ID           → App ID de Meta for Developers (opcional, usado para diagnostic)
 *
 * WABA dedicado (Fase 6 Hito D): cada cliente del portafolio Paul
 * (Qlick, Casa Geriatrica, etc.) opera sobre SU PROPIO WABA, no se comparten
 * IDs ni numeros entre clientes. Ver docs/PARTNER_META_SETUP.md seccion
 * "Patron multi-cliente".
 *
 * Modo demo:
 *   Si falta WHATSAPP_CLOUD_PHONE_NUMBER_ID o WHATSAPP_CLOUD_ACCESS_TOKEN,
 *   el provider devuelve `demo: true` con un warning (no rompe la app en
 *   desarrollo). Esto preserva el comportamiento histórico del stub.
 *
 * POST:
 *   https://graph.facebook.com/{version}/{phone_number_id}/messages
 *   Authorization: Bearer {token}
 *   Body: ver `buildMessagePayload` (text o template).
 *
 * Errores:
 *   - 2xx → ok=true, externalId = messages[0].id
 *   - 4xx → ok=false (no reintentar, fallo del caller)
 *   - 5xx / network → ok=false + retry 1 vez con backoff lineal (250ms)
 */

import type {
  WhatsAppProvider,
  WhatsAppSendRequest,
  WhatsAppSendResult,
  InteractiveMessage
} from "./whatsapp-provider";

const GRAPH_API_BASE = "https://graph.facebook.com";

interface BuildPayloadInput {
  to: string;
  body: string;
  templateName?: string;
  templateLanguage?: string;
  interactive?: InteractiveMessage;
}

interface CloudApiResponse {
  messages?: Array<{ id?: string }>;
  error?: {
    message?: string;
    code?: number;
    type?: string;
    error_subcode?: number;
  };
}

/**
 * Construye el body del POST a /messages.
 * - Si viene `templateName`, arma template message (requerido fuera de la
 *   ventana de 24h o para iniciar una conversación).
 * - Si no, arma text message (solo válido dentro de la ventana 24h).
 *
 * `body` se interpreta como variable {{1}} cuando es template + se piden
 * variables; en esta implementación mandamos el body como la primera
 * variable del template, y si el body trae saltos de línea, los dividimos
 * en variables adicionales (corte simple por `\n`).
 */
function buildMessagePayload(input: BuildPayloadInput): Record<string, unknown> {
  const { to, body, templateName, templateLanguage, interactive } = input;

  // Interactive (Reply Buttons / List Message) tiene prioridad — se ignora
  // `body` y `templateName`. Gratis dentro de la ventana 24h.
  if (interactive) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive
    };
  }

  if (templateName) {
    const variables = body
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const components =
      variables.length > 0
        ? [
            {
              type: "body",
              parameters: variables.map((text) => ({
                type: "text",
                text
              }))
            }
          ]
        : undefined;

    return {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage ?? "es_MX" },
        ...(components ? { components } : {})
      }
    };
  }

  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };
}

/** Lee env vars con fallback a defaults razonables. */
function readEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const metaCloudApiProvider: WhatsAppProvider = {
  name: "meta_cloud_api",
  displayName: "WhatsApp Cloud API (Meta)",
  active: true,
  stub: false,

  async send(request: WhatsAppSendRequest): Promise<WhatsAppSendResult> {
    const phoneNumberId = readEnv("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
    const token = readEnv("WHATSAPP_CLOUD_ACCESS_TOKEN");
    const apiVersion = readEnv("WHATSAPP_CLOUD_API_VERSION", "v20.0");

    if (!phoneNumberId || !token) {
      // eslint-disable-next-line no-console
      console.warn(
        "[whatsapp/meta] Cloud API no configurada (faltan WHATSAPP_CLOUD_PHONE_NUMBER_ID o WHATSAPP_CLOUD_ACCESS_TOKEN). Devolviendo demo.",
      );
      return {
        ok: false,
        provider: "meta_cloud_api",
        demo: true,
        note:
          "Cloud API no configurada. Define WHATSAPP_CLOUD_PHONE_NUMBER_ID y WHATSAPP_CLOUD_ACCESS_TOKEN en .env.local."
      };
    }

    // Opcionales: enriquecen los mensajes de error para debugging.
    // NO son requeridos para hacer requests — si faltan, el provider sigue
    // funcionando pero los `note` de errores no los mencionan.
    const wabaId = readEnv("WHATSAPP_CLOUD_WABA_ID");
    const appId = readEnv("WHATSAPP_CLOUD_APP_ID");
    /** Metadata compacta para anexar a los notes de error cuando aplica. */
    const ctxSuffix =
      wabaId || appId
        ? ` [waba=${wabaId || "?"} app=${appId || "?"}]`
        : "";

    const url = `${GRAPH_API_BASE}/${apiVersion}/${phoneNumberId}/messages`;
    const payload = buildMessagePayload({
      to: request.to,
      body: request.body,
      templateName: request.templateName,
      templateLanguage: request.templateLanguage,
      interactive: request.interactive
    });

    // 1 retry en 5xx / errores de red. 4xx no se reintenta.
    const MAX_ATTEMPTS = 2;
    let lastResult: WhatsAppSendResult = {
      ok: false,
      provider: "meta_cloud_api",
      note: "Sin respuesta del provider."
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        // Cloud API devuelve 200 incluso con error funcional en algunos
        // casos; leemos el JSON y respetamos el campo `error`.
        const data = (await res.json().catch(() => ({}))) as CloudApiResponse;

        if (res.ok && data.messages?.[0]?.id) {
          return {
            ok: true,
            provider: "meta_cloud_api",
            externalId: data.messages[0].id,
            note: `Mensaje enviado (wamid=${data.messages[0].id}).`
          };
        }

const errMsg =
          data.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
          const isRetryable = res.status >= 500;

        // eslint-disable-next-line no-console
        console.error("[whatsapp/meta] Cloud API error", {
          status: res.status,
          errorCode: data.error?.code,
          errorSubcode: data.error?.error_subcode,
          errorType: data.error?.type,
          message: errMsg,
          url,
          to: request.to,
          templateName: request.templateName,
          interactiveType: request.interactive?.type
        });

        lastResult = {
          ok: false,
          provider: "meta_cloud_api",
          note: `Cloud API error: ${errMsg}${ctxSuffix}`
        };

        if (!isRetryable || attempt === MAX_ATTEMPTS) {
          return lastResult;
        }

        // Backoff lineal: 250ms antes del retry.
        await sleep(250);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastResult = {
          ok: false,
          provider: "meta_cloud_api",
          note: `Network error: ${msg}`
        };
        if (attempt === MAX_ATTEMPTS) return lastResult;
        await sleep(250);
      }
    }

    return lastResult;
  }
};