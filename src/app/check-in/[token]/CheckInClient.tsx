"use client";

/**
 * CheckInClient — UI mobile-first para VER el pase (informativo).
 *
 * FIX 2026-07-03 (sesion David, modelo de funnel): el QR/link que
 * recibe el lead es SOLO informativo — muestra "estás registrado, tu
 * info, tu QR". El check-in REAL (cambio de status a `checked_in`)
 * lo hace el STAFF escaneando el QR en la puerta del evento
 * (Commit B del scope).
 *
 * Antes este componente tenía un botón "Confirmar asistencia" que
 * dejaba al lead auto-confirmarse. Ahora se quitó: ya no hay acción
 * del lado del lead. El status `checked_in` lo setea el scanner.
 *
 * El componente sigue manteniendo los estados success / already /
 * error porque el endpoint POST `/api/check-in/[token]` sigue
 * existiendo — solo que ahora SOLO se llama desde el scanner del
 * staff (con auth diferente). Si el lead ya fue checkeado por el
 * staff, la página muestra "Ya estás en puerta".
 *
 * Pega contra `GET /api/check-in/[token]` (read-only) — el POST
 * ya no se dispara desde esta UI.
 */

import { useState } from "react";
import { formatDate } from "@/lib/utils";

interface Props {
  token: string;
  attendeeName: string;
  eventTitle: string;
  eventStartsAt: string;
  eventLocation: string | null;
  alreadyCheckedIn: boolean;
  checkedInAt: string | null;
  /** URL publica del QR (servida por /api/event-qr/[token].png). */
  qrImageUrl: string;
  /** Email del asistente (para mencionar que tambien se lo mandamos ahi). */
  attendeeEmail: string | null;
}

type Status =
  | { kind: "idle" }
  | { kind: "already"; at: string };

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function CheckInClient({
  token,
  attendeeName,
  eventTitle,
  eventStartsAt,
  eventLocation,
  alreadyCheckedIn,
  checkedInAt,
  qrImageUrl,
  attendeeEmail,
}: Props) {
  // FIX 2026-07-03: ya no hay estado "loading/success" — el lead NO
  // dispara ninguna acción. El status solo refleja si el staff ya
  // hizo check-in (vía scanner, Commit B).
  const [status] = useState<Status>(
    alreadyCheckedIn && checkedInAt
      ? { kind: "already", at: checkedInAt }
      : { kind: "idle" },
  );

  // Already checked in (por el staff via scanner)
  if (status.kind === "already") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-50/40 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="text-6xl">✅</div>
          <h1 className="text-2xl font-bold text-ink">
            Ya estás en puerta
          </h1>
          {/* FIX 2026-07-03 (sesion David): el copy ahora muestra el
              evento + dia + hora del evento en vez de "el staff confirmó
              tu ingreso a las 12:08 a.m." (eso es ruido — al lead no le
              importa cuándo se marcó check-in, le importa el evento). */}
          <p className="text-base text-ink-soft">
            <strong>{attendeeName}</strong>, estás dentro de{" "}
            <strong>{eventTitle}</strong>.
          </p>
          <p className="text-sm text-ink-muted">
            📅 {formatDate(eventStartsAt)} · pasa y disfruta.
          </p>

          {/* Mostramos el QR tambien en el caso "already" — el asistente
              puede querer mostrar el pase en el celular como respaldo. */}
          <div className="rounded-2xl bg-white border border-emerald-200 p-5">
            <p className="text-xs uppercase font-bold text-emerald-700 mb-3 tracking-wide">
              Tu pase (codigo QR)
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl}
              alt={`Codigo QR de entrada para ${eventTitle}`}
              width={220}
              height={220}
              className="mx-auto block bg-white p-3 rounded-xl border border-emerald-100"
            />
          </div>

          <div className="rounded-2xl bg-white border border-emerald-200 p-4 text-left">
            <p className="text-xs uppercase font-bold text-emerald-700 mb-1">
              {eventTitle}
            </p>
            <p className="text-sm text-ink-soft">
              📅 {formatDate(eventStartsAt)}
            </p>
            {eventLocation && (
              <p className="text-sm text-ink-soft">📍 {eventLocation}</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Idle — vista informativa. El lead NO tiene accion; el check-in
  // lo hace el staff escaneando el QR en puerta.
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50/40 to-white flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        {/* Header Qlick */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
            Qlick Marketing Integral
          </p>
        </div>

        {/* Card de info */}
        <div className="rounded-2xl bg-white border border-brand-200 shadow-sm p-5 space-y-3">
          <div className="text-center">
            <p className="text-xs uppercase font-bold text-brand-700">
              Hola,
            </p>
            <h1 className="text-2xl font-bold text-ink mt-1">
              {attendeeName}
            </h1>
          </div>
          <div className="border-t border-brand-100 pt-3 space-y-1.5">
            <p className="text-sm font-semibold text-ink">{eventTitle}</p>
            <p className="text-sm text-ink-soft">📅 {formatDate(eventStartsAt)}</p>
            {eventLocation && (
              <p className="text-sm text-ink-soft">📍 {eventLocation}</p>
            )}
          </div>
        </div>

        {/* FIX 2026-07-03: vista informativa del QR. El check-in lo hace
            el staff con el scanner — NO hay boton del lado del lead. */}
        <div className="rounded-2xl bg-white border border-brand-200 shadow-sm p-5 space-y-3">
          <p className="text-xs uppercase font-bold text-brand-700 tracking-wide text-center">
            Tu pase (codigo QR)
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl}
            alt={`Codigo QR de entrada para ${eventTitle}`}
            width={240}
            height={240}
            className="mx-auto block bg-white p-3 rounded-xl border border-brand-100"
          />
          <p className="text-xs text-ink-muted text-center">
            Muestra esta pantalla (o el email que te mandamos) al staff
            en la entrada. Ellos escanean tu QR para confirmar tu
            asistencia.
          </p>
        </div>

        {/* FIX UX 2026-07-02: avisamos que tambien se mando al correo,
            para reforzar el canal de respaldo. */}
        {attendeeEmail && (
          <div className="rounded-2xl bg-emerald-50/60 border border-emerald-100 p-3 text-sm text-emerald-900">
            <p>
              📧 Tambien te lo mandamos a <strong>{attendeeEmail}</strong>.
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              Si no lo ves, revisa spam o promociones.
            </p>
          </div>
        )}

        <p className="text-center text-[11px] text-ink-muted">
          ¿Cambio de planes? Si no podés asistir, no hace falta que
          hagas nada — el registro expira solo.
        </p>
      </div>
    </main>
  );
}