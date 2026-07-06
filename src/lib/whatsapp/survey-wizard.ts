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
 * FIX 2026-07-06 (QA funnel-audit): el parser anterior usaba
 * `lastIndexOf("_")` que falla con questionIds que tienen underscores
 * (e.g. "survey_q1_clarity_very_clear" se parseaba como
 * `{ questionId: "q1_clarity_very", optionId: "clear" }`). Esto
 * rompía el wizard entero en producción desde el merge del plan
 * dinámico, porque todos los questionIds del proyecto
 * (`q1_clarity`, `q2_apply`, `q3_consent`, `q_business`) tienen
 * guiones bajos.
 *
 * FIX: recibe el set de `validQuestionIds` del `survey_config` y
 * matchea el prefijo más largo. Esto garantiza que `questionId`
 * sea siempre uno de los IDs del config (no heurística de
 * lastIndexOf).
 *
 * Devuelve `{ questionId, optionId }` o `null` si no matchea.
 *
 * Ejemplo de IDs emitidos por buildDynamicSurveyStep:
 * - "survey_q1_clarity_very_clear" (button)
 * - "survey_q_business_skip" (text-skip)
 */
export function detectDynamicSurveyButton(
  buttonId: string,
  validQuestionIds: readonly string[] = [],
): { questionId: string; optionId: string } | null {
  // Format esperado: survey_<questionId>_<optionId>
  if (!buttonId.startsWith("survey_")) return null;
  const rest = buttonId.slice("survey_".length);

  if (validQuestionIds.length > 0) {
    // FIX: matchear el questionId válido más largo (longest-prefix match).
    // Ordenar por longitud descendente para que "q1_clarity" matchee
    // antes que "q1" si ambos existieran en el config.
    const sorted = [...validQuestionIds].sort((a, b) => b.length - a.length);
    for (const qid of sorted) {
      if (rest === qid) {
        // Caso edge: buttonId = "survey_q_business" sin optionId
        // (no debería pasar porque siempre emitimos optionId, pero
        // por seguridad lo manejamos).
        return null;
      }
      const prefix = `${qid}_`;
      if (rest.startsWith(prefix)) {
        const optionId = rest.slice(prefix.length);
        if (optionId.length > 0) return { questionId: qid, optionId };
      }
    }
    return null;
  }

  // Fallback legacy: si no se pasan validQuestionIds, usamos
  // lastIndexOf (comportamiento previo). Útil para tests unitarios
  // que no quieren construir el set. **OJO:** este modo es
  // ambiguo con questionIds que tienen underscores — usar el modo
  // con validQuestionIds en producción.
  const lastUnderscore = rest.lastIndexOf("_");
  if (lastUnderscore === -1) return null;
  const questionId = rest.slice(0, lastUnderscore);
  const optionId = rest.slice(lastUnderscore + 1);
  if (!questionId || !optionId) return null;
  return { questionId, optionId };
}

/**
 * FIX 2026-07-06 (audit G-15, segundo round): detector unificado de
 * buttonId del wizard que entiende AMBOS formatos que produce el código:
 *
 * 1. **Legacy** (`survey_q1_very_clear`): emitido por `buildSurveyQ1` y
 *    los builders hardcoded. Usa IDs cortos (`q1`, `q2`, ...).
 * 2. **Dinámico** (`survey_q1_clarity_very_clear`): emitido por
 *    `buildDynamicSurveyStep` cuando hay `SurveyQuestion` del
 *    `survey_config` del evento. Usa el `question.id` completo.
 *
 * El bug original (David, "Muy claro no avanza wizard" en prod) era
 * que el detector de intent del bot-engine.ts comparaba con
 * `SURVEY_BUTTON_IDS.q1_very_clear` (formato legacy) y el botón
 * emitido en prod es dinámico → NO matcheaba → intent caía a
 * "question" → LLM respondía cualquier cosa.
 *
 * Este helper intenta primero el formato legacy (vía
 * `detectSurveyButton`) y luego el dinámico (vía
 * `detectDynamicSurveyButton` con el set de questionIds). Devuelve
 * `{ step, questionId, optionId }` donde `step` es 1-indexed y
 * alinea con `awaiting_survey_step` del wizard state.
 *
 * @param buttonId ID del botón emitido por Meta en el webhook.
 * @param validQuestionIds Set de questionIds del survey config del
 *   evento (necesario para el formato dinámico). Si falta, solo
 *   intentará legacy.
 * @returns `{ step, questionId, optionId }` o null si no matchea.
 */
export function detectSurveyButtonAny(
  buttonId: string,
  validQuestionIds: readonly string[] = [],
): { step: number; questionId: string; optionId: string } | null {
  if (!buttonId) return null;

  // 1. Legacy: hardcoded IDs cortos (q1/q2/q3/q4).
  const legacy = detectSurveyButton(buttonId);
  if (legacy) {
    return {
      step: legacy.step,
      // Para legacy, el "questionId" corto lo derivamos del step.
      questionId: `q${legacy.step}`,
      optionId: legacy.value,
    };
  }

  // 2. Dinámico: `survey_<questionId>_<optionId>` con questionId completo.
  if (validQuestionIds.length > 0) {
    const dyn = detectDynamicSurveyButton(buttonId, validQuestionIds);
    if (dyn) {
      // step es 1-indexed según la posición del questionId en el array.
      // OJO: el orden de las questions en el array = orden en el wizard.
      // q_consent y q_business son step 4 y 5 (no continuables).
      const step = validQuestionIds.indexOf(dyn.questionId) + 1;
      if (step >= 1) {
        return { step, questionId: dyn.questionId, optionId: dyn.optionId };
      }
    }
  }

  return null;
}

/**
 * FIX 2026-07-06 (audit G-15, "Muy claro no avanza wizard"): Meta a
 * veces NO manda el buttonId en el webhook del segundo click (dedupe,
 * formato, retry, button reply reentrega). El lead seleccionó "Muy
 * claro" en el botón de Q1, pero llega como TEXTO sin buttonId. Sin
 * este fallback, el intent cae a "question" y el LLM responde con un
 * mensaje libre efusivo que rompe el flow del survey (no se persiste
 * `event_surveys`, no corre promotion engine, no se promueve el lead).
 *
 * Helper principal: identifica QUÉ option del wizard está intentando
 * responder el lead (independiente del formato del buttonId). Devuelve
 * `{ legacyButtonId, optionTitle }` para que el caller pueda construir
 * el buttonId en formato legacy O dinámico según corresponda.
 *
 * @param body Texto crudo del inbound (trim antes de pasar).
 * @param step Step actual del wizard (1, 2 o 3).
 * @returns { legacyButtonId, optionTitle } si matchea, o null.
 */
export function synthesizeSurveyOptionFromText(
  body: string,
  step: number,
): { legacyButtonId: string; optionTitle: string } | null {
  if (!body) return null;
  const b = body.trim().toLowerCase();
  if (!b) return null;
  if (step === 1) {
    if (/^muy\s*claro$|^muy$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q1_very_clear, optionTitle: "Muy claro" };
    }
    if (/^claro$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q1_clear, optionTitle: "Claro" };
    }
    if (/^confuso$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q1_confusing, optionTitle: "Confuso" };
    }
    return null;
  }
  if (step === 2) {
    if (/^(s[ií]|claro\s*que\s*s[ií]|por\s*supuesto|desde\s+luego)$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q2_yes, optionTitle: "Sí" };
    }
    if (/^(tal\s*vez|quiz[aá]s|depende)$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q2_maybe, optionTitle: "Tal vez" };
    }
    if (/^no$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q2_no, optionTitle: "No" };
    }
    return null;
  }
  if (step === 3) {
    if (/^(facebook|ig|instagram|meta|fb)$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q3_meta, optionTitle: "Facebook-IG" };
    }
    if (/^(referido|amigo|recomendaci[oó]n)$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q3_referred, optionTitle: "Referido" };
    }
    if (/^otro$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q3_other, optionTitle: "Otro" };
    }
    return null;
  }
  if (step === 4) {
    // Q4 puede ser texto libre (q_business) o botones de consent
    // (q_consent "Sí"/"No"). "Saltar" se mapea al botón explícito
    // de skip, presente en preguntas tipo text.
    if (/^saltar$/i.test(b)) {
      return { legacyButtonId: SURVEY_BUTTON_IDS.q4_skip, optionTitle: "Saltar" };
    }
    if (/^(s[ií]|claro\s*que\s*s[ií]|por\s*supuesto|desde\s+luego)$/i.test(b)) {
      return { legacyButtonId: "survey_q_consent_yes", optionTitle: "Sí" };
    }
    if (/^no$/i.test(b)) {
      return { legacyButtonId: "survey_q_consent_no", optionTitle: "No" };
    }
    return null;
  }
  return null;
}

/**
 * Backward-compatible wrapper. Devuelve el buttonId en formato legacy
 * (`SURVEY_BUTTON_IDS.q1_very_clear`). Útil para tests unitarios que
 * no necesitan construir el formato dinámico. Para el flow de
 * producción en el bot engine, usar `synthesizeSurveyOptionFromText` +
 * el helper `buildDynamicButtonIdFromOption` que sí respeta el formato
 * dinámico del survey config.
 *
 * @deprecated Usar `synthesizeSurveyOptionFromText` en código de prod.
 */
export function synthesizeSurveyButtonFromText(
  body: string,
  step: number,
): string | null {
  const opt = synthesizeSurveyOptionFromText(body, step);
  return opt ? opt.legacyButtonId : null;
}

/**
 * FIX 2026-07-06 (audit G-15, follow-up): dado un optionTitle (texto
 * del botón que el lead seleccionó) Y el set de dynamicQuestions del
 * survey config del evento, construye el buttonId en formato dinámico
 * (`survey_<questionId>_<optionId>`). Esto es necesario porque el
 * handler del wizard (`survey_q1_continue`) usa
 * `detectDynamicSurveyButton(buttonId, validQuestionIds)` que requiere
 * el formato con questionId completo (e.g. "q1_clarity"), NO el
 * formato legacy "q1".
 *
 * Match por `option.title` (case-insensitive, trim). Si no matchea,
 * devuelve null (caller decide qué hacer).
 */
export function buildDynamicButtonIdFromOption(
  optionTitle: string,
  dynamicQuestions: ReadonlyArray<{
    id: string;
    options?: Array<{ id: string; title: string }>;
  }>,
  step: number,
): string | null {
  if (!optionTitle) return null;
  const target = optionTitle.trim().toLowerCase();
  if (!target) return null;
  const q = dynamicQuestions[step - 1];
  if (!q || !Array.isArray(q.options)) return null;
  for (const o of q.options) {
    if (o.title && o.title.trim().toLowerCase() === target) {
      return `survey_${q.id}_${o.id}`;
    }
  }
  return null;
}
