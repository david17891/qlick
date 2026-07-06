/**
 * Pagina publica: encuesta post-evento para el asistente.
 *
 * Ruta: /encuesta/[token]
 *
 * FIX 2026-07-03 (sesion David G-4): el funnel post-evento no se cerraba
 * para walks-in porque no existia esta ruta. Ahora cada asistente recibe
 * un email con `/encuesta/[token]` al cerrar el evento y puede responder
 * desde su celular sin login.
 *
 * Server component: valida el token antes de renderizar el form. Si el
 * token no es valido, muestra una pantalla explicativa clara. Si esta
 * usado o expirado, lo dice explicitamente.
 *
 * El client form vive en `EncuestaClient.tsx` (separado para server/
 * client split limpio).
 *
 * Auth: el token ES la autorizacion. Sin login.
 */

import { lookupSurveyToken } from "@/lib/events/survey-tokens";
import { EncuestaClient } from "./EncuestaClient";
import { getEventById } from "@/lib/events/events-server";
import { getDefaultSurveyConfig } from "@/lib/events/survey-config-validator";

interface PageProps {
  params: { token: string };
}

export const dynamic = "force-dynamic";

export default async function EncuestaPage({ params }: PageProps) {
  const { token } = params;

  // Lookup server-side. Si falla, devolvemos una pantalla informativa.
  const tokenRow = await lookupSurveyToken(token);

  if (!tokenRow) {
    return (
      <CenteredMessage
        title="Link invalido"
        subtitle="No encontramos una encuesta asociada a este link. Pedile al organizador que te envie uno nuevo."
      />
    );
  }

  if (tokenRow.status === "used") {
    return (
      <CenteredMessage
        title="Ya enviaste tu encuesta"
        subtitle="Gracias por tu feedback! Si necesitas modificar algo, escríbenos a hola@qlick.marketing."
      />
    );
  }

  if (tokenRow.status === "expired") {
    return (
      <CenteredMessage
        title="El link expiro"
        subtitle="Este link ya no esta activo. Pedile al organizador uno nuevo y te respondemos en cuanto lo mandemos."
      />
    );
  }

  // status === "valid" — token usable.
  // Traemos el evento para mostrar nombre + fecha en el header.
  const event = await getEventById(tokenRow.event_id);

  // FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, commit 8): pasamos
  // el surveyConfig del evento (jsonb) al client. Si el evento no tiene
  // (o falla el mapper), usamos la plantilla Default (5 preguntas).
  // El mapper ya hace fallback automático, pero por defensa en
  // profundidad lo verificamos acá también.
  const surveyConfig = event?.surveyConfig ?? getDefaultSurveyConfig();

  return (
    <main className="min-h-screen bg-gradient-to-b from-violet-50/40 to-white px-4 py-8">
      <div className="max-w-md mx-auto space-y-4">
        <header className="text-center pt-2">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
            Encuesta post-evento
          </p>
          {event && (
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {event.title}
            </h1>
          )}
          <p className="mt-1 text-sm text-ink-muted">
            Tu feedback ayuda a mejorar los proximos eventos.
          </p>
        </header>

        <EncuestaClient
          token={token}
          prefillEmail={tokenRow.email ?? ""}
          prefillPhone={tokenRow.phone_normalized ?? ""}
          surveyConfig={surveyConfig}
        />
      </div>
    </main>
  );
}

function CenteredMessage({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-violet-50/40 to-white px-4 py-12">
      <div className="max-w-md mx-auto text-center pt-12 space-y-3">
        <p className="text-5xl" aria-hidden>
          {(title === "Link invalido" && "🔗") ||
            (title === "Ya enviaste tu encuesta" && "✅") ||
            (title === "El link expiro" && "⏰") ||
            "📋"}
        </p>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-ink-muted max-w-sm mx-auto">{subtitle}</p>
      </div>
    </main>
  );
}
