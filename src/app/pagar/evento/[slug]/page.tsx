/**
 * Página de pago de un evento (migration 20260714230000).
 *
 * Análoga a `/pagar/[courseSlug]/page.tsx` (Fase C) pero para eventos.
 * Misma lógica de provider selection (mock vs real) y mismos
 * componentes reutilizables (SimulatorForm + CheckoutButton).
 *
 * Flujo:
 * 1. Llega con `/pagar/[eventSlug]`.
 * 2. Si el evento no existe → 404 inline.
 * 3. Si el evento es free (priceMXN === 0) → redirect a /eventos/[slug]
 *    (los eventos gratis no requieren pago, van al form de confirmación).
 * 4. Si el evento está en draft/archived → 400 explicando que debe
 *    publicarse primero.
 * 5. Si NO hay sesión → renderiza igual (guest checkout desde
 *    2026-07-08, el webhook crea la cuenta con el email de Stripe).
 * 6. Si ya tiene event_access activo → redirect a
 *    `/eventos/[slug]?paid=already` (ya pagó, no cobrar dos veces).
 * 7. Si todo OK → renderiza el componente de checkout según provider:
 *    - mock → SimulatorForm (3 botones: éxito/fallo/pendiente)
 *    - real → CheckoutButton que dispara /api/payments/create-checkout
 *
 * Server Component. La decisión de provider corre 100% en server.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button, Badge } from "@/components/ui";
import { getCurrentStudent } from "@/lib/auth/session";
import { getEventBySlug } from "@/lib/events/events-server";
import { checkEventAccess } from "@/lib/lms/event-entitlements";
import { SimulatorForm } from "./SimulatorForm";
import { CheckoutButton } from "./CheckoutButton";

// Provider activo leído en build/runtime. Default "mock" para dev local.
const PAYMENT_PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ?? "mock").toLowerCase();
const IS_MOCK = PAYMENT_PROVIDER === "mock";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const event = await getEventBySlug(params.slug);
  if (!event) {
    return { title: "Evento no encontrado · Qlick" };
  }
  return {
    title: `Pagar entrada · ${event.title} · Qlick`,
    description: `Pagá tu entrada para ${event.title} y asegurá tu lugar.`,
    alternates: { canonical: `/pagar/evento/${params.slug}` },
    robots: { index: false, follow: false },
  };
}

export default async function PayEventPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { confirmation?: string | string[] };
}) {
  const eventSlug = params.slug;
  const event = await getEventBySlug(eventSlug);

  if (!event) {
    return (
      <>
        <Navbar />
        <Container className="py-14">
          <Card className="p-8 text-center max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-ink">Evento no encontrado</h1>
            <p className="text-ink-muted mt-2">
              El evento <code>"{eventSlug}"</code> no existe o no está publicado.
            </p>
            <Button href="/eventos" className="mt-6">
              Ver eventos
            </Button>
          </Card>
        </Container>
        <Footer />
      </>
    );
  }

  // 1. Evento gratis → redirect a la página pública del evento (no requiere pago).
  if (!event.priceMXN || event.priceMXN <= 0) {
    redirect(`/eventos/${event.slug}`);
  }

  // 2. Evento en draft/archived → no se puede cobrar. Pedir publicar primero.
  if (event.status !== "published") {
    return (
      <>
        <Navbar />
        <Container className="py-14">
          <Card className="p-8 text-center max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-ink">
              Este evento no se puede pagar todavía
            </h1>
            <p className="text-ink-muted mt-2">
              El evento <strong>{event.title}</strong> está en estado{" "}
              <Badge tone="warning">{event.status === "draft" ? "Borrador" : "Archivado"}</Badge>.
              {" "}Publicá primero desde{" "}
              <a
                href={`/admin/eventos/${event.id}`}
                className="text-brand-700 underline"
              >
                el panel admin
              </a>{" "}
              antes de habilitar el checkout.
            </p>
            <Button href={`/eventos/${event.slug}`} className="mt-6">
              Ver evento
            </Button>
          </Card>
        </Container>
        <Footer />
      </>
    );
  }

  // 3. Si ya tiene access (y NO es por free_rsvp) → no cobrar dos veces.
  const session = await getCurrentStudent();
  if (session) {
    const access = await checkEventAccess(session.userId, event.id);
    if (access.hasAccess && access.source !== "free_rsvp") {
      redirect(`/eventos/${event.slug}?paid=already`);
    }
  }

  // FIX 2026-07-18 (sprint atribución de pagos, David "el link de
  // pago es generico, como se relaciona con el cliente"): si el
  // caller del checkout pasó `?confirmation=xxx` (típicamente el
  // bot al mandar el link de pago después del registro), lo
  // validamos contra event_confirmations y lo pasamos al
  // CheckoutButton. El button lo serializa a
  // `metadata.confirmation_id` en el Checkout Session de Stripe,
  // y el webhook lo lee PRIMERO para atribuir el cargo a esa
  // confirmation. Si el query param es inválido (confirmation no
  // existe o no es de este evento), lo ignoramos y caemos al
  // path genérico (atribución por email, comportamiento legacy).
  const rawConfirmation =
    typeof searchParams?.confirmation === "string"
      ? searchParams.confirmation
      : Array.isArray(searchParams?.confirmation)
        ? searchParams.confirmation[0]
        : null;
  const validatedConfirmationId = await resolveConfirmationParam(
    rawConfirmation,
    event.id
  );
  const confirmedEmail = await getConfirmedEmail(
    rawConfirmation,
    event.id
  );

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
            {/* Columna izquierda: preview del evento (mismo patrón que
                /pagar/[courseSlug] — ayuda al asistente a confirmar
                que está pagando lo correcto antes de ir a Stripe). */}
            <Card className="p-7 self-start">
              <Badge tone="info">Evento</Badge>
              <h1 className="text-2xl font-bold text-ink mt-3">
                {event.title}
              </h1>
              {event.description && (
                <p className="text-ink-soft mt-2 text-sm">{event.description}</p>
              )}
              <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
                {event.location && (
                  <li>
                    <strong>📍 Lugar:</strong> {event.location}
                  </li>
                )}
                <li>
                  <strong>📅 Cuándo:</strong>{" "}
                  {new Date(event.startsAt).toLocaleString("es-MX", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </li>
                {event.format && event.format !== "in_person" && (
                  <li>
                    <strong>💻 Modalidad:</strong>{" "}
                    {event.format === "virtual" ? "Virtual" : "Híbrido (presencial + online)"}
                  </li>
                )}
                {event.streamingAccessNote && (
                  <li>
                    <strong>🎥 Streaming:</strong> {event.streamingAccessNote}
                  </li>
                )}
              </ul>
              <div className="mt-6 pt-5 border-t border-brand-100">
                <p className="text-xs uppercase text-ink-muted font-semibold">
                  Total a pagar
                </p>
                <p className="text-3xl font-bold text-brand-700 mt-1">
                  ${event.priceMXN} {event.currency}
                </p>
                <p className="text-[10px] text-ink-muted mt-1 italic">
                  Pago único. Una vez confirmado, recibís acceso completo al evento.
                </p>
              </div>
            </Card>

            {/* Columna derecha: checkout según provider activo. */}
            <Card className="p-7 self-start">
              <h2 className="text-lg font-bold text-ink mb-1">
                {IS_MOCK ? "Simulador de pago" : "Pago seguro"}
              </h2>
              <p className="text-xs text-ink-muted mb-5">
                {IS_MOCK
                  ? "Estás en modo desarrollo. Elige método y simulación — no se hace ningún cargo real."
                  : "Elige tu método y te llevamos a la página de pago del proveedor."}
              </p>
              {IS_MOCK ? (
                <SimulatorForm
                  eventSlug={event.slug}
                  eventTitle={event.title}
                  amountMxn={event.priceMXN}
                />
              ) : (
                <CheckoutButton
                  eventSlug={event.slug}
                  eventTitle={event.title}
                  amountMxn={event.priceMXN}
                  // FIX 2026-07-18: pasar confirmationId al
                  // checkout para que el webhook atribuya el
                  // cargo a la confirmation correcta.
                  confirmationId={validatedConfirmationId}
                />
              )}
              {validatedConfirmationId && confirmedEmail && (
                <p className="mt-4 text-xs text-ink-muted italic">
                  Vas a pagar por la entrada registrada a{" "}
                  <strong>{confirmedEmail}</strong>. Si necesitás usar otro
                  email, contactanos antes de pagar.
                </p>
              )}
            </Card>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers internos                                                   */
/* ------------------------------------------------------------------ */

/**
 * FIX 2026-07-18 (sprint atribución de pagos): valida que el
 * `?confirmation=xxx` del query param:
 * 1. Tenga formato UUID válido.
 * 2. Exista en `event_confirmations`.
 * 3. Pertenezca al evento que se está pagando.
 *
 * Si todo OK, retorna el confirmationId. Si algo falla, retorna
 * null y caemos al path genérico (atribución por email en el
 * webhook).
 */
async function resolveConfirmationParam(
  raw: string | null,
  eventId: string
): Promise<string | null> {
  if (!raw) return null;
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(raw)) return null;
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("event_confirmations")
      .select("id, event_id")
      .eq("id", raw)
      .maybeSingle();
    if (error || !data) return null;
    if (data.event_id !== eventId) return null;
    return data.id;
  } catch {
    return null;
  }
}

/**
 * FIX 2026-07-18 (sprint atribución de pagos): si el query param
 * `?confirmation=xxx` es válido, retornamos el email de la
 * confirmation para mostrarlo como hint en la página. Si el
 * cliente va a Stripe y usa otro email, el cargo se atribuye
 * via `metadata.confirmation_id` (no por email del cargo).
 */
async function getConfirmedEmail(
  raw: string | null,
  eventId: string
): Promise<string | null> {
  if (!raw) return null;
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(raw)) return null;
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("event_confirmations")
      .select("email")
      .eq("id", raw)
      .eq("event_id", eventId)
      .maybeSingle();
    return data?.email ?? null;
  } catch {
    return null;
  }
}
