/**
 * Wizard nativo de encuesta post-evento (Fase 7d, 2026-07-05).
 *
 * Reemplaza el flow legacy token+form HTML (que tenía un race condition
 * en `event_survey_tokens` que provocaba 'Tuve un problema técnico'
 * al usuario). Toda la encuesta se hace dentro de WhatsApp con
 * interactive buttons + 1 campo de texto libre opcional.
 *
 * 4 preguntas:
 * - Q1 (3 botones): claridad del contenido
 * - Q2 (3 botones): intención de aplicar
 * - Q3 (3 botones): fuente de descubrimiento
 * - Q4 (texto libre, opcional): descripción del negocio — 'saltar' lo omite
 *
 * HACIA ADELANTE (Fase 7d.1): tope al wizard. NO se calculan scores, NO
 * se promueven leads, NO se actualiza el commercial_interest. El admin
 * decide desde la tab Encuestas qué hacer con cada respuesta. El
 * state-tracking de "ya completó" se hace con `hasCompletedWizardSurvey`
 * (lookup a event_surveys en bot-engine).
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
