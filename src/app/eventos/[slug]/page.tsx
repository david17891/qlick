import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Badge } from "@/components/ui";
import { getPublishedEventBySlug } from "@/lib/events/events-server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { EventView } from "./EventView";

interface Props {
  params: { slug: string };
}

/**
 * Página pública de un evento: `/eventos/[slug]`.
 *
 * Server component. Solo renderiza eventos con `status='published'`
 * (el lookup con `getPublishedEventBySlug` ya filtra draft/archived).
 * El form de confirmación vive en `EventView` (client component)
 * y delega a `submitEventRegistration` (server action).
 *
 * Visibilidad: la página es pública. Cualquier persona puede ver los
 * detalles del evento sin registrarse. El registro es opt-in y vive
 * en su propia sección prominent (ver `EventView`).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getPublishedEventBySlug(params.slug);
  if (!event) {
    return {
      title: "Evento no encontrado · Qlick",
      robots: { index: false, follow: false },
    };
  }
  const description =
    event.description?.slice(0, 160) ??
    `Confirma tu asistencia a ${event.title} en Qlick Marketing Digital.`;
  return {
    title: `${event.title} · Qlick`,
    description,
    openGraph: {
      title: event.title,
      description,
      // Decisión B-5: sin cover images en OG (no hay cover real todavía).
      // Si se reactiva, ver OPEN_ITEMS.md → B-5.
    },
    robots: { index: true, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function EventPublicPage({ params }: Props) {
  const event = await getPublishedEventBySlug(params.slug);
  if (!event) {
    notFound();
  }

  // ¿Ya pasó? Si hay endsAt, usamos ese; si no, startsAt. Si el evento
  // todavía no terminó, mostramos el form. Si ya pasó, mostramos detalles
  // pero NO form (la persona verá un mensaje y no podrá confirmar tarde).
  const referenceEnd = event.endsAt ?? event.startsAt;
  const pastEvent = referenceEnd
    ? new Date(referenceEnd).getTime() < Date.now()
    : false;

  return (
    <>
      <Navbar />
      <div className="bg-brand-50/40">
        {!isSupabaseConfigured() && (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
            <Badge tone="warning">
              Modo demo: Supabase no configurado. Los registros no se persisten.
            </Badge>
          </div>
        )}
        <EventView event={event} pastEvent={pastEvent} />
      </div>
      <Footer />
    </>
  );
}
