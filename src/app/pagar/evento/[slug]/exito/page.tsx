/**
 * Página de éxito tras checkout de un evento — `/pagar/[eventSlug]/exito`.
 *
 * Espejo de `/pagar/[courseSlug]/exito/page.tsx`, pero:
 *   - Resuelve evento (no curso) con `getEventBySlug`.
 *   - Verifica `checkEventAccess` (no `checkCourseAccess`).
 *   - Redirige al evento público `/eventos/[slug]` (no al dashboard).
 *   - El webhook ya hace `grantEventAccess` con `source='event_purchase'`.
 *
 * Misma estructura de feedback:
 *   - approved + access activo → "listo, ya tenés acceso" + CTA al evento.
 *   - pending (OXXO/SPEI) → instrucciones + CTA de reenvío de link.
 *   - rejected/expired → "pago no completado" + CTA para reintentar.
 *   - guest sin sesión → mensaje neutro + CTA para magic link.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Button } from "@/components/ui";
import { getCurrentStudent } from "@/lib/auth/session";
import { getEventBySlug } from "@/lib/events/events-server";
import { checkEventAccess } from "@/lib/lms/event-entitlements";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentStatus } from "@/types";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  return {
    title: `Pago recibido · Qlick`,
    description: `Confirmación de pago para el evento ${params.slug}.`,
    robots: { index: false, follow: false },
  };
}

interface ExitoPageProps {
  params: { slug: string };
  searchParams: { session_id?: string; status?: string };
}

export default async function ExitoEventoPage({
  params,
  searchParams,
}: ExitoPageProps) {
  const eventSlug = params.slug;
  const sessionId =
    typeof searchParams.session_id === "string" ? searchParams.session_id : null;
  const pendingFlag = searchParams.status === "pending";

  // 1. Resolver el evento.
  const event = await getEventBySlug(eventSlug);
  if (!event) {
    // Si el evento no existe, redirect al catálogo de eventos (público).
    redirect("/eventos");
  }

  // 2. Auth opcional (guest checkout desde 2026-07-08).
  const session = await getCurrentStudent();

  // 3. Consultar estado del pago en el provider (best-effort).
  let paymentStatus: PaymentStatus | "unknown" = "unknown";
  let customerEmail: string | null = null;
  if (sessionId) {
    try {
      const provider = getPaymentProvider();
      const result = await provider.getStatus(sessionId);
      paymentStatus = result.status;
      customerEmail = result.customerEmail ?? null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[exito-evento] getStatus falló (continuamos)", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. Verificar si el access ya está activo (solo si hay sesión).
  //    Para eventos, source=free_rsvp NO cuenta como pago (es el flujo
  //    free). Solo sources de pago cuentan como "ya pagaste".
  const accessResult = session
    ? await checkEventAccess(session.userId, event.id)
    : null;
  const accessActive = Boolean(
    accessResult?.hasAccess && accessResult.source !== "free_rsvp",
  );

  // 5. Render según estado.
  const isPending = pendingFlag || paymentStatus === "pending";

  let title: string;
  let body: string;
  let ctaLabel: string;
  let ctaHref: string;
  let tone: "success" | "warning" = "success";

  if (session && accessActive) {
    title = "¡Listo! Ya tienes tu entrada";
    body = `Tu pago fue confirmado. El evento "${event.title}" ya está disponible en tu cuenta. Te enviamos los detalles por email.`;
    ctaLabel = "Ver el evento";
    ctaHref = `/eventos/${event.slug}?paid=ok`;
  } else if (isPending) {
    title = "Pago pendiente de confirmación";
    body =
      "Si pagaste con OXXO o SPEI, el voucher / transferencia está siendo procesado. " +
      "Te avisaremos por email cuando se confirme. " +
      (session
        ? "También puedes chequear tu cuenta más tarde."
        : "Te enviamos un link al email que usaste en el checkout para que entres cuando esté confirmado.");
    ctaLabel = session ? "Ver el evento" : "Esperar confirmación";
    ctaHref = session
      ? `/eventos/${event.slug}`
      : `/pagar/${eventSlug}/exito?session_id=${sessionId}`;
    tone = "warning";
  } else if (paymentStatus === "rejected" || paymentStatus === "expired") {
    title = "El pago no se completó";
    body =
      "El proveedor rechazó o expiró tu intento de pago. Puedes intentar de nuevo " +
      "con otro método o contactarnos si necesitas ayuda.";
    ctaLabel = "Volver a intentar";
    ctaHref = `/pagar/${eventSlug}`;
    tone = "warning";
  } else if (!session) {
    title = "Recibimos tu pago";
    body = customerEmail
      ? `Estamos procesando tu pago. En unos segundos deberías recibir un email en ${customerEmail} con un link para acceder al evento. Si después de 1 minuto no aparece, contactános.`
      : "Estamos procesando tu pago. En unos segundos deberías recibir un email con un link para acceder al evento. Si después de 1 minuto no aparece, contactános.";
    ctaLabel = "Volver al evento";
    ctaHref = `/eventos/${event.slug}`;
    tone = "warning";
  } else {
    // Sesión pero access todavía no activo — webhook en camino.
    title = "Recibimos tu pago";
    body =
      "Estamos procesando tu pago. En unos segundos deberías ver el evento " +
      "disponible en tu cuenta. Si después de 1 minuto no aparece, contactános.";
    ctaLabel = "Ver el evento";
    ctaHref = `/eventos/${event.slug}?paid=pending`;
    tone = "warning";
  }

  const toneClasses =
    tone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : "border-amber-300 bg-amber-50 text-amber-900";

  return (
    <>
      <Navbar />
      <section className="bg-brand-50/40 min-h-[calc(100vh-4rem)]">
        <Container className="py-14">
          <div className="max-w-xl mx-auto">
            <Card className="p-8">
              <div className={`rounded-lg border p-4 ${toneClasses}`}>
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="mt-2 text-sm whitespace-pre-line">{body}</p>
              </div>

              {sessionId && (
                <p className="mt-4 text-xs text-ink-muted">
                  ID de sesión: <code className="font-mono">{sessionId}</code>
                </p>
              )}

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Button href={ctaHref} className="flex-1 text-center">
                  {ctaLabel}
                </Button>
                <Button
                  href="/eventos"
                  variant="ghost"
                  className="flex-1 text-center"
                >
                  Ver más eventos
                </Button>
              </div>
            </Card>
          </div>
        </Container>
      </section>
      <Footer />
    </>
  );
}
