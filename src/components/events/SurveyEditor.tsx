"use client";

/**
 * Editor visual de encuesta (commit 10).
 *
 * Estado actual (Fase 7d.2, 2026-07-05):
 * - Renderiza el survey_config del evento en una lista editable.
 * - David puede agregar/quitar/reordenar preguntas + opciones.
 * - Validaciones client-side: 3 botones máx, 20 chars título, ≤1 isConsent.
 * - Estado se mantiene en memoria del componente.
 * - Botón "💾 Guardar" está wired a un endpoint futuro (`POST /api/admin/events/[id]/survey-config`).
 *   Por ahora muestra un toast "Próximamente" porque el endpoint está fuera
 *   de scope de este commit (David prefiere ver la UI antes de invertir
 *   en el endpoint de guardado).
 *
 * Para Fase 8+: agregar endpoint server-side con auth admin que actualice
 * `events.survey_config` (jsonb) + audit log.
 */

import { useState } from "react";
import type {
  SurveyConfig,
  SurveyQuestion,
  SurveyQuestionOption,
  SurveyFollowUps,
} from "@/types/events";
import { getDefaultSurveyConfig } from "@/lib/events/survey-config-validator";

interface Props {
  eventId: string;
  eventTitle: string;
  initialConfig: SurveyConfig;
}

const META_BUTTONS_MAX = 3;
const META_BUTTON_TITLE_MAX = 20;

export function SurveyEditor({
  eventId,
  eventTitle,
  initialConfig,
}: Props) {
  const [config, setConfig] = useState<SurveyConfig>(initialConfig);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  function addQuestion() {
    const newQ: SurveyQuestion = {
      id: `q_custom_${Date.now()}`,
      text: "Nueva pregunta",
      type: "buttons",
      options: [
        { id: "opt_1", title: "Opción 1", score: 10 },
        { id: "opt_2", title: "Opción 2", score: 5 },
      ],
    };
    setConfig((prev) => ({
      ...prev,
      questions: [...prev.questions, newQ],
    }));
  }

  function removeQuestion(index: number) {
    setConfig((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  }

  function updateQuestion(index: number, partial: Partial<SurveyQuestion>) {
    setConfig((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === index ? { ...q, ...partial } : q,
      ),
    }));
  }

  function addOption(qIndex: number) {
    setConfig((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i !== qIndex) return q;
        const currentOpts = q.options ?? [];
        if (currentOpts.length >= META_BUTTONS_MAX) return q; // hard cap
        return {
          ...q,
          options: [
            ...currentOpts,
            {
              id: `opt_${Date.now()}`,
              title: `Opción ${currentOpts.length + 1}`,
              score: 5,
            },
          ],
        };
      }),
    }));
  }

  function removeOption(qIndex: number, oIndex: number) {
    setConfig((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i !== qIndex) return q;
        return {
          ...q,
          options: (q.options ?? []).filter((_, j) => j !== oIndex),
        };
      }),
    }));
  }

  function updateOption(
    qIndex: number,
    oIndex: number,
    partial: Partial<SurveyQuestionOption>,
  ) {
    setConfig((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i !== qIndex) return q;
        return {
          ...q,
          options: (q.options ?? []).map((o, j) =>
            j === oIndex ? { ...o, ...partial } : o,
          ),
        };
      }),
    }));
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setConfig((prev) => {
      const questions = [...prev.questions];
      const newIndex = index + dir;
      if (newIndex < 0 || newIndex >= questions.length) return prev;
      [questions[index], questions[newIndex]] = [
        questions[newIndex],
        questions[index],
      ];
      return { ...prev, questions };
    });
  }

  function resetToDefault() {
    const def = getDefaultSurveyConfig();
    setConfig(def);
    setSavedNotice("Restaurado a plantilla Default. Pendiente guardar.");
    setTimeout(() => setSavedNotice(null), 3000);
  }

  function handleSave() {
    // Stub: el endpoint real se implementa en un commit aparte.
    setSavedNotice(
      `💾 Guardado pendiente. (Endpoint POST /api/admin/events/${eventId}/survey-config — Fase 8+). JSON listo en memoria con ${config.questions.length} preguntas.`,
    );
    setTimeout(() => setSavedNotice(null), 6000);
  }

  // Validaciones agregadas
  const consentCount = config.questions.filter(
    (q) => q.type === "buttons" && q.options?.some((o) => o.isConsent === true),
  ).length;
  const businessDescCount = config.questions.filter(
    (q) => q.isBusinessDescription === true,
  ).length;
  const validationIssues: string[] = [];
  if (consentCount > 1)
    validationIssues.push(
      `Hay ${consentCount} preguntas con flag isConsent. Meta recomienda máximo 1.`,
    );
  if (businessDescCount > 1)
    validationIssues.push(
      `Hay ${businessDescCount} preguntas con flag isBusinessDescription. Máximo 1.`,
    );
  for (const q of config.questions) {
    if (q.type === "buttons") {
      const opts = q.options ?? [];
      if (opts.length < 2)
        validationIssues.push(
          `"${q.text}" tiene ${opts.length} opciones. Mínimo 2.`,
        );
      if (opts.length > META_BUTTONS_MAX)
        validationIssues.push(
          `"${q.text}" tiene ${opts.length} opciones. Máximo ${META_BUTTONS_MAX} (límite Meta).`,
        );
      for (const o of opts) {
        if (o.title.length === 0)
          validationIssues.push(
            `Opción "${o.id}" en "${q.text}" sin título.`,
          );
        if (o.title.length > META_BUTTON_TITLE_MAX)
          validationIssues.push(
            `Opción "${o.id}" título excede ${META_BUTTON_TITLE_MAX} chars (Meta).`,
          );
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            📋 Encuesta del evento
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {config.questions.length} pregunta
            {config.questions.length === 1 ? "" : "s"} · personaliza el flujo
            post-evento de "{eventTitle}"
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetToDefault}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            ↺ Reset a default
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={validationIssues.length > 0}
            className="px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            💾 Guardar
          </button>
        </div>
      </div>

      {/* Validation issues */}
      {validationIssues.length > 0 && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
          <p className="text-xs font-bold text-rose-900 mb-1">
            ⚠️ {validationIssues.length} issue
            {validationIssues.length === 1 ? "" : "s"} de validación:
          </p>
          <ul className="text-xs text-rose-800 list-disc list-inside space-y-0.5">
            {validationIssues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {savedNotice && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
          {savedNotice}
        </div>
      )}

      {/* Lista de preguntas */}
      <ol className="space-y-3">
        {config.questions.map((q, qi) => (
          <li
            key={q.id}
            className="rounded-xl bg-white border border-slate-200 p-4 space-y-3"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs font-bold text-slate-400 mt-1.5 w-6 shrink-0">
                #{qi + 1}
              </span>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={q.text}
                  onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold"
                  placeholder="Texto de la pregunta"
                />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={q.type === "text"}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateQuestion(qi, {
                            type: "text",
                            options: undefined,
                            isBusinessDescription: q.isBusinessDescription,
                          });
                        } else {
                          updateQuestion(qi, {
                            type: "buttons",
                            options: q.options ?? [
                              { id: "opt_1", title: "Opción 1", score: 5 },
                              { id: "opt_2", title: "Opción 2", score: 5 },
                            ],
                          });
                        }
                      }}
                    />
                    Texto libre (sin botones)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={q.isBusinessDescription === true}
                      onChange={(e) =>
                        updateQuestion(qi, {
                          isBusinessDescription: e.target.checked || undefined,
                        })
                      }
                    />
                    Es descripción del negocio
                  </label>
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => moveQuestion(qi, -1)}
                  disabled={qi === 0}
                  className="px-2 py-0.5 text-xs border border-slate-200 rounded disabled:opacity-30"
                  aria-label="Subir"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveQuestion(qi, 1)}
                  disabled={qi === config.questions.length - 1}
                  className="px-2 py-0.5 text-xs border border-slate-200 rounded disabled:opacity-30"
                  aria-label="Bajar"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeQuestion(qi)}
                  className="px-2 py-0.5 text-xs border border-rose-200 text-rose-700 rounded hover:bg-rose-50"
                  aria-label="Eliminar"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Options (solo si type === buttons) */}
            {q.type === "buttons" && (
              <div className="ml-8 space-y-2">
                {(q.options ?? []).map((o, oi) => (
                  <div
                    key={o.id}
                    className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-slate-50"
                  >
                    <span className="text-[10px] text-slate-400 w-4 shrink-0">
                      {oi + 1}.
                    </span>
                    <input
                      type="text"
                      value={o.title}
                      onChange={(e) =>
                        updateOption(qi, oi, { title: e.target.value })
                      }
                      maxLength={META_BUTTON_TITLE_MAX}
                      placeholder="Título del botón"
                      className="flex-1 min-w-[120px] px-2 py-1 border border-slate-200 rounded text-xs"
                    />
                    <label className="flex items-center gap-1 text-[10px]">
                      score
                      <input
                        type="number"
                        value={o.score}
                        onChange={(e) =>
                          updateOption(qi, oi, {
                            score: Number(e.target.value),
                          })
                        }
                        min={0}
                        max={100}
                        className="w-14 px-1 py-0.5 border border-slate-200 rounded text-xs font-mono"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[10px]">
                      <input
                        type="checkbox"
                        checked={o.isConsent === true}
                        onChange={(e) =>
                          updateOption(qi, oi, {
                            isConsent: e.target.checked || undefined,
                          })
                        }
                      />
                      consent
                    </label>
                    <label className="flex items-center gap-1 text-[10px]">
                      <input
                        type="checkbox"
                        checked={o.isCommercialInterest === true}
                        onChange={(e) =>
                          updateOption(qi, oi, {
                            isCommercialInterest: e.target.checked || undefined,
                          })
                        }
                      />
                      comm. interest
                    </label>
                    <button
                      type="button"
                      onClick={() => removeOption(qi, oi)}
                      className="px-1.5 py-0.5 text-[10px] border border-rose-200 text-rose-700 rounded hover:bg-rose-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addOption(qi)}
                  disabled={(q.options ?? []).length >= META_BUTTONS_MAX}
                  className="ml-6 px-2 py-1 text-xs border border-slate-200 text-slate-700 rounded hover:bg-slate-50 disabled:opacity-30"
                >
                  + Agregar opción
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={addQuestion}
        className="w-full px-3 py-2 text-sm font-semibold border-2 border-dashed border-slate-200 text-slate-700 rounded-xl hover:border-violet-300 hover:text-violet-700"
      >
        + Agregar pregunta
      </button>
    </div>
  );
}

// Re-export del SurveyFollowUps para que el editor lo use si quiere
// extender (placeholder, no implementado en este commit).
void ({} as SurveyFollowUps);