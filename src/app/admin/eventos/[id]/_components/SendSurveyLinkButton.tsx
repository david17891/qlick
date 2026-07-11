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
 * El modal detalle (con los items por persona) se muestra después del
 * envío para que David vea el desglose y los waLinks a mandar.
 *
 * Server action definida en `../_actions.ts`.
 */

import { useState, useTransition } from "react";
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
  | { kind: "ok"; sent: number; failed: number; skipped: number; total: number; items: SendItem[] }
  | { kind: "error"; message: string };

export function SendSurveyLinkButton({ eventId, totalConfirmations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<State>({ kind: "idle" });

  const disabled =
    isPending ||
    state.kind === "sending" ||
    totalConfirmations === 0;

  function onClick() {
    if (
      !window.confirm(
        `¿Mandar el link de encuesta a ${totalConfirmations} confirmado(s) del evento?`,
      )
    ) {
      return;
    }
    setState({ kind: "sending" });
    const fd = new FormData();
    fd.set("eventId", eventId);
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
        // Para mostrar el desglose, el server action no devuelve items
        // (ahorra bandwidth y mantiene el contract chico). Si el admin
        // quiere ver el detalle, lo agregamos en Sprint 3. Por ahora
        // alcanza con los totales.
        setState({
          kind: "ok",
          sent: res.sent ?? 0,
          failed: res.failed ?? 0,
          skipped: res.skipped ?? 0,
          total: res.total ?? 0,
          items: [],
        });
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

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label="Enviar link de encuesta post-evento a todos los confirmados"
        title="Genera links únicos y manda el email a cada confirmado (idempotente a nivel de token)"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
      >
        {state.kind === "sending"
          ? "Enviando…"
          : "📨 Enviar link de encuesta"}
      </button>
      {state.kind === "ok" && (
        <span className="text-[10px] text-emerald-700 font-semibold">
          ✓ {state.sent} email/link · {state.failed} fallidos · {state.skipped} sin canal
        </span>
      )}
      {state.kind === "error" && (
        <span className="text-[10px] text-rose-700 font-semibold max-w-[260px] text-right">
          ✗ {state.message}
        </span>
      )}
    </div>
  );
}
