"use client";

/**
 * Botón "📨 Enviar link de encuesta" en la toolbar del tab Confirmados.
 *
 * Sprint cierre-eventos-virtuales (2026-07-11, sesión David): David
 * necesita un mecanismo para mover confirmados → asistencia real en
 * eventos Zoom. Este botón dispara el server action
 * `sendSurveyLinkToAllConfirmationsAction`, que:
 *
 *   1. Genera (o reutiliza) un `event_survey_tokens` por cada confirmado.
 *   2. Manda el email de invitación (Brevo) a los confirmados con email.
 *   3. Devuelve links wa.me pre-armados para los confirmados con phone
 *      (sin email) — el admin los manda manual desde la UI.
 *
 * El feedback es inline con totales (enviados / fallidos / skipped).
 *
 * FIX 2026-07-11 (Gap #4): el botón tiene **cooldown de 30s** después
 * de un envío exitoso para evitar doble click accidental (gasta emails
 * de Brevo innecesariamente). El admin ve el countdown inline.
 *
 * FIX 2026-07-11 (Gap #4): checkbox **"Solo preview"** (dryRun) que
 * pasa `dryRun=true` al server action — genera tokens y prepara los
 * links, pero NO manda emails. Útil para que David valide el alcance
 * antes del envío real.
 *
 * Server action definida en `../_actions.ts`.
 */

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendSurveyLinkToAllConfirmationsAction } from "../_actions";

interface SendItem {
  confirmationId: string;
  attendeeName: string;
  email: string | null;
  phoneNormalized: string | null;
  channel: "email" | "whatsapp" | "none";
  sent: boolean;
  note: string;
  surveyUrl: string | null;
  waLink: string | null;
}

interface Props {
  eventId: string;
  totalConfirmations: number;
}

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok"; sent: number; failed: number; skipped: number; total: number; items: SendItem[]; dryRun: boolean }
  | { kind: "error"; message: string };

/** Cooldown en segundos después de un envío exitoso (Gap #4). */
const COOLDOWN_SECONDS = 30;

export function SendSurveyLinkButton({ eventId, totalConfirmations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<State>({ kind: "idle" });
  /** FIX Gap #4: checkbox de dry-run (preview sin gastar Brevo). */
  const [dryRun, setDryRun] = useState(false);
  /** FIX Gap #4: timestamp (Date.now()) hasta el cual el botón está deshabilitado. */
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  /** FIX Gap #4: countdown visible al admin (segundos restantes). */
  const [cooldownLeft, setCooldownLeft] = useState<number>(0);
  /** FIX Gap #3: modal detalle con waLinks pre-armados. */
  const [showDetail, setShowDetail] = useState(false);

  // FIX Gap #4: ticker para refrescar el countdown cada segundo.
  useEffect(() => {
    if (cooldownUntil === 0) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left <= 0) {
        setCooldownUntil(0);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const inCooldown = cooldownUntil > Date.now();
  const disabled =
    isPending ||
    state.kind === "sending" ||
    totalConfirmations === 0 ||
    inCooldown;

  function onClick() {
    const confirmMsg = dryRun
      ? `¿Generar links de preview (sin enviar emails) para ${totalConfirmations} confirmado(s)?`
      : `¿Mandar el link de encuesta a ${totalConfirmations} confirmado(s) del evento?`;
    if (!window.confirm(confirmMsg)) {
      return;
    }
    setState({ kind: "sending" });
    const fd = new FormData();
    fd.set("eventId", eventId);
    if (dryRun) fd.set("dryRun", "true");
    startTransition(async () => {
      try {
        const res = await sendSurveyLinkToAllConfirmationsAction(null, fd);
        if (!res.ok) {
          setState({
            kind: "error",
            message: res.note ?? "Error desconocido.",
          });
          return;
        }
        setState({
          kind: "ok",
          sent: res.sent ?? 0,
          failed: res.failed ?? 0,
          skipped: res.skipped ?? 0,
          total: res.total ?? 0,
          // FIX Gap #3: usar items reales del orquestador (con waLinks
          // pre-armados) en lugar de array vacío.
          items: res.items ?? [],
          dryRun,
        });
        // FIX Gap #4: activar cooldown después de un envío exitoso
        // (también en dryRun, para evitar spam de previews).
        setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);
        // Refresca la tabla para que el badge "Respondió link" se
        // actualice cuando los confirmados empiecen a responder.
        router.refresh();
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Error de red.",
        });
      }
    });
  }

  // FIX Gap #4: label del botón cambia según estado.
  const buttonLabel = (() => {
    if (state.kind === "sending") return dryRun ? "Generando preview…" : "Enviando…";
    if (inCooldown) return `⏳ Reintentar en ${cooldownLeft}s`;
    return dryRun ? "👁 Generar preview (sin emails)" : "📨 Enviar link de encuesta";
  })();

  return (
    <div className="inline-flex flex-col items-end gap-1">
      {/* FIX Gap #4: checkbox de dry-run (preview). */}
      <label
        className="flex items-center gap-1.5 text-[10px] text-ink-muted cursor-pointer"
        title="Si está activo, NO manda emails — solo genera los links. Útil para previsualizar el alcance antes del envío real."
      >
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          disabled={state.kind === "sending"}
          className="rounded border-brand-300 text-brand-500 focus:ring-brand-300"
        />
        Solo preview (no enviar emails)
      </label>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label="Enviar link de encuesta post-evento a todos los confirmados"
        title={
          inCooldown
            ? `Espera ${cooldownLeft}s para reintentar (cooldown post-envío)`
            : dryRun
              ? "Genera los links sin enviar emails (preview)"
              : "Genera links únicos y manda el email a cada confirmado (idempotente a nivel de token)"
        }
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
      >
        {buttonLabel}
      </button>
      {state.kind === "ok" && (
        <span
          className={`text-[10px] font-semibold ${dryRun ? "text-blue-700" : "text-emerald-700"}`}
        >
          {dryRun ? "👁" : "✓"} {state.sent} {dryRun ? "links generados" : "email/link"} · {state.failed} fallidos · {state.skipped} sin canal
        </span>
      )}
      {state.kind === "ok" && state.items.length > 0 && (
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="text-[10px] text-brand-700 hover:text-brand-800 underline font-semibold"
        >
          Ver detalle ({state.items.length})
        </button>
      )}
      {state.kind === "error" && (
        <span className="text-[10px] text-rose-700 font-semibold max-w-[260px] text-right">
          ✗ {state.message}
        </span>
      )}

      {/* FIX Gap #3: modal detalle con desglose por confirmado. */}
      {showDetail && state.kind === "ok" && (
        <DetailModal
          items={state.items}
          dryRun={state.dryRun}
          onClose={() => setShowDetail(false)}
        />
      )}
      {showDetail && <DetailEscCloser onEsc={() => setShowDetail(false)} />}
    </div>
  );
}

/** Helper local: cierra el modal con tecla ESC. Mismo patrón que
 *  AddConfirmationButton.tsx. */
function DetailEscCloser({ onEsc }: { onEsc: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onEsc();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEsc]);
  return null;
}

/**
 * FIX Gap #3 (2026-07-11): modal inline que muestra el desglose
 * por confirmado después de un envío. Especialmente útil para los
 * confirmados con phone sin email (canal='whatsapp') — el admin
 * ve el `waLink` pre-armado y lo manda manual con 1 click.
 */
function DetailModal({
  items,
  dryRun,
  onClose,
}: {
  items: SendItem[];
  dryRun: boolean;
  onClose: () => void;
}) {
  // FIX Gap #3: agrupar items por canal para que David los cuente
  // de un vistazo. Los de WhatsApp son los que requieren acción
  // manual (mandar el waLink).
  const whatsappItems = items.filter((i) => i.channel === "whatsapp");
  const emailItems = items.filter((i) => i.channel === "email");
  const noneItems = items.filter((i) => i.channel === "none");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalle del envío del link de encuesta"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[80vh] rounded-2xl bg-white shadow-2xl border border-brand-100 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-brand-50 flex items-center justify-between">
          <h2 className="font-bold text-ink">
            📋 Detalle del envío ({items.length} confirmado{items.length === 1 ? "" : "s"})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-ink-muted hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-3 border-b border-brand-50 bg-brand-50/30 text-xs flex flex-wrap gap-4">
          <span>
            <strong className="text-emerald-700">{emailItems.length}</strong> email
            {emailItems.length === 1 ? "" : "s"} {dryRun ? "preparados" : "enviado" + (emailItems.length === 1 ? "" : "s")}
          </span>
          {whatsappItems.length > 0 && (
            <span>
              <strong className="text-blue-700">{whatsappItems.length}</strong> WhatsApp pendiente{dryRun ? " (preview)" : " — mandar manual"}
            </span>
          )}
          {noneItems.length > 0 && (
            <span>
              <strong className="text-amber-700">{noneItems.length}</strong> sin canal de contacto
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-50/50 sticky top-0">
              <tr className="text-left text-xs uppercase text-ink-muted">
                <th className="px-4 py-2 font-semibold">Nombre</th>
                <th className="px-4 py-2 font-semibold">Contacto</th>
                <th className="px-4 py-2 font-semibold">Canal</th>
                <th className="px-4 py-2 font-semibold">Estado</th>
                <th className="px-4 py-2 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {items.map((item) => (
                <tr key={item.confirmationId}>
                  <td className="px-4 py-2 font-medium text-ink">
                    {item.attendeeName}
                  </td>
                  <td className="px-4 py-2 text-ink-muted text-xs">
                    {item.email && <div>📧 {item.email}</div>}
                    {item.phoneNormalized && (
                      <div>📱 {item.phoneNormalized}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {item.channel === "email" && (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                        email
                      </span>
                    )}
                    {item.channel === "whatsapp" && (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                        WhatsApp
                      </span>
                    )}
                    {item.channel === "none" && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                        sin canal
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-muted">
                    {item.sent ? "✓ enviado" : "✗ " + item.note}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.channel === "whatsapp" && item.waLink && (
                      <a
                        href={item.waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition"
                      >
                        💬 Mandar
                      </a>
                    )}
                    {item.surveyUrl && item.channel === "email" && (
                      <a
                        href={item.surveyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-brand-700 hover:bg-brand-50 transition"
                        title="Ver el link que se mandó (debug)"
                      >
                        🔗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-brand-50 flex items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">
            {whatsappItems.length > 0
              ? `Click en "💬 Mandar" para abrir WhatsApp Web con el mensaje pre-armado (${whatsappItems.length} pendiente${whatsappItems.length === 1 ? "" : "s"}).`
              : "Todos los confirmados con WhatsApp pendiente ya están contactados."}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-semibold hover:bg-brand-600 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
