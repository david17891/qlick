import type { Metadata } from "next";
import Link from "next/link";
import { Navbar, Footer, PageHero } from "@/components/layout";
import { Button, Container } from "@/components/ui";
import { LucideIcon } from "@/components/ui/Icon";
import { Calendar, MapPin, Ticket } from "lucide-react";
import { listPublishedEvents } from "@/lib/events";
import type { Event } from "@/types/events";
import { cleanEventTitle, formatMXN } from "@/lib/utils";
import { EVENT_TIMEZONE } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Eventos · Qlick",
  description:
    "Eventos abiertos de Qlick Marketing Digital: talleres, masterclasses y conferencias para hacer crecer tu negocio. Confirma tu asistencia gratis.",
  alternates: { canonical: "/eventos" },
  openGraph: {
    title: "Eventos · Qlick",
    description:
      "Eventos abiertos de Qlick Marketing Digital. Confirma tu asistencia gratis.",
    type: "website",
  },
};

/**
 * Página pública de catálogo de eventos: `/eventos`.
 *
 * Server component. Lista los eventos con `status='published'` (sin drafts
 * ni archivados). Cada card es link al detalle `/eventos/[slug]` donde
 * está el form de "Confirmar asistencia".
 *
 * Orden:
 * - Próximos primero, ascendente por fecha (lo más cercano arriba).
 * - Pasados al final, descendente (lo más reciente primero).
 *
 * Esto resuelve el flujo "ventana de eventos abiertos que captura leads":
 * un visitante llega a la home, sigue el link "Eventos" del nav, ve el
 * catálogo y confirma asistencia en el detalle.
 */
export default async function EventosIndexPage() {
  const events = await listPublishedEvents();
  const now = Date.now();
  const upcoming = events.filter(
    (e) => new Date(e.endsAt ?? e.startsAt).getTime() >= now,
  );
  const past = events.filter(
    (e) => new Date(e.endsAt ?? e.startsAt).getTime() < now,
  );

  return (
    <>
      <Navbar />
      <main className="site-page min-h-screen">
        <PageHero
          variant="dark"
          centered={false}
          badge="Agenda Qlick"
          title="Ideas que se entienden mejor en vivo."
          subtitle="Talleres, masterclasses y encuentros para mover tu negocio con contexto, práctica y otras personas que también están construyendo."
          actions={
            <Button href="/contacto" variant="accent" size="lg">
              Quiero enterarme
            </Button>
          }
          stats={
            <>
              <div>
                <strong>{String(upcoming.length).padStart(2, "0")}</strong>
                <span>próximos eventos</span>
              </div>
              <div>
                <strong>{String(past.length).padStart(2, "0")}</strong>
                <span>eventos realizados</span>
              </div>
              <div>
                <strong>MX</strong>
                <span>presencial y en línea</span>
              </div>
            </>
          }
        />

        <Container size="wide" className="py-16 sm:py-24">
          {events.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-16">
              {upcoming.length > 0 && (
                <section>
                  <p className="site-eyebrow">
                    <span className="site-eyebrow__line" aria-hidden="true" />
                    Lo que viene
                  </p>
                  <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                    Próximos eventos
                  </h2>
                  <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {upcoming.map((e) => (
                      <EventCard key={e.id} event={e} status="upcoming" />
                    ))}
                  </div>
                </section>
              )}
              {past.length > 0 && (
                <section>
                  <p className="site-eyebrow">
                    <span className="site-eyebrow__line" aria-hidden="true" />
                    Archivo
                  </p>
                  <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                    Eventos finalizados
                  </h2>
                  <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {past.map((e) => (
                      <EventCard key={e.id} event={e} status="past" />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}

/* ----------------------- Sub-componentes ----------------------- */

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: EVENT_TIMEZONE,
  });
}

function EventCard({
  event,
  status,
}: {
  event: Event;
  status: "upcoming" | "past";
}) {
  return (
    <Link href={`/eventos/${event.slug}`} className="group block">
      <article className="public-event-card h-full">
        <div className="public-event-card__top">
          <span className="public-event-card__status">
            <i aria-hidden="true" />
            {status === "upcoming" ? "Próximo" : "Finalizado"}
          </span>
          <h3 className="font-display text-2xl font-bold leading-tight tracking-tight text-white">
            {cleanEventTitle(event.title)}
          </h3>
        </div>
        <div className="public-event-card__body">
          {event.description && (
            <p className="line-clamp-3 text-sm leading-6 text-ink-muted">
              {event.description.replace(/\*\*/g, "")}
            </p>
          )}
          <div className="public-event-card__meta">
            <p className="flex items-start gap-2">
              <LucideIcon icon={Calendar} size="sm" tone="muted" />
              {formatEventDate(event.startsAt)}
            </p>
            {event.location && (
              <p className="flex items-start gap-2">
                <LucideIcon icon={MapPin} size="sm" tone="muted" />
                {event.location}
              </p>
            )}
          </div>
        </div>
          <div className="public-event-card__price">
          {event.priceMXN == null || event.priceMXN <= 0 ? (
              <span className="text-emerald-700">Gratis</span>
          ) : (
              <div className="flex items-baseline gap-2">
                <span>{formatMXN(event.priceMXN)}</span>
              <span className="text-xs text-ink-muted">MXN</span>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-brand-200 bg-white p-10 text-center shadow-card">
      <div className="mb-3 inline-flex justify-center">
        <LucideIcon icon={Ticket} size="2xl" tone="brand" />
      </div>
      <h3 className="text-lg font-bold text-ink mb-2">
        Aún no hay eventos publicados
      </h3>
      <p className="text-sm text-ink-soft max-w-md mx-auto">
        Estamos preparando los próximos talleres y masterclasses. Si quieres
        enterarte cuando se abran, sigue nuestro contenido o contáctanos
        directamente.
      </p>
      <Link
        href="/contacto"
        className="inline-block mt-5 text-sm font-semibold text-brand-700 hover:underline"
      >
        Ir a contacto →
      </Link>
    </div>
  );
}
