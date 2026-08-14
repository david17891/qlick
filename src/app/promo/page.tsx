import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Card, Container, Badge } from "@/components/ui";
import { getPublishedEventBySlug } from "@/lib/events/events-server";
import { PromoForm } from "./PromoForm";
import { EventMarketingSummary } from "@/components/events/EventMarketingSummary";

const EVENT_SLUG = "desarrollo-estructura-curso-canaco";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Promoción 2 personas · Los 4 Pilares · Qlick",
  description: "Inscripción promocional para dos personas al taller Los 4 Pilares de un Negocio que Vende.",
  alternates: { canonical: "/promo" },
};

export default async function PromoPage() {
  const event = await getPublishedEventBySlug(EVENT_SLUG);
  if (!event) {
    return <main className="min-h-screen p-10 text-center">La promoción no está disponible.</main>;
  }
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
            <Card className="p-7 self-start">
              <Badge tone="info">Promoción de cierre</Badge>
              <h1 className="mt-3 text-3xl font-bold text-ink">{event.title}</h1>
              <EventMarketingSummary event={event} showPromoLink={false} />
              <ul className="mt-5 space-y-2 text-sm text-ink-soft">
                <li>📍 {event.location}</li>
                <li>📅 {new Date(event.startsAt).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Phoenix" })}</li>
              </ul>
              <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5">
                <p className="text-sm font-semibold text-brand-900">2 personas por $1,500 MXN</p>
                <p className="mt-1 text-sm text-brand-800">Aparta las dos plazas con $200 MXN. El saldo es de $1,300 MXN.</p>
                <p className="mt-2 text-xs text-brand-700">La segunda persona puede quedar pendiente de asignar. No se crea un nombre ni certificado ficticio.</p>
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-ink">¿Vas solo?</p>
                <p className="mt-1 text-sm text-ink-soft">También puedes registrarte como una persona por el precio normal de $1,000 MXN.</p>
              </div>
            </Card>
            <Card className="p-7">
              <PromoForm eventSlug={event.slug} />
            </Card>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
