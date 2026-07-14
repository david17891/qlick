"use client";

/**
 * Formulario público de encuesta post-evento (Render DINÁMICO).
 *
 * FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, commit 8): ahora renderiza
 * preguntas desde `surveyConfig` (provisto por page.tsx, viene del
 * `events.survey_config` jsonb). Si el config está vacío o el evento no
 * tiene, page.tsx cae al Default template (5 preguntas).
 *
 * Render genérico:
 *  - `type === "buttons"` → radio group (1-3 opciones según config).
 *  - `type === "text"` → textarea con skip opcional.
 *
 * Consentimiento:
 *  - Si hay alguna pregunta con `isConsent: true` en una opción, NO se
 *    muestra checkbox separado — la respuesta "Sí" a esa pregunta ES el
 *    consent (LFPDPPP-defendible).
 *  - Si NO hay ninguna pregunta con isConsent, se muestra el checkbox
 *    legacy de consent al final (fallback para configs incompletos).
 *
 * Email + phone son campos EXTRA (no son parte del questions[]), siempre
 * se piden porque el endpoint `/api/submit-survey` los necesita para
 * matchear el lead.
 *
 * Mobile-first. Estado:
 *  - filling: editar respuestas.
 *  - submitting: POST en curso.
 *  - success: gracias.
 *  - error: reintentar.
 */

import { useMemo, useState } from "react";
import type { SurveyConfig, SurveyQuestion } from "@/types/events";

type FormState = "filling" | "submitting" | "success" | "error";

interface Props {
  token: string;
  prefillEmail: string;
  prefillPhone: string;
  surveyConfig: SurveyConfig;
}

export function EncuestaClient({
  token,
  prefillEmail,
  prefillPhone,
  surveyConfig,
}: Props) {
  const [state, setState] = useState<FormState>("filling");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Respuestas dinámicas: { [questionId]: stringValue }
  const [responses, setResponses] = useState<Record<string, string>>({});
  // Fallback consent checkbox (solo si NINGUNA question tiene isConsent flag)
  const [consentFallback, setConsentFallback] = useState(false);
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState(prefillPhone);

  // ¿Hay alguna opción con isConsent? Si sí, NO mostramos checkbox separado.
  const hasConsentFlag = useMemo(() => {
    return surveyConfig.questions.some(
      (q) => q.type === "buttons" && q.options?.some((o) => o.isConsent === true),
    );
  }, [surveyConfig]);

  function setAnswer(questionId: string, value: string) {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  }

  // Validación dinámica: ¿qué campos son required?
  function validate(): string | null {
    // Botón-required: si es buttons, debe haber respuesta
    for (const q of surveyConfig.questions) {
      if (q.type === "buttons") {
        if (!responses[q.id] || responses[q.id].trim() === "") {
          return `Por favor responde: "${q.text}"`;
        }
      }
      // Text: opcional siempre (puede "saltar")
    }
    // Consent: si no hay isConsent flag, debe estar tildado el fallback
    if (!hasConsentFlag && !consentFallback) {
      return "Necesitamos tu autorización para guardar la encuesta.";
    }
    // Email es required (lo pide el endpoint)
    if (!email.trim()) {
      return "Por favor escribe tu correo.";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setErrorMsg(err);
      setState("error");
      return;
    }
    setState("submitting");
    setErrorMsg("");
    try {
      // Calcular consentToContact desde la respuesta con isConsent flag
      let consentToContact = false;
      if (hasConsentFlag) {
        for (const q of surveyConfig.questions) {
          if (q.type === "buttons") {
            const matched = q.options?.find(
              (o) => o.id === responses[q.id] && o.isConsent === true,
            );
            if (matched) {
              consentToContact = true;
              break;
            }
          }
        }
      } else {
        consentToContact = consentFallback;
      }

      // Calcular commercialInterest desde la respuesta con isCommercialInterest flag
      let commercialInterest: string | null = null;
      for (const q of surveyConfig.questions) {
        if (q.type === "buttons") {
          const matched = q.options?.find(
            (o) => o.id === responses[q.id] && o.isCommercialInterest === true,
          );
          if (matched) {
            commercialInterest = matched.title;
            break;
          }
        }
      }

      const res = await fetch("/api/submit-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          responses,
          consentToContact,
          commercialInterest,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
      };
      if (!data.ok) {
        setErrorMsg(data.error ?? "No se pudo enviar la encuesta.");
        setState("error");
        return;
      }
      setState("success");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error de red. Intenta de nuevo.",
      );
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-2">
        <p className="text-4xl" aria-hidden>
          ✅
        </p>
        <h2 className="text-lg font-bold text-emerald-900">
          Gracias por tu feedback
        </h2>
        <p className="text-sm text-emerald-800">
          Tu opinion nos ayuda a mejorar los proximos eventos.
        </p>
      </div>
    );
  }

  if (state === "submitting") {
    return (
      <div className="rounded-xl bg-violet-50 border border-violet-200 p-5 text-center space-y-2">
        <p className="text-2xl" aria-hidden>
          ⏳
        </p>
        <p className="text-sm font-semibold text-violet-900">
          Enviando tu respuesta...
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl bg-white border border-violet-100 p-4 space-y-4"
    >
      {/* Render dinámico de preguntas */}
      {surveyConfig.questions.map((q) => (
        <DynamicQuestion
          key={q.id}
          question={q}
          value={responses[q.id] ?? ""}
          onChange={(v) => setAnswer(q.id, v)}
        />
      ))}

      {/* Email (campo fijo, no parte del questions[] — el endpoint lo necesita) */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-bold text-slate-900 mb-1"
        >
          Tu correo *
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
        />
      </div>

      {/* Phone (campo fijo, opcional) */}
      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-bold text-slate-900 mb-1"
        >
          Tu WhatsApp{" "}
          <span className="text-ink-muted font-normal">(opcional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+52 55 1234 5678"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
        />
      </div>

      {/* Fallback consent checkbox (solo si NINGUNA question tiene isConsent) */}
      {!hasConsentFlag && (
        <div className="rounded-lg bg-violet-50/60 border border-violet-100 p-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consentFallback}
              onChange={(e) => setConsentFallback(e.target.checked)}
              required
              className="mt-0.5 h-4 w-4 text-violet-600 rounded border-slate-300"
            />
            <span className="text-xs text-slate-700 leading-snug">
              Acepto que Qlick use mi respuesta y datos de contacto para
              enviarme seguimiento comercial sobre los temas que indique.
              Puedo darme de baja en cualquier momento respondiendo STOP al
              WhatsApp o escribiendo a{" "}
              <a
                href="mailto:privacidad@qlick.digital"
                className="underline text-violet-700"
              >
                privacidad@qlick.digital
              </a>
              .
            </span>
          </label>
        </div>
      )}

      {/* Error */}
      {state === "error" && errorMsg && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800 font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Submit.
          FIX 2026-07-13 (David bug report): antes el botón estaba
          `disabled={state === "filling"}` que es el estado inicial,
          entonces NUNCA se podía clickear al cargar. El state pasa a
          "submitting"/"error"/"success" después de tocar submit, así
          que el botón siempre arrancaba bloqueado. Ahora el form no
          se renderiza durante "submitting" o "success" (early return
          arriba), entonces no necesitamos disabled en absoluto. */}
      <button
        type="submit"
        className="w-full px-4 py-3 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50"
      >
        {state === "error" ? "Reintentar" : "Enviar mi feedback"}
      </button>

      <p className="text-[10px] text-ink-muted text-center">
        Tus datos se usan solo para enviarte seguimiento comercial. Ver{" "}
        <a href="/privacidad" className="underline">
          aviso de privacidad
        </a>
        .
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-componente: render genérico de una pregunta                     */
/* ------------------------------------------------------------------ */

function DynamicQuestion({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  if (question.type === "buttons" && question.options) {
    const cols =
      question.options.length >= 3 ? 3 : question.options.length;
    return (
      <fieldset>
        <legend className="block text-sm font-bold text-slate-900 mb-2">
          {question.text} *
        </legend>
        <div className={`grid gap-1.5 grid-cols-${cols}`}>
          {question.options.map((o) => (
            <label
              key={o.id}
              className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer rounded-lg border-2 px-1 py-2.5 text-center transition ${
                value === o.id
                  ? "border-violet-500 bg-violet-50 text-violet-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                value={o.id}
                checked={value === o.id}
                onChange={() => onChange(o.id)}
                required
                className="sr-only"
              />
              <span className="text-sm font-bold">{o.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  // text
  return (
    <div>
      <label
        htmlFor={`q-${question.id}`}
        className="block text-sm font-bold text-slate-900 mb-1"
      >
        {question.text}{" "}
        <span className="text-ink-muted font-normal">(opcional)</span>
      </label>
      <textarea
        id={`q-${question.id}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Contanos brevemente (o escribí 'saltar' para omitir)"
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-y"
      />
    </div>
  );
}