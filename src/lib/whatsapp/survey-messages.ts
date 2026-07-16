/**
 * Mensajes del flujo de encuesta post-evento (WhatsApp bot).
 *
 * Builder puro: sin I/O. Construye los textos + interactive messages
 * que el bot-engine envía cuando ofrece la encuesta al lead y cuando
 * el lead responde Sí / Ahora no.
 *
 * TEMPLATE-READY (feat/funnel-survey-scoring, 2026-07-04):
 *   Cada función devuelve `{ text, interactive? }`. Cuando Meta apruebe
 *   los 3 templates (`conf_bienvenida`, `conf_info_evento`,
 *   `conf_confirmacion_registro`), basta con agregar un campo
 *   `template?: { name, language }` y mapear contexto → variables.
 *   El bot-engine no necesita cambios para hacer el swap.
 *
 * Los textos evitan saludos largos si `firstName` es vacío o es un
 * placeholder conocido (ver PLACEHOLDER_NAMES en bot-engine.ts).
 */

import type { InteractiveMessage } from "./providers/whatsapp-provider";

const SURVEY_OFFER_IDS = {
  yes: "survey_offer_yes",
  no: "survey_offer_no"
} as const;

/** Limpia firstName para evitar "Hola Por" (placeholders heredados). */
function cleanFirstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  const placeholder = trimmed.toLowerCase();
  if (
    placeholder === "por" ||
    placeholder === "por confirmar" ||
    placeholder === "confirmar" ||
    placeholder === "test" ||
    placeholder === "(empty)"
  ) {
    return "";
  }
  return trimmed.split(/\s+/)[0] ?? "";
}

/** Builder del mensaje interactivo que ofrece la encuesta (Sí / Ahora no). */
export function buildSurveyOfferMessage(args: {
  leadName?: string | null;
  eventTitle?: string | null;
}): { text: string; interactive: InteractiveMessage } {
  const clean = cleanFirstName(args.leadName);
  const saludo = clean ? `¡Hola ${clean}! ` : "¡Hola! ";
  // FIX 2026-07-16 (sesion David, "Gracias por haberte sumado a del
  // evento" + voseo "Te tomás"):
  //   - Construccion: "sumado al evento" (no "sumado a del evento").
  //     Antes el codigo interpolaba "a " + "del evento" -> "a del evento".
  //   - Tuteo MX: "te tomas" (no "te tomás"). Memory: "Español MX,
  //     PROHIBIDO voseo, OK tuteo".
  const titleTrim = args.eventTitle?.trim();
  const text =
    `${saludo}Gracias por haberte sumado al evento` +
    (titleTrim ? ` "${titleTrim}"` : "") +
    `. ¿Te tomas 2 minutos para contarnos cómo te fue? ` +
    `Tu feedback nos ayuda a mejorar los próximos eventos.`;

  const interactive: InteractiveMessage = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        {
          type: "reply",
          reply: { id: SURVEY_OFFER_IDS.yes, title: "Sí, dejar feedback" }
        },
        {
          type: "reply",
          reply: { id: SURVEY_OFFER_IDS.no, title: "Ahora no" }
        }
      ]
    },
    footer: {
      text: "Sin compromiso. Puedes volver cuando quieras."
    }
  };

  return { text, interactive };
}

/** Builder del mensaje cuando el lead clickea "Sí" → le mandamos el link. */
export function buildSurveyLinkMessage(args: {
  leadName?: string | null;
  surveyUrl: string;
}): { text: string } {
  const clean = cleanFirstName(args.leadName);
  const saludo = clean ? `¡Gracias ${clean}! ` : "¡Gracias! ";
  const text =
    `${saludo}Acá está tu link privado para la encuesta: ` +
    `${args.surveyUrl}\n\n` +
    `Te toma 2 minutos. Tus respuestas son confidenciales.`;
  return { text };
}

/** Builder del mensaje cuando el lead clickea "Ahora no". */
export function buildSurveyDeclineMessage(args: {
  leadName?: string | null;
}): { text: string } {
  const clean = cleanFirstName(args.leadName);
  const saludo = clean ? `¡Gracias ${clean}! ` : "¡Gracias! ";
  const text =
    `${saludo}Sin problema. Si más adelante quieres dejarnos tu feedback, ` +
    `escríbenos y te mandamos el link.`;
  return { text };
}

/** IDs exportados para que el bot-engine los matchee en `processInboundMessage`. */
export const SURVEY_OFFER_BUTTON_IDS = SURVEY_OFFER_IDS;