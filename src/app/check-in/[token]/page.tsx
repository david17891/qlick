/**
 * Página pública de check-in mobile-first.
 *
 * El asistente escanea el QR del WhatsApp de confirmación, aterriza acá,
 * ve su nombre + evento + fecha, y pulsa un botón grande "Confirmar
 * asistencia". El POST pega contra `/api/check-in/[token]`.
 *
 * Estados:
 *  - Token inválido (404): "No encontramos tu pase" + link a WhatsApp.
 *  - Token expirado (410): "Tu pase venció el ..." + link a WhatsApp.
 *  - Token válido y NO chequeado: nombre + botón "Confirmar asistencia".
 *  - Token válido y YA chequeado: "Ya registraste tu asistencia a las HH:MM".
 *  - Confirmación exitosa: "¡Listo, {nombre}! Que disfrutes la conferencia 🎉".
 *
 * Sin auth: el QR ES la autorización. El audit log registra cada hit
 * (server side) con IP + user agent para trazabilidad.
 *
 * Mobile-first: diseñamos para 360px+. El botón principal ocupa
 * toda la pantalla. Sin dependencias JS pesadas (solo un fetch inline).
 */

import { CheckInClient } from "./CheckInClient";

interface Props {
  params: { token: string };
}

interface CheckInInfo {
  ok: boolean;
  attendee: {
    name: string;
    phone: string | null;
    email: string | null;
  };
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    location: string | null;
    slug: string;
  };
  alreadyCheckedIn: boolean;
  checkedInAt: string | null;
}

interface CheckInError {
  ok: false;
  error: string;
  expired_at?: string;
}

type FetchResult =
  | { kind: "ok"; info: CheckInInfo }
  | { kind: "expired"; info: CheckInError }
  | { kind: "not_found"; info: CheckInError }
  | { kind: "demo" };

async function fetchInfo(token: string): Promise<FetchResult> {
  // Llamada server-side al endpoint público. Usamos el host interno.
  // En dev: http://localhost:3000. En prod: NEXT_PUBLIC_APP_URL.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/check-in/${encodeURIComponent(token)}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = (await res.json()) as CheckInInfo | CheckInError;
    if (res.status === 200 && "ok" in data && data.ok) {
      return { kind: "ok", info: data as CheckInInfo };
    }
    if (res.status === 410) {
      return { kind: "expired", info: data as CheckInError };
    }
    return { kind: "not_found", info: data as CheckInError };
  } catch {
    return { kind: "demo" };
  }
}

export default async function CheckInPage({ params }: Props) {
  const { token } = params;
  const result = await fetchInfo(token);

  if (result.kind === "demo") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-brand-50/40 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-5xl">🛠️</div>
          <h1 className="text-xl font-bold text-ink">
            Modo demo
          </h1>
          <p className="text-sm text-ink-muted">
            Supabase no está configurado en este entorno. El check-in real
            requiere que la DB esté conectada.
          </p>
        </div>
      </main>
    );
  }

  if (result.kind === "not_found") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-rose-50/40 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="text-5xl">🔍</div>
          <h1 className="text-2xl font-bold text-ink">
            No encontramos tu pase
          </h1>
          <p className="text-sm text-ink-muted">
            El link que escaneaste no es válido. Si lo copiaste de un
            mensaje de WhatsApp, asegurate de que esté completo. Si el
            problema persiste, contactanos por WhatsApp y te ayudamos.
          </p>
          <a
            href="https://wa.me/5212222222222?text=Hola%2C%20tuve%20un%20problema%20con%20mi%20pase%20de%20check-in"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full max-w-xs mx-auto px-6 py-4 rounded-2xl bg-emerald-500 text-white font-semibold text-base shadow-md hover:bg-emerald-600 transition"
          >
            💬 Hablar por WhatsApp
          </a>
        </div>
      </main>
    );
  }

  if (result.kind === "expired") {
    return (
      <main className="min-h-screen bg-gradient-to-b from-amber-50/40 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="text-5xl">⌛</div>
          <h1 className="text-2xl font-bold text-ink">Tu pase venció</h1>
          <p className="text-sm text-ink-muted">
            Los QRs de check-in son válidos solo durante el evento más 6
            horas. Si todavía estás a tiempo de llegar, contactanos por
            WhatsApp y te abrimos la puerta.
          </p>
          <a
            href="https://wa.me/5212222222222?text=Hola%2C%20mi%20pase%20de%20check-in%20venci%C3%B3"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full max-w-xs mx-auto px-6 py-4 rounded-2xl bg-emerald-500 text-white font-semibold text-base shadow-md hover:bg-emerald-600 transition"
          >
            💬 Hablar por WhatsApp
          </a>
        </div>
      </main>
    );
  }

  // Estado OK: pasar al Client Component.
  const { info } = result;
  return (
    <CheckInClient
      token={token}
      attendeeName={info.attendee.name}
      eventTitle={info.event.title}
      eventStartsAt={info.event.startsAt}
      eventLocation={info.event.location}
      alreadyCheckedIn={info.alreadyCheckedIn}
      checkedInAt={info.checkedInAt}
    />
  );
}