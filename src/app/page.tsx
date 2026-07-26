import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { Button, Container, LucideIcon } from "@/components/ui";
import { ServiceCard } from "@/components/services/ServiceCard";
import { Isotipo, Logo } from "@/components/brand";
import { Reveal } from "@/components/feedback/Reveal";
import {
  ArrowUpRight,
  Award,
  Calendar,
  CheckCircle2,
  Compass,
  Infinity as InfinityIcon,
  MapPin,
  MessageCircle,
  Sparkles,
  Target
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { getActiveServices } from "@/lib/services";
import { listPublishedEvents } from "@/lib/events/events-server";
import { cleanEventTitle, formatMXN } from "@/lib/utils";
import { EVENT_TIMEZONE } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: EVENT_TIMEZONE
  });
}

const benefits = [
  {
    index: "01",
    icon: Compass,
    title: "Diagnóstico antes de ejecutar",
    body: "Empezamos por entender tu negocio. Si algo no te conviene, te lo decimos antes de venderte una solución."
  },
  {
    index: "02",
    icon: Target,
    title: "Entregables que sí usas",
    body: "Sitios publicados, campañas listas y reportes accionables. Lo que pagas se convierte en algo que puedes operar."
  },
  {
    index: "03",
    icon: MapPin,
    title: "Pensado para México",
    body: "Precios en MXN, contexto local y decisiones aterrizadas al mercado donde realmente vendes."
  },
  {
    index: "04",
    icon: InfinityIcon,
    title: "Sin ataduras innecesarias",
    body: "Pago único, alcance claro y propiedad sobre tu trabajo. Sin renovaciones automáticas ni letras pequeñas."
  },
  {
    index: "05",
    icon: MessageCircle,
    title: "Trato directo",
    body: "Hablas con la persona que entiende el proyecto. Menos intermediarios, más velocidad para decidir."
  },
  {
    index: "06",
    icon: Award,
    title: "Una siguiente acción clara",
    body: "Cada servicio termina con una recomendación concreta para que sepas qué mover después."
  }
] satisfies Array<{
  index: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
}>;

const processSteps = [
  {
    step: "01",
    title: "Elige el punto de partida",
    body: "Selecciona el servicio que mejor encaja con lo que tu negocio necesita hoy."
  },
  {
    step: "02",
    title: "Aterrizamos el alcance",
    body: "Revisamos tu contexto, confirmamos prioridades y dejamos claro qué vas a recibir."
  },
  {
    step: "03",
    title: "Lo ponemos a trabajar",
    body: "Entregamos una solución lista para usar, con los siguientes pasos sobre la mesa."
  }
];

const workingStack = [
  "Meta Ads",
  "Google Ads",
  "Google Business",
  "WhatsApp Business",
  "Canva",
  "CapCut",
  "GA4"
];

/**
 * Portada pública de Qlick.
 *
 * La home prioriza la oferta real de servicios y eventos: dirección visual,
 * entregables concretos y una ruta de contacto simple. Los datos del catálogo
 * siguen siendo dinámicos para que el contenido visible siempre refleje la DB.
 */
export default async function HomePage() {
  const services = await getActiveServices();
  const featuredServices = services.slice(0, 3);

  const allEvents = await listPublishedEvents();
  const now = new Date();
  const upcomingEvents = allEvents
    .filter((event) => new Date(event.startsAt) >= now)
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
    .slice(0, 3);

  const stats = {
    services: services.length,
    packages: services.reduce((total, service) => total + service.variants.length, 0),
    events: upcomingEvents.length
  };

  const heroService = featuredServices[0];
  const heroPrice = heroService?.variants.length
    ? Math.min(...heroService.variants.map((variant) => variant.priceMXN))
    : null;

  return (
    <div className="home-page">
      <Navbar />

      <main>
        <section className="home-hero relative overflow-hidden">
          <div className="home-hero-grid" aria-hidden="true" />
          <div className="home-hero-orb home-hero-orb--one" aria-hidden="true" />
          <div className="home-hero-orb home-hero-orb--two" aria-hidden="true" />

          <Container size="wide" className="relative z-10 py-16 sm:py-20 lg:py-24">
            <div className="grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
              <div className="max-w-2xl animate-fade-up">
                <div className="home-kicker">
                  <span className="home-kicker-dot" aria-hidden="true" />
                  Marketing integral para negocios que quieren avanzar
                </div>

                <h1 className="home-hero-title mt-7">
                  Marketing que
                  <span className="block">
                    <em>se traduce</em> en ventas.
                  </span>
                </h1>

                <p className="mt-7 max-w-xl text-lg leading-8 text-white/70 sm:text-xl">
                  Diseño web, campañas de Meta Ads y auditorías de negocio con
                  una idea sencilla: que cada peso invertido deje algo útil para
                  tu negocio.
                </p>

                <div className="mt-9 flex flex-wrap gap-3">
                  <Link href="/servicios" className="home-button home-button--light">
                    Explorar servicios
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link href="/contacto" className="home-button home-button--ghost">
                    Cuéntame de mi negocio
                  </Link>
                </div>

                <div className="home-hero-stats mt-12" aria-label="Resumen de la oferta">
                  <div>
                    <strong>{String(stats.services).padStart(2, "0")}</strong>
                    <span>servicios activos</span>
                  </div>
                  <div>
                    <strong>{String(stats.packages).padStart(2, "0")}</strong>
                    <span>paquetes claros</span>
                  </div>
                  <div>
                    <strong>01</strong>
                    <span>equipo directo</span>
                  </div>
                </div>
              </div>

              <div className="home-hero-stage animate-fade-up [animation-delay:120ms]">
                {heroService ? (
                  <div className="home-hero-card">
                    <div className="home-hero-card-top">
                      <div className="flex items-center gap-2">
                        <div className="home-mini-mark">
                          <Logo lockup="icon" height={24} priority />
                        </div>
                        <span className="text-sm font-bold tracking-tight">Qlick</span>
                      </div>
                    </div>

                    <div className="home-feature-rule" aria-hidden="true" />
                    <h2 className="mt-8 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                      {heroService.displayName}
                    </h2>
                    <p className="mt-3 max-w-lg text-sm leading-6 text-ink-muted">
                      {heroService.shortDescription ??
                        "Una solución clara para que tu presencia digital empiece a trabajar."}
                    </p>

                    <ul className="home-feature-points mt-7">
                      {heroService.bullets.slice(0, 3).map((bullet) => (
                        <li key={bullet}>
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 flex flex-wrap items-end justify-between gap-5 border-t border-black/10 pt-6">
                      <div>
                        <span className="home-price-label">Desde</span>
                        <span className="font-display text-3xl font-bold tracking-tight text-ink">
                          {heroPrice === null ? "A cotizar" : formatMXN(heroPrice)}
                        </span>
                        {heroPrice !== null && (
                          <span className="ml-2 text-xs text-ink-muted">MXN</span>
                        )}
                      </div>
                      <Link
                        href={`/servicios/${heroService.slug}`}
                        className="home-card-link"
                      >
                        Ver paquetes <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="home-hero-card home-hero-card--empty">
                    <Sparkles className="h-8 w-8 text-brand-500" aria-hidden="true" />
                    <h2 className="mt-5 font-display text-3xl font-bold text-ink">
                      Estamos preparando algo especial.
                    </h2>
                    <p className="mt-3 text-ink-muted">
                      Escríbenos y revisamos contigo el mejor punto de partida.
                    </p>
                    <Link href="/contacto" className="home-card-link mt-8">
                      Hablemos <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                )}

              </div>
            </div>
          </Container>
        </section>

        <section className="home-toolstrip">
          <Container size="wide" className="py-8 sm:py-10">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="home-eyebrow">El ecosistema</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Trabajamos con las herramientas donde ya están tus clientes.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {workingStack.map((tool) => (
                  <span key={tool} className="home-tool-chip">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </Container>
        </section>

        <section className="home-approach py-20 sm:py-28">
          <Container size="wide">
            <div className="grid gap-14 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
              <div className="lg:pt-4">
                <p className="home-eyebrow">La diferencia</p>
                <h2 className="home-section-title mt-4">
                  La claridad también es una ventaja competitiva.
                </h2>
                <p className="mt-5 max-w-md text-lg leading-8 text-ink-muted">
                  Qlick combina estrategia y ejecución para que tu marketing no
                  dependa de adivinar. Menos humo, más decisiones que puedas
                  explicar y usar.
                </p>
                <Link href="/acerca" className="home-inline-link mt-8">
                  Conoce nuestra filosofía
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <div className="home-approach-mark mt-16 hidden sm:block" aria-hidden="true">
                  <Isotipo size={76} className="opacity-20" />
                  <span>Q / marketing integral</span>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {benefits.map((benefit, index) => (
                  <Reveal key={benefit.index} delay={index * 70}>
                    <article className="home-benefit-card h-full">
                      <div className="flex items-start justify-between gap-4">
                        <span className="home-benefit-icon">
                          <LucideIcon icon={benefit.icon} size="md" tone="inherit" />
                        </span>
                        <span className="home-benefit-index">{benefit.index}</span>
                      </div>
                      <h3 className="mt-8 font-display text-xl font-bold tracking-tight text-ink">
                        {benefit.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-ink-muted">{benefit.body}</p>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </Container>
        </section>

        <section id="servicios" className="home-services border-y border-brand-100/80 py-20 sm:py-28">
          <Container size="wide">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="home-eyebrow">Catálogo Qlick</p>
                <h2 className="home-section-title mt-4">Empieza por el cuello de botella.</h2>
                <p className="mt-4 text-lg leading-8 text-ink-muted">
                  Servicios con precio claro, alcance concreto y un entregable
                  que puedes poner a trabajar.
                </p>
              </div>
              <Button href="/servicios" variant="outline" className="shrink-0">
                Ver todos los servicios
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {featuredServices.length > 0 ? (
              <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {featuredServices.map((service, index) => (
                  <Reveal key={service.id} delay={index * 90}>
                    <ServiceCard service={service} />
                  </Reveal>
                ))}
              </div>
            ) : (
              <div className="mt-12 rounded-3xl border border-dashed border-brand-200 bg-white/70 px-6 py-14 text-center">
                <p className="text-ink-muted">
                  Estamos terminando de publicar el catálogo. Mientras tanto,
                  puedes contarnos qué necesitas.
                </p>
                <Button href="/contacto" className="mt-6">
                  Hablemos
                </Button>
              </div>
            )}
          </Container>
        </section>

        {upcomingEvents.length > 0 && (
          <section className="home-events py-20 sm:py-24">
            <Container size="wide">
              <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                <div className="max-w-2xl">
                  <p className="home-eyebrow">Agenda abierta</p>
                  <h2 className="home-section-title mt-4">Aprender también puede ser en vivo.</h2>
                  <p className="mt-4 text-lg leading-8 text-ink-muted">
                    Talleres y masterclass para poner ideas en movimiento con
                    otras personas que también están construyendo.
                  </p>
                </div>
                <Button href="/eventos" variant="outline" className="shrink-0">
                  Ver eventos
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map((event, index) => (
                  <Reveal key={event.id} delay={index * 90}>
                    <Link href={`/eventos/${event.slug}`} className="group block h-full">
                      <article className="home-event-card h-full">
                        <div className="home-event-card-top">
                          <span className="home-event-status"><i aria-hidden="true" /> Próximo</span>
                          <h3>{cleanEventTitle(event.title)}</h3>
                        </div>
                        <div className="flex flex-1 flex-col justify-between gap-6 p-6">
                          {event.description && (
                            <p className="line-clamp-3 text-sm leading-6 text-ink-muted">
                              {event.description.replace(/\*\*/g, "")}
                            </p>
                          )}
                          <div className="space-y-2 border-t border-brand-100 pt-4 text-sm text-ink-soft">
                            <p className="flex items-start gap-2">
                              <LucideIcon icon={Calendar} size="sm" tone="muted" />
                              <span>{formatEventDate(event.startsAt)}</span>
                            </p>
                            {event.location && (
                              <p className="flex items-start gap-2 text-ink-muted">
                                <LucideIcon icon={MapPin} size="sm" tone="muted" />
                                <span>{event.location}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-display text-xl font-bold text-ink">
                              {event.priceMXN == null || event.priceMXN <= 0
                                ? "Gratis"
                                : `${formatMXN(event.priceMXN)} MXN`}
                            </span>
                            <span className="home-inline-link text-sm">
                              Ver evento <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                            </span>
                          </div>
                        </div>
                      </article>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </Container>
          </section>
        )}

        <section className="home-process py-20 sm:py-28">
          <Container size="wide">
            <div className="home-process-panel">
              <div className="home-process-intro">
                <p className="home-eyebrow home-eyebrow--light">La experiencia</p>
                <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  Del primer click al entregable.
                </h2>
                <p className="mt-5 max-w-md text-lg leading-8 text-white/65">
                  Una ruta breve, humana y sin pasos escondidos para convertir
                  una idea suelta en algo que tu negocio puede usar.
                </p>
                <div className="home-process-stamp mt-12">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>Qlick / 2026</span>
                </div>
              </div>

              <ol className="home-process-list">
                {processSteps.map((item) => (
                  <li key={item.step} className="home-process-step">
                    <span className="home-process-number">{item.step}</span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Container>
        </section>

        <section className="home-standard py-20 sm:py-28">
          <Container size="wide">
            <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:gap-20">
              <div>
                <p className="home-eyebrow home-eyebrow--light">Nuestro estándar</p>
                <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  Que cada click deje algo claro.
                </h2>
              </div>
              <p className="max-w-2xl text-xl leading-9 text-white/65">
                No necesitas otra presentación que suene bien. Necesitas una
                presencia que puedas mostrar con orgullo, una campaña que
                entiendas y un plan que te diga qué hacer primero.
              </p>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {[
                {
                  number: "01",
                  title: "Se entiende",
                  body: "Tu propuesta deja de perderse entre palabras bonitas y empieza a hablarle a la persona correcta."
                },
                {
                  number: "02",
                  title: "Se puede usar",
                  body: "Recibes una solución lista para operar, compartir y mejorar con el tiempo."
                },
                {
                  number: "03",
                  title: "Se puede medir",
                  body: "Sabes qué se entregó, qué sigue y qué decisión conviene tomar después."
                }
              ].map((item, index) => (
                <Reveal key={item.number} delay={index * 90}>
                  <article className="home-standard-card h-full">
                    <span>{item.number}</span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>

        <section className="home-final py-20 sm:py-28">
          <Container>
            <div className="home-final-panel">
              <div className="home-final-orb" aria-hidden="true" />
              <div className="relative z-10 mx-auto max-w-3xl text-center">
                <Isotipo size={54} className="mx-auto mb-7" />
                <p className="home-eyebrow home-eyebrow--light">Tu siguiente movimiento</p>
                <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
                  Da el siguiente click a tu negocio.
                </h2>
                <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-white/75">
                  Cuéntanos qué quieres destrabar y te ayudamos a encontrar el
                  servicio correcto para este momento.
                </p>
                <div className="mt-9 flex flex-wrap justify-center gap-3">
                  <Link href="/servicios" className="home-button home-button--accent">
                    Ver servicios
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link href="/contacto" className="home-button home-button--dark-ghost">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Hablemos
                  </Link>
                </div>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-white/45">
                  Respuesta directa · México · sin mensualidades
                </p>
              </div>
            </div>
          </Container>
        </section>
      </main>

      <Footer />
    </div>
  );
}
