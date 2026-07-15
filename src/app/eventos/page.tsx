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
          B-5 v2: cover visual con gradiente de marca + título del evento.
          Consistente con la página, no depende de assets externos, único
          por evento (no emoji genérico repetido en todas las cards).
          El campo `cover_image_url` en DB se conserva por compat con
          imports previos. Ver `docs/OPEN_ITEMS.md` → B-5.
        */}
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-brand-700 via-brand-500 to-brand-400 group-hover:scale-[1.02] transition-transform duration-300 flex flex-col gap-3 p-4">
          {/* Patrón sutil para textura, no dominante */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 80%, white 0%, transparent 40%), radial-gradient(circle at 80% 20%, white 0%, transparent 35%)",
            }}
          />
          {/* Fila superior: Badge y Evento Qlick */}
          <div className="relative z-10 flex items-center justify-between gap-2">
            <Badge tone={status === "upcoming" ? "success" : "neutral"}>
              {status === "upcoming" ? "Próximo" : "Finalizado"}
            </Badge>
            <span className="text-xs text-white/90 font-semibold drop-shadow-sm">Evento Qlick</span>
          </div>
          {/* Fila inferior: Título del evento */}
          <div className="relative z-10">
            <h3 className="text-white font-bold text-lg leading-tight drop-shadow-md line-clamp-3">
              {event.title}
            </h3>
          </div>
        </div>
        <div className="p-5 space-y-3">
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
        {/*
          Bloque de precio (sprint 2026-07-15). Mismo patron visual que
          CourseCard: precio grande y visible abajo de la card, "Gratis"
          si priceMXN es 0/undefined, formato MXN. Asi el usuario ve
          inmediatamente si el evento es de pago o no, sin tener que
          entrar al detalle.
        */}
        <div className="mt-auto px-5 pb-5 pt-3 border-t border-brand-50">
          {event.priceMXN == null || event.priceMXN <= 0 ? (
            <span className="text-lg font-bold text-emerald-600">Gratis</span>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-ink">
                {formatMXN(event.priceMXN)}
              </span>
              <span className="text-xs text-ink-muted">MXN</span>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

/**
 * Formato MXN con separador de miles y 2 decimales. Mismo helper que
 * usa CourseCard — si existe en lib/utils, importarlo de ahi en sprint
 * futuro (sprint 2026-07-15: lo duplico localmente para no acoplarme).
 */
function formatMXN(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
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