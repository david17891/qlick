/**
 * Validación runtime de `events.survey_config` + plantilla Default del sistema.
 *
 * Server-only. Validación manual (sin dependencias externas) — equivalente
 * a Zod safeParse para nuestro shape. Si el JSON es inválido, devolvemos
 * la plantilla Default para no romper el bot.
 *
 * Privacidad: este módulo no loggea el contenido del JSONB. Solo emite
 * warnings genéricos ("invalid shape") para que ops investigue.
 *
 * @server
 */

import type {
  SurveyConfig,
  SurveyQuestion,
  SurveyQuestionOption,
  SurveyFollowUps,
  SurveyFollowUp,
} from "@/types/events";

// ─────────────────────────────────────────────────────────────
// Validación runtime
// ─────────────────────────────────────────────────────────────

/** Máximo de caracteres permitido en `SurveyQuestionOption.title` (límite Meta). */
const META_BUTTON_TITLE_MAX = 20;

/** Máximo de opciones permitidas en una pregunta tipo "buttons" (límite Meta). */
const META_BUTTONS_MAX = 3;

/** Mínimo de opciones en una pregunta tipo "buttons". */
const META_BUTTONS_MIN = 2;

/**
 * Valida un `raw` desconocido contra el shape `SurveyConfig`.
 *
 * Devuelve `SurveyConfig` si es válido. Si es inválido o vacío,
 * devuelve `null` (el caller debe usar `getDefaultSurveyConfig`).
 *
 * Pura — fácil de testear.
 */
export function validateSurveyConfig(raw: unknown): SurveyConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // questions: array no vacío
  if (!Array.isArray(obj.questions) || obj.questions.length === 0) {
    return null;
  }

  const questions: SurveyQuestion[] = [];
  let consentCount = 0;
  let businessDescCount = 0;

  for (const q of obj.questions) {
    if (!q || typeof q !== "object") return null;
    const qq = q as Record<string, unknown>;

    // id y text requeridos
    if (typeof qq.id !== "string" || qq.id.trim() === "") return null;
    if (typeof qq.text !== "string" || qq.text.trim() === "") return null;

    // type: "buttons" | "text"
    if (qq.type !== "buttons" && qq.type !== "text") return null;

    // Si es buttons, options requerido con 2-3 entries
    let options: SurveyQuestionOption[] | undefined;
    if (qq.type === "buttons") {
      if (!Array.isArray(qq.options)) return null;
      if (
        qq.options.length < META_BUTTONS_MIN ||
        qq.options.length > META_BUTTONS_MAX
      ) {
        return null;
      }
      options = [];
      for (const o of qq.options) {
        if (!o || typeof o !== "object") return null;
        const oo = o as Record<string, unknown>;
        if (typeof oo.id !== "string" || oo.id.trim() === "") return null;
        if (typeof oo.title !== "string") return null;
        if (oo.title.length === 0 || oo.title.length > META_BUTTON_TITLE_MAX) {
          return null;
        }
        if (typeof oo.score !== "number" || oo.score < 0 || oo.score > 100) {
          return null;
        }
        options.push({
          id: oo.id,
          title: oo.title,
          score: oo.score,
          isConsent: oo.isConsent === true ? true : undefined,
          isCommercialInterest:
            oo.isCommercialInterest === true ? true : undefined,
        });
      }
    }

    // Flags exclusivos
    if (qq.isConsent === true) consentCount++;
    if (qq.isBusinessDescription === true) businessDescCount++;
    if (consentCount > 1 || businessDescCount > 1) return null;

    const question: SurveyQuestion = {
      id: qq.id,
      text: qq.text,
      type: qq.type,
      ...(options ? { options } : {}),
      ...(qq.isBusinessDescription === true
        ? { isBusinessDescription: true }
        : {}),
    };
    questions.push(question);
  }

  // followUps: opcional, validar si está presente
  let followUps: SurveyFollowUps | undefined;
  if (obj.followUps && typeof obj.followUps === "object") {
    followUps = {};
    const fu = obj.followUps as Record<string, unknown>;
    if (fu.mql && typeof fu.mql === "object") {
      followUps.mql = parseFollowUp(fu.mql as Record<string, unknown>);
    }
    if (fu.hot && typeof fu.hot === "object") {
      followUps.hot = parseFollowUp(fu.hot as Record<string, unknown>);
    }
    if (fu.coldWarm && typeof fu.coldWarm === "object") {
      followUps.coldWarm = parseFollowUp(
        fu.coldWarm as Record<string, unknown>,
      );
    }
  }

  return {
    questions,
    ...(followUps ? { followUps } : {}),
  };
}

function parseFollowUp(raw: Record<string, unknown>): SurveyFollowUp {
  const text = typeof raw.text === "string" ? raw.text : "";
  const templateName =
    typeof raw.templateName === "string" ? raw.templateName : null;
  const templateLanguage =
    typeof raw.templateLanguage === "string"
      ? raw.templateLanguage
      : "es_MX";
  return {
    text,
    templateName,
    templateLanguage,
  };
}

// ─────────────────────────────────────────────────────────────
// Plantilla Default del sistema
// ─────────────────────────────────────────────────────────────

/**
 * Plantilla por defecto cuando `events.survey_config = {}` o es inválido.
 *
 * 5 preguntas (3 buttons + 1 button consent + 1 text libre):
 * 1. Claridad del contenido (Muy claro 20 / Claro 15 / Confuso 5)
 * 2. Aplicabilidad (Sí 30 / Tal vez 15 / No 0) — Sí/Tal vez son commercial interest
 * 3. Fuente (Facebook-IG 5 / Referido 10 / Otro 0)
 * 4. Consentimiento (Sí 10 / No 0) — Sí tiene isConsent=true (auto-promoción)
 * 5. Negocio (texto libre, isBusinessDescription=true)
 *
 * Max score: 20+30+10+10+15 = 85 (clamped 0-100 en calculateLeadScore).
 */
export function getDefaultSurveyConfig(): SurveyConfig {
  return {
    questions: [
      {
        id: "q1_clarity",
        text: "¿Qué tan claro te quedó el contenido del evento?",
        type: "buttons",
        options: [
          { id: "very_clear", title: "Muy claro", score: 20 },
          { id: "clear", title: "Claro", score: 15 },
          { id: "confusing", title: "Confuso", score: 5 },
        ],
      },
      {
        id: "q2_apply",
        text: "¿Lo aplicarías a tu negocio o proyecto?",
        type: "buttons",
        options: [
          {
            id: "yes",
            title: "Sí",
            score: 30,
            isCommercialInterest: true,
          },
          {
            id: "maybe",
            title: "Tal vez",
            score: 15,
            isCommercialInterest: true,
          },
          { id: "no", title: "No", score: 0 },
        ],
      },
      {
        id: "q3_source",
        text: "¿Cómo conociste este evento?",
        type: "buttons",
        options: [
          { id: "meta", title: "Facebook-IG", score: 5 },
          { id: "referred", title: "Referido", score: 10 },
          { id: "other", title: "Otro", score: 0 },
        ],
      },
      {
        id: "q_consent",
        text: "¿Aceptas que te contactemos por WhatsApp para enviarte información de cursos?",
        type: "buttons",
        options: [
          { id: "yes", title: "Sí", score: 10, isConsent: true },
          { id: "no", title: "No", score: 0 },
        ],
      },
      {
        id: "q_business",
        text: "Contanos brevemente sobre tu negocio o a qué te dedicas (o 'saltar').",
        type: "text",
        isBusinessDescription: true,
      },
    ],
    followUps: {
      mql: {
        text: "¡Excelente {{1}}! Veo que te interesa bastante. Un asesor de Qlick se pondrá en contacto contigo muy pronto por esta vía.",
        templateName: "conf_bienvenida",
        templateLanguage: "es_MX",
      },
      hot: {
        text: "¡Buenísimo {{1}}! Te comparto el temario del curso para que lo revises: https://qlick.digital/cursos",
        templateName: null,
      },
      coldWarm: {
        text: "¡Gracias por tu feedback {{1}}! Tomamos nota para mejorar nuestros próximos eventos.",
        templateName: null,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Resolución segura (con fallback)
// ─────────────────────────────────────────────────────────────

/**
 * Resuelve el `SurveyConfig` para un evento.
 *
 * Si `events.survey_config` está vacío o falla la validación, devuelve
 * la plantilla Default. Loggea un warning si el JSON era inválido (sin
 * exponer el contenido — solo genérico).
 *
 * Server-only.
 */
export function resolveSurveyConfig(raw: unknown): SurveyConfig {
  const validated = validateSurveyConfig(raw);
  if (validated !== null) return validated;

  // JSON inválido o vacío. Si era null/undefined/{}: silencio. Si era
  // algo distinto: warning (sin exponer contenido).
  if (raw !== null && raw !== undefined) {
    const isEmpty =
      typeof raw === "object" &&
      raw !== null &&
      Object.keys(raw as Record<string, unknown>).length === 0;
    if (!isEmpty) {
      // eslint-disable-next-line no-console
      console.warn(
        "[survey-config-validator] events.survey_config tiene shape inválido, usando plantilla Default.",
      );
    }
  }

  return getDefaultSurveyConfig();
}