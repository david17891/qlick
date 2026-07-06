/**
 * Wizard nativo de encuesta post-evento (Fase 7d, 2026-07-05).
 *
 * Reemplaza el flow legacy token+form HTML (que tenía un race condition
 * en `event_survey_tokens` que provocaba 'Tuve un problema técnico'
 * al usuario). Toda la encuesta se hace dentro de WhatsApp con
 * interactive buttons + 1 campo de texto libre opcional.
 *
 * Modos (feat/funnel-dynamic-surveys-crm, 2026-07-05):
 *
 * 1. Legacy (Fase 7d): las funciones `buildSurveyQ1/Q2/Q3/Q4` están
 *    hardcoded con las 4 preguntas default. Se mantienen para compat
 *    con código existente pero están deprecated — usar
 *    `buildDynamicSurveyStep` para encuestas por evento.
 *
 * 2. Dinámico (Fase 7d.2, commit 5): `buildDynamicSurveyStep` toma una
 *    `SurveyQuestion` del `events.survey_config` y construye el mensaje
 *    interactivo (buttons) o texto libre (text). Valida límites Meta
 *    (3 botones, 20 chars título) en tiempo de construcción.
 *
 * Estado del wizard vive en `lead_whatsapp_log.metadata` del último
 * outbound del bot-engine (mismo patrón que `awaiting_field`).
 */

import type { InteractiveMessage } from "./providers/whatsapp-provider";

/* ------------------------------------------------------------------ */
/* IDs y tipos                                                         */
/* ------------------------------------------------------------------ */

export const SURVEY_BUTTON_IDS = {
  // Q1 — claridad del contenido
  q1_very_clear: "survey_q1_very_clear",
  q1_clear: "survey_q1_clear",
  q1_confusing: "survey_q1_confusing",
  // Q2 — intención de aplicar
  q2_yes: "survey_q2_yes",
  q2_maybe: "survey_q2_maybe",
  q2_no: "survey_q2_no",
  // Q3 — fuente de descubrimiento
  q3_meta: "survey_q3_meta",
  q3_referred: "survey_q3_referred",
  q3_other: "survey_q3_other",
  // Q4 — skip del free-text
  q4_skip: "survey_q4_skip"
} as const;

export type SurveyStep = 1 | 2 | 3 | 4 | "completed";
export interface SurveyAnswers {
  q1?: "very_clear" | "clear" | "confusing";
  q2?: "yes" | "maybe" | "no";
  q3?: "meta" | "referred" | "other";
  /** Texto libre (no vacío y distinto a 'saltar') si el lead lo dio. */
  q4_business?: string;
}
export interface SurveyState {
  eventId: string;
  eventTitle: string;
  step: SurveyStep;
  answers: SurveyAnswers;
}

/** Detecta si un buttonId es de survey. Si sí, devuelve { step, value }. */
export function detectSurveyButton(
  buttonId: string,
):
  | { step: 1 | 2 | 3; value: string }
  | { step: 4; value: "skip" | "text" }
  | null {
  if (buttonId === SURVEY_BUTTON_IDS.q1_very_clear)
    return { step: 1, value: "very_clear" };
  if (buttonId === SURVEY_BUTTON_IDS.q1_clear)
    return { step: 1, value: "clear" };
  if (buttonId === SURVEY_BUTTON_IDS.q1_confusing)
    return { step: 1, value: "confusing" };
  if (buttonId === SURVEY_BUTTON_IDS.q2_yes)
    return { step: 2, value: "yes" };
  if (buttonId === SURVEY_BUTTON_IDS.q2_maybe)
    return { step: 2, value: "maybe" };
  if (buttonId === SURVEY_BUTTON_IDS.q2_no)
    return { step: 2, value: "no" };
  if (buttonId === SURVEY_BUTTON_IDS.q3_meta)
    return { step: 3, value: "meta" };
  if (buttonId === SURVEY_BUTTON_IDS.q3_referred)
    return { step: 3, value: "referred" };
  if (buttonId === SURVEY_BUTTON_IDS.q3_other)
    return { step: 3, value: "other" };
  if (buttonId === SURVEY_BUTTON_IDS.q4_skip) return { step: 4, value: "skip" };
  return null;
}

/* ------------------------------------------------------------------ */
/* Builders de cada pregunta                                           */
/* ------------------------------------------------------------------ */

function greeting(leadName: string | null | undefined): string {
  const trimmed = (leadName ?? "").trim();
  if (!trimmed) return "¡Hola! ";
  const first = trimmed.split(/\s+/)[0] ?? "";
  return `¡Hola ${first}! `;
}

/** Q1 — claridad del contenido. */
export function buildSurveyQ1(args: {
  leadName?: string | null;
  eventTitle: string;
}): { text: string; interactive: InteractiveMessage } {
  const text =
    `${greeting(args.leadName)}Gracias por sumarte a "${args.eventTitle}". ` +
    `Te hago 4 preguntas rápidas (botón o texto), nos ayuda mucho. ` +
    `Empezamos: ` +
    `¿qué tan claro te quedó el contenido del evento?`;
  return {
    text,
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: SURVEY_BUTTON_IDS.q1_very_clear,
              title: "Muy claro"
            }
          },
          {
            type: "reply",
            reply: {
              id: SURVEY_BUTTON_IDS.q1_clear,
              title: "Claro"
            }
          },
          {
            type: "reply",
            reply: {
              id: SURVEY_BUTTON_IDS.q1_confusing,
              title: "Confuso"
            }
          }
        ]
      }
    }
  };
}

/** Q2 — intención de aplicar. */
export function buildSurveyQ2(): { text: string; interactive: InteractiveMessage } {
  const text =
    `Buenísimo. Segunda pregunta: ` +
    `¿lo aplicarías a tu negocio o proyecto?`;
  return {
    text,
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: [
          { type: "reply", reply: { id: SURVEY_BUTTON_IDS.q2_yes, title: "Sí" } },
          {
            type: "reply",
            reply: { id: SURVEY_BUTTON_IDS.q2_maybe, title: "Tal vez" }
          },
          { type: "reply", reply: { id: SURVEY_BUTTON_IDS.q2_no, title: "No" } }
        ]
      }
    }
  };
}

/** Q3 — fuente de descubrimiento. */
export function buildSurveyQ3(): { text: string; interactive: InteractiveMessage } {
  const text =
    `Gracias. Última con botones: ` +
    `¿cómo conociste este evento?`;
  return {
    text,
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: SURVEY_BUTTON_IDS.q3_meta,
              title: "Facebook-IG"
            }
          },
          {
            type: "reply",
            reply: {
              id: SURVEY_BUTTON_IDS.q3_referred,
              title: "Referido"
            }
          },
          {
            type: "reply",
            reply: {
              id: SURVEY_BUTTON_IDS.q3_other,
              title: "Otro"
            }
          }
        ]
      }
    }
  };
}

/**
 * Q4 — texto libre opcional. Le decimos al lead que puede escribirnos
 * de su negocio o enviar "saltar" (botón rápido) para omitir.
 */
export function buildSurveyQ4(args: {
  leadName?: string | null;
}): { text: string; interactive: InteractiveMessage } {
  const text =
    `${greeting(args.leadName)}Ya casi. Última (opcional): ` +
    `contanos brevemente sobre tu negocio o qué haces — ` +
    `si querés pasar, mandá "saltar" o tocá el botón.`;
  return {
    text,
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: SURVEY_BUTTON_IDS.q4_skip, title: "Saltar" }
          }
        ]
      }
    }
  };
}

/**
 * Mensaje de cierre post-encuesta. Sin scoring / calificación.
 * Si el lead describió su negocio, mencionamos que lo anotamos
 * (admin lo verá en la tab Encuestas).
 */
export function buildSurveyThankYou(args: {
  leadName?: string | null;
  businessCaptured: boolean;
}): { text: string } {
  const base = `${greeting(args.leadName)}¡Gracias por tu feedback! ` +
    `Tu opinión nos ayuda a mejorar los próximos eventos. ` +
    `Si querés estar al tanto de próximos encuentros, escribinos por acá y te avisamos.`;
  const businessLine = args.businessCaptured
    ? ` Tomamos nota de tu negocio — si hay algo que te sirva, te contactamos.`
    : "";
  return { text: base + businessLine };
}

/* ------------------------------------------------------------------ */
/* Free-text parsing                                                   */
/* ------------------------------------------------------------------ */

/** Detecta si el texto del usuario es un "saltar" válido. */
export function isSurveySkip(body: string): boolean {
  const t = body.trim().toLowerCase();
  if (!t) return false;
  return /^(saltar|skip|pasar|omitir|next|omit|no\s*gracias|-)$/i.test(t);
}

/** Limpia q4_business: trim, cap a 500 chars, descarta si es solo ruido. */
export function cleanBusinessText(body: string): string | undefined {
  const t = body.trim();
  if (!t) return undefined;
  if (isSurveySkip(t)) return undefined;
  // Filtrar respuestas absurdamente cortas ("a", "x") o muy largas.
  if (t.length < 3) return undefined;
  if (t.length > 500) return t.slice(0, 500);
  return t;
}

/* ------------------------------------------------------------------ */
/* Builder dinámico (Fase 7d.2, feat/funnel-dynamic-surveys-crm)       */
/* ------------------------------------------------------------------ */

import type { SurveyQuestion } from "@/types/events";

/**
 * Límites estrictos de Meta Cloud API para botones interactivos.
 * Si la pregunta los viola, el builder lanza (fail-fast).
 */
const META_BUTTONS_MAX = 3;
const META_BUTTONS_MIN = 2;
const META_BUTTON_TITLE_MAX = 20;

/**
 * Builder genérico de un paso del wizard (commit 5, Fase 7d.2).
 *
 * Toma una `SurveyQuestion` del `events.survey_config` y construye
 * el mensaje apropiado:
 * - `type: "buttons"` → interactive con 2-3 botones (Meta limit).
 * - `type: "text"` → texto libre con botón "Saltar".
 *
 * Lanza si la pregunta viola los límites de Meta (defensa contra
 * JSON mal configurado en runtime).
 *
 * @example
 *   const step = buildDynamicSurveyStep({
 *     eventTitle: "Funnels Venta",
 *     question: {
 *       id: "q1_clarity",
 *       text: "¿Qué tan claro te quedó el contenido?",
 *       type: "buttons",
 *       options: [
 *         { id: "very_clear", title: "Muy claro", score: 20 },
 *         ...
 *       ],
 *     },
 *     leadName: "María",
 *   });
 *   // → { text: "¡Hola María!...", interactive: {...} }
 */
export function buildDynamicSurveyStep(args: {
  eventTitle: string;
  question: SurveyQuestion;
  leadName?: string | null;
}): { text: string; interactive?: InteractiveMessage } {
  const saludo = greeting(args.leadName);
  const eventCtx = args.eventTitle
    ? ` del evento "${args.eventTitle}"`
    : "";

  if (args.question.type === "buttons") {
    const options = args.question.options ?? [];
    if (
      options.length < META_BUTTONS_MIN ||
      options.length > META_BUTTONS_MAX
    ) {
      throw new Error(
        `[survey-wizard] pregunta "${args.question.id}" tiene ${options.length} opciones; Meta requiere ${META_BUTTONS_MIN}-${META_BUTTONS_MAX}.`,
      );
    }
    for (const o of options) {
      if (o.title.length === 0 || o.title.length > META_BUTTON_TITLE_MAX) {
        throw new Error(
          `[survey-wizard] opción "${o.id}" tiene título de ${o.title.length} chars; Meta requiere 1-${META_BUTTON_TITLE_MAX}.`,
        );
      }
    }

    const text =
      `${saludo}${args.question.text}${eventCtx ? ` (${eventCtx})` : ""}`;
    return {
      text,
      interactive: {
        type: "button",
        body: { text },
        action: {
          buttons: options.map((o) => ({
            type: "reply",
            reply: {
              id: `survey_${args.question.id}_${o.id}`,
              title: o.title,
            },
          })),
        },
      },
    };
  }

  // type === "text" → texto libre con botón "Saltar"
  const text =
    `${saludo}${args.question.text}${eventCtx ? ` (${eventCtx})` : ""}`;
  return {
    text,
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: `survey_${args.question.id}_skip`,
              title: "Saltar",
            },
          },
        ],
      },
    },
  };
}

/**
 * Detecta si un buttonId fue emitido por el builder dinámico.
 *
 * Devuelve `{ questionId, optionId }` o `null` si no matchea.
 *
 * Ejemplo de IDs emitidos por buildDynamicSurveyStep:
 * - "survey_q1_clarity_very_clear" (button)
 * - "survey_q_business_skip" (text-skip)
 */
export function detectDynamicSurveyButton(
  buttonId: string,
): { questionId: string; optionId: string } | null {
  // Format esperado: survey_<questionId>_<optionId>
  // questionId puede tener guiones bajos (e.g. "q1_clarity").
  if (!buttonId.startsWith("survey_")) return null;
  const rest = buttonId.slice("survey_".length);
  // Buscar el último "_" para separar questionId de optionId.
  const lastUnderscore = rest.lastIndexOf("_");
  if (lastUnderscore === -1) return null;
  const questionId = rest.slice(0, lastUnderscore);
  const optionId = rest.slice(lastUnderscore + 1);
  if (!questionId || !optionId) return null;
  return { questionId, optionId };
}
