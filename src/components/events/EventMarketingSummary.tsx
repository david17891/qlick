import Link from "next/link";
import { Calendar, Check, Gift, MapPin, Sparkles, Users } from "lucide-react";
import type { Event } from "@/types/events";

interface Props {
  event: Event;
  /** Muestra el acceso a la promoción de cierre de dos personas. */
  showPromoLink?: boolean;
}

const CANACO_SLUG = "desarrollo-estructura-curso-canaco";

const CANACO_PILLARS = [
  {
    title: "Publicidad que vende",
    text: "Crea y edita anuncios atractivos para tus productos o servicios.",
  },
  {
    title: "Facebook Ads",
    text: "Aprende a lanzar campañas y llegar a más personas.",
  },
  {
    title: "IA para tu negocio",
    text: "Genera textos, respuestas e ideas que te ahorren tiempo.",
  },
  {
    title: "Seguimiento de prospectos",
    text: "Convierte consultas en oportunidades y ventas.",
  },
] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Phoenix",
  });
}

function cleanDescription(description: string): string {
  return description.replace(/\*\*/g, "").trim();
}

/**
 * Presentación de venta legible para la landing. La variante de CANACO es
 * deliberadamente independiente de `events.description`: esa descripción
 * también alimenta el contexto del bot y el checkout normal de una persona.
 */
export function EventMarketingSummary({ event, showPromoLink = true }: Props) {
  const isCanaco = event.slug === CANACO_SLUG;

  if (!isCanaco) {
    if (!event.description) return null;
    return (
      <div className="mt-8 max-w-3xl whitespace-pre-line text-lg leading-relaxed text-ink-soft">
        {cleanDescription(event.description)}
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-4xl space-y-5">
      <section aria-labelledby="event-aprendizajes">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-600" aria-hidden="true" />
          <h2 id="event-aprendizajes" className="text-xl font-bold text-ink sm:text-2xl">
            En 4 horas aprenderás a vender mejor
          </h2>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CANACO_PILLARS.map((pillar) => (
            <li
              key={pillar.title}
              className="rounded-2xl border border-brand-100 bg-white/80 p-4 shadow-sm"
            >
              <p className="font-semibold text-ink">{pillar.title}</p>
              <p className="mt-1 text-sm leading-5 text-ink-soft">{pillar.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {showPromoLink && <section
        aria-labelledby="event-promocion"
        className="rounded-2xl border-2 border-brand-300 bg-gradient-to-br from-brand-50 via-white to-amber-50 p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <h2 id="event-promocion" className="text-lg font-extrabold text-brand-950 sm:text-xl">
              Promoción de cierre
            </h2>
          </div>
          <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">
            Aparta desde $200
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-brand-700 p-4 text-white">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-100">2 personas</p>
            <p className="mt-1 text-3xl font-black">$1,500 MXN</p>
            <p className="mt-1 text-sm text-brand-100">Un solo pago o apartado de $200 para ambas.</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">¿Vas solo?</p>
            <p className="mt-1 text-2xl font-black text-ink">$1,000 MXN</p>
            <p className="mt-1 text-sm text-ink-soft">Conserva la opción normal de una persona.</p>
          </div>
        </div>
        <Link
          href="/promo"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-5 py-3 text-center text-sm font-extrabold text-amber-950 shadow-sm transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          Aprovechar la promoción de 2 personas →
        </Link>
        <p className="mt-3 text-xs leading-5 text-ink-muted">
          El apartado confirma el pago cuando se verifica. La promoción no cambia el registro normal ni crea datos de la segunda persona hasta que se proporcionen.
        </p>
      </section>}

      <section aria-label="Beneficios y datos del evento" className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-emerald-900">
            <Check className="h-4 w-4" aria-hidden="true" /> Incluye
          </p>
          <p className="mt-1 text-sm leading-5 text-emerald-800">
            Constancia de participación. Con pago completo anticipado, recibe además una sesión de Zoom 1 a 1 de una hora después del curso.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Calendar className="h-4 w-4 text-brand-600" aria-hidden="true" />
            {formatDate(event.startsAt)}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {formatTime(event.startsAt)} a {event.endsAt ? formatTime(event.endsAt) : "8:00 p. m."} · 4 horas
          </p>
          <p className="mt-2 flex items-start gap-2 text-sm text-ink-soft">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span>{event.location ?? "CANACO, San Luis Río Colorado"}</span>
          </p>
        </div>
      </section>

      {showPromoLink && (
        <p className="flex items-center gap-2 text-sm font-bold text-brand-800">
          <Users className="h-4 w-4" aria-hidden="true" /> Promoción de cierre: registra a tu acompañante y asegura el precio para dos.
        </p>
      )}
    </div>
  );
}
