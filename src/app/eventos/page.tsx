import type { Metadata } from "next";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { Badge, Card, Container } from "@/components/ui";
import { listPublishedEvents } from "@/lib/events";
import type { Event } from "@/types/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Eventos · Qlick",
  description:
    "Eventos abiertos de Qlick Marketing Integral: talleres, masterclasses y conferencias para hacer crecer tu negocio. Confirma tu asistencia gratis.",
  alternates: { canonical: "/eventos" },
  openGraph: {
    title: "Eventos · Qlick",
    description:
      "Eventos abiertos de Qlick Marketing Integral. Confirma tu asistencia gratis.",
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
      <main className="min-h-screen bg-brand-50/30">
        <section className="bg-brand-50/40 border-b border-brand-100">
          <Container size="wide" className="py-14">
            <Badge tone="brand" className="mb-4">
              Eventos abiertos
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-bold text-ink tracking-tight">
              Eventos para hacer crecer tu negocio
            </h1>
            <p className="mt-3 text-ink-soft max-w-2xl">
              Talleres, masterclasses y conferencias presenciales y en línea.
              Confirma tu asistencia gratis — te enviamos los detalles por
              email o WhatsApp.
            </p>
            <p className="mt-4 text-sm text-ink-muted">
              {upcoming.length === 0 && past.length === 0
                ? "Aún no hay eventos publicados."
                : `${upcoming.length} próximo${upcoming.length === 1 ? "" : "s"}${
                    past.length > 0 ? ` · ${past.length} finalizado${past.length === 1 ? "" : "s"}` : ""
                  }`}
            </p>
          </Container>
        </section>

        <Container size="wide" className="py-12">
          {events.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-12">
              {upcoming.length > 0 && (
                <section>
                  <h2 className="text-xl font-bold text-ink mb-6">
                    Próximos eventos
                  </h2>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {upcoming.map((e) => (
                      <EventCard key={e.id} event={e} status="upcoming" />
                    ))}
                  </div>
                </section>
              )}
              {past.length > 0 && (
                <section>
                  <h2 className="text-xl font-bold text-ink mb-6">
                    Eventos finalizados
                  </h2>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
    dateStyle: "full",
    timeStyle: "short",
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
      <Card className="overflow-hidden h-full transition group-hover:shadow-md group-hover:border-brand-300">
        {/*
          Decisión B-5: cover visual siempre con gradiente de marca. Las
          imágenes de portada quedaron fuera de scope (debug problemático,
          costo de mantener assets). Si en el futuro se reactiva, ver
          OPEN_ITEMS.md → B-5. El campo `cover_image_url` se conserva en DB
          para no romper compat.
        */}
        <div className="w-full h-40 bg-brand-gradient flex items-center justify-center text-white text-3xl font-bold">
          🎟️
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={status === "upcoming" ? "success" : "neutral"}>
              {status === "upcoming" ? "Próximo" : "Finalizado"}
            </Badge>
            <span className="text-xs text-ink-muted">Evento Qlick</span>
          </div>
          <h3 className="text-lg font-bold text-ink leading-tight group-hover:text-brand-700 transition">
            {event.title}
          </h3>
          {event.description && (
            <p className="text-sm text-ink-soft line-clamp-2">
              {event.description}
            </p>
          )}
          <div className="space-y-1 pt-2 border-t border-brand-50 text-sm">
            <p className="text-ink-soft">
              <span className="mr-1">📅</span>
              {formatEventDate(event.startsAt)}
            </p>
            {event.location && (
              <p className="text-ink-muted">
                <span className="mr-1">📍</span>
                {event.location}
              </p>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-brand-200 bg-white p-10 text-center">
      <p className="text-3xl mb-3">🎟️</p>
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