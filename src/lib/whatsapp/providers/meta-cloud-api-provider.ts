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
import { debugLog, errorLog } from "@/lib/log";

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
    // Safety gate (Fase 7a, 2026-07-01): Meta rechaza con 131009 si los
    // campos exceden los límites. Validamos en dev/prod para no repetir
    // el bug del título "Sí, info <evento>" de 28 chars.
    if (interactive.type === "button") {
      for (const btn of interactive.action.buttons) {
        if (btn.reply.title.length > 20) {
          throw new Error(
            `Reply Button title too long (${btn.reply.title.length} chars, max 20): "${btn.reply.title}"`
          );
        }
        if (btn.reply.id.length > 256) {
          throw new Error(`Reply Button id too long (${btn.reply.id.length} chars, max 256)`);
        }
      }
    } else if (interactive.type === "list") {
      for (const section of interactive.action.sections) {
        for (const row of section.rows) {
          if (row.title.length > 24) {
            throw new Error(
              `List row title too long (${row.title.length} chars, max 24): "${row.title}"`
            );
          }
          if (row.description && row.description.length > 72) {
            throw new Error(
              `List row description too long (${row.description.length} chars, max 72)`
            );
          }
        }
      }
      if (interactive.action.button.length > 20) {
        throw new Error(
          `List action button label too long (${interactive.action.button.length} chars, max 20)`
        );
      }
    }

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
      debugLog(
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
        // FIX 2026-07-04 (auditoria nocturna David): AbortController con
        // 8s timeout. Antes, si Meta Cloud API se colgaba, el fetch
        // esperaba indefinidamente. Vercel corta a los 10s cortando la
        // conexión a media-request — Meta queda en estado desconocido
        // ("¿se envio o no?"). 8s nos deja margen sobre el timeout del
        // webhook (Promise.race 8s en route.ts) y da tiempo al retry interno
        // (250ms backoff + segundo intento dentro del budget).
        const controller = new AbortController();
        const timeoutHandle = setTimeout(
          () => controller.abort(),
          8_000
        );
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutHandle);

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
        errorLog("[whatsapp/meta] Cloud API error", {
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
        // FIX 2026-07-04 (auditoria nocturna): distinguir AbortError por
        // timeout (8s) de error de red real, para que el log y el note sean
        // útiles en debugging cuando Meta Cloud API se cuelga.
        const isAbort = err instanceof Error && err.name === "AbortError";
        lastResult = {
          ok: false,
          provider: "meta_cloud_api",
          note: isAbort
            ? `Meta Cloud API timeout (8s)${ctxSuffix}`
            : `Network error: ${msg}${ctxSuffix}`
        };
        if (attempt === MAX_ATTEMPTS) return lastResult;
        await sleep(250);
      }
    }

    return lastResult;
  }
};