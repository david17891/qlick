import Link from "next/link";
import Image from "next/image";
import { Navbar, Footer } from "@/components/layout";
import { Container, Button, Card, Badge, SectionHeading } from "@/components/ui";
import { ServiceCard } from "@/components/services/ServiceCard";
import { Logo, Isotipo } from "@/components/brand";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";
import { Reveal } from "@/components/feedback/Reveal";
import { LucideIcon } from "@/components/ui/Icon";
import {
  Award,
  Calendar,
  CheckCircle2,
  Compass,
  Infinity as InfinityIcon,
  MapPin,
  MessageCircle,
  Target,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { getActiveServices } from "@/lib/services";
import { listPublishedEvents } from "@/lib/events/events-server";
import { formatMXN } from "@/lib/utils";

/**
 * Home pública de Qlick.
 *
 * v3 (2026-07-21 — David "pequeño problema de realidad"):
 * La home anterior asumía que Qlick era una plataforma LMS (cursos +
 * instructores + "Aula Qlick" + "+2,600 alumnos"). Refactor completo
 * para reflejar lo que REALMENTE ofrecemos hoy: servicios + eventos.
 *
 * Cambios clave:
 * - Hero apunta a /servicios y /eventos (no /cursos).
 * - Stats reemplazados: servicios activos, eventos publicados (no "+2,600 alumnos").
 * - Sección "Cursos destacados" → "Servicios destacados" (3 servicios más populares).
 * - Sección "Instructores" eliminada por completo (no tenemos profesores).
 * - "Lo que dicen nuestros alumnos" → testimonios de clientes (mock, sin ligas a cursos).
 * - "Cómo funciona" ajustado al flujo de servicios: eliges → te contactamos → entregamos.
 * - CTA final apunta a /servicios, no /cursos.
 *
 * Los cursos siguen existiendo en /cursos pero como landing "Próximamente"
 * (decisión confirmada por David en esta misma sesión).
 */
export default async function HomePage() {
  // Servicios activos (catálogo público, FASE 8D).
  const services = await getActiveServices();
  // Top 3 servicios por display_order (los más relevantes para la home).
  const featuredServices = services.slice(0, 3);

  // Próximos eventos: tomamos los publicados y filtramos los que ya pasaron.
  const allEvents = await listPublishedEvents();
  const now = new Date();
  const upcomingEvents = allEvents
    .filter((e) => new Date(e.startsAt) >= now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 3);

  // Stats reales (no fake).
  const stats = {
    services: services.length,
    events: upcomingEvents.length,
    packages: services.reduce((acc, s) => acc + s.variants.length, 0),
  };

  return (
    <>
      <Navbar />

      {/* ----------------------------- HERO ----------------------------- */}
      <section className="relative overflow-hidden bg-hero-mesh">
        <div className="absolute inset-0 -z-10 opacity-50" />
        <Container size="wide" className="pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-up">
              <Badge tone="brand" className="mb-5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-accent inline-block mr-1" />
                Servicios de marketing para tu negocio · México
              </Badge>
              <h1 className="display-1 text-ink">
                Marketing que <span className="text-brand-gradient">se traduce</span> en ventas.
              </h1>
              <p className="mt-5 text-lg text-ink-soft max-w-xl">
                Diseño web, campañas de Meta Ads y auditorías de negocio.
                Trabajamos contigo directo: sin enredos, sin subcontratos, sin
                costos sorpresas. Pagas por el resultado.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button href="/servicios" size="lg">
                  Ver servicios →
                </Button>
                <Button href="/eventos" variant="outline" size="lg">
                  Próximos eventos
                </Button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-500" />
                  <span>{stats.services} servicios activos</span>
                </div>
                <div className="h-4 w-px bg-brand-200" />
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-500" />
                  <span>{stats.packages} paquetes disponibles</span>
                </div>
                <div className="h-4 w-px bg-brand-200" />
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-500" />
                  <span>Pago único, sin mensualidades</span>
                </div>
              </div>
            </div>

            {/* Card visual: preview de un servicio destacado */}
            <div className="relative animate-fade-up [animation-delay:120ms]">
              <div className="absolute -inset-4 bg-brand-gradient opacity-20 blur-3xl rounded-[3rem]" />
              {featuredServices[0] ? (
                <Card className="relative p-6 rotate-1 hover:rotate-0 transition-transform duration-500">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Logo lockup="icon" height={28} />
                      <span className="font-bold text-ink">Qlick</span>
                    </div>
                    <Badge tone="brand">
                      {featuredServices[0].variants.length} {featuredServices[0].variants.length === 1 ? "paquete" : "paquetes"}
                    </Badge>
                  </div>
                  <h3 className="font-display text-xl font-bold text-ink">
                    {featuredServices[0].displayName}
                  </h3>
                  {featuredServices[0].shortDescription && (
                    <p className="mt-2 text-sm text-ink-soft line-clamp-3">
                      {featuredServices[0].shortDescription}
                    </p>
                  )}
                  <ul className="mt-4 space-y-1.5">
                    {featuredServices[0].bullets.slice(0, 4).map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-brand-500" />
                        <span className="line-clamp-1">{b}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="text-xs uppercase text-ink-muted">Desde</span>
                    <span className="font-display text-2xl font-bold text-ink">
                      {formatMXN(Math.min(...featuredServices[0].variants.map((v) => v.priceMXN)))}
                    </span>
                    <span className="text-xs text-ink-muted">MXN</span>
                  </div>
                  <Link
                    href={`/servicios/${featuredServices[0].slug}`}
                    className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition"
                  >
                    Ver paquetes →
                  </Link>
                </Card>
              ) : null}
            </div>
          </div>
        </Container>
      </section>

      {/* --------------------------- HERRAMIENTAS --------------------------- */}
      <section className="border-y border-brand-100 bg-white">
        <Container size="wide" className="py-8">
          <p className="text-center text-xs uppercase tracking-widest text-ink-muted mb-6">
            Herramientas con las que trabajamos
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-ink-muted font-bold opacity-70">
            {["Meta Ads", "Google Ads", "Google Business", "WhatsApp Business", "Canva", "CapCut", "GA4"].map(
              (t) => (
                <span key={t} className="text-sm sm:text-base">
                  {t}
                </span>
              )
            )}
          </div>
        </Container>
      </section>

      {/* --------------------------- POR QUÉ QLICK --------------------------- */}
      <section className="py-20">
        <Container size="wide">
          <SectionHeading
            center
            eyebrow="Por qué Qlick"
            title="Estrategia aplicada, no plantillas"
            description="Cada servicio se ajusta a tu negocio. No vendemos paquetes genéricos: empezamos con diagnóstico y terminamos con entregables listos para usar."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {(
              [
                {
                  icon: Compass,
                  title: "Diagnóstico antes de ejecutar",
                  body: "Empezamos con una auditoría honesta. Si tu negocio no necesita Meta Ads, te decimos que no — y te recomendamos algo que sí funcione."
                },
                {
                  icon: Target,
                  title: "Entregables, no promises",
                  body: "Recibes sitios publicados, campañas lanzadas, reportes con datos. Lo que pagas es lo que te llevas. Sin markups, sin subcontratos."
                },
                {
                  icon: MapPin,
                  title: "Hecho para México",
                  body: "Pagos en MXN, mercado mexicano, ejemplos locales, soporte en tu horario. No es marketing gringo traducido."
                },
                {
                  icon: InfinityIcon,
                  title: "Pago único, sin ataduras",
                  body: "Sin licencias mensuales, sin renovaciones automáticas. Pagas por el trabajo una vez y es tuyo para siempre."
                },
                {
                  icon: MessageCircle,
                  title: "Hablas directo conmigo",
                  body: "David responde tus mensajes. No es un call center, no es un bot, no es un vendedor. Una sola persona de inicio a fin."
                },
                {
                  icon: Award,
                  title: "Resultados medibles",
                  body: "Cada servicio termina con un entregable concreto: sitio en línea, campaña activa, reporte con plan. Tú decides si continuamos."
                }
              ] satisfies Array<{ icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; body: string }>
            ).map((b, i) => (
              <Reveal key={b.title} delay={i * 80}>
                <Card hover className="p-6 h-full">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <LucideIcon icon={b.icon} size="lg" tone="inherit" strokeWidth={2} />
                  </div>
                  <h3 className="font-bold text-lg text-ink">{b.title}</h3>
                  <p className="mt-2 text-ink-muted">{b.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* --------------------------- SERVICIOS DESTACADOS --------------------------- */}
      <section className="py-20 bg-brand-50/50 border-y border-brand-100">
        <Container size="wide">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <SectionHeading
              eyebrow="Catálogo"
              title="Servicios disponibles"
              description="Elige por dónde empezar. Todos con precio claro, entregable concreto y pago único."
            />
            <Button href="/servicios" variant="outline">
              Ver todos los servicios
            </Button>
          </div>
          {featuredServices.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredServices.map((service, i) => (
                <Reveal key={service.id} delay={i * 100}>
                  <ServiceCard service={service} />
                </Reveal>
              ))}
            </div>
          ) : (
            <p className="text-center text-ink-muted py-8">
              Pronto publicaremos los servicios. Mientras tanto, mándanos WhatsApp.
            </p>
          )}
        </Container>
      </section>

      {/* --------------------------- PRÓXIMOS EVENTOS --------------------------- */}
      {upcomingEvents.length > 0 && (
        <section className="py-20">
          <Container size="wide">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
              <SectionHeading
                eyebrow="Eventos"
                title="Próximos eventos"
                description="Talleres y masterclass presenciales y en línea. Cupo limitado."
              />
              <Button href="/eventos" variant="outline">
                Ver todos los eventos
              </Button>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingEvents.map((event, i) => (
                <Reveal key={event.id} delay={i * 100}>
                  <Link
                    href={`/eventos/${event.slug}`}
                    className="group block h-full"
                  >
                    <Card hover className="h-full overflow-hidden flex flex-col">
                      <div className="relative aspect-video overflow-hidden bg-brand-50">
                        {event.coverImageUrl ? (
                          <Image
                            src={event.coverImageUrl}
                            alt={event.title}
                            fill
                            sizes="(max-width: 768px) 100vw, 33vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : null}
                      </div>
                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-center gap-2 text-xs text-ink-muted mb-2">
                          <Calendar className="h-3.5 w-3.5" />
                          <time dateTime={event.startsAt}>
                            {new Date(event.startsAt).toLocaleDateString("es-MX", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </time>
                        </div>
                        <h3 className="font-bold text-lg text-ink leading-snug group-hover:text-brand-700 transition">
                          {event.title}
                        </h3>
                        {event.description && (
                          <p className="mt-2 text-sm text-ink-muted line-clamp-2">
                            {event.description}
                          </p>
                        )}
                        {event.priceMXN != null && event.priceMXN > 0 && (
                          <div className="mt-auto pt-4">
                            <span className="font-display text-xl font-bold text-ink">
                              {formatMXN(event.priceMXN)}
                            </span>
                            <span className="text-xs text-ink-muted ml-1">MXN</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  </Link>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* --------------------------- CÓMO FUNCIONA --------------------------- */}
      <section className="py-20 bg-brand-50/30 border-y border-brand-100">
        <Container size="wide">
          <SectionHeading
            center
            eyebrow="Cómo funciona"
            title="Tres pasos para arrancar"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Elige tu servicio",
                body: "Revisa el catálogo y escoge el servicio que más se alinea con tu objetivo: diseño web, auditoría, campaña, etc."
              },
              {
                step: "02",
                title: "Te contactamos",
                body: "Te escribimos por WhatsApp en menos de 24 horas. Confirmamos el brief, agendamos (si aplica) y cerramos el alcance."
              },
              {
                step: "03",
                title: "Entregamos",
                body: "Recibes el entregable en el plazo acordado: sitio publicado, campaña activa o reporte con plan. Sin sorpresas."
              }
            ].map((s, i) => (
              <Reveal key={s.step} delay={i * 120}>
                <div className="relative">
                  <span className="text-6xl font-bold text-brand-200 font-display">
                    {s.step}
                  </span>
                  <h3 className="mt-2 font-bold text-xl text-ink">{s.title}</h3>
                  <p className="mt-2 text-ink-muted">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* --------------------------- TESTIMONIOS --------------------------- */}
      <section className="py-20 bg-ink text-white">
        <Container size="wide">
          <SectionHeading
            center
            eyebrow="Lo que dicen"
            title="Comentarios de quienes ya trabajaron con nosotros"
            className="[&_h2]:text-white [&_p]:text-white/70"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Testimonios reusados del data/content.ts (mock por ahora). */}
            {[
              {
                name: "Andrea Solís",
                role: "Dueña de boutique online · Solís Moda",
                quote:
                  "Necesitaba un sitio rápido y con buen diseño. Me lo entregaron en una semana, con todo lo que les pedí. Súper profesionales.",
                rating: 5,
              },
              {
                name: "Ricardo Mendoza",
                role: "Freelance de automatización",
                quote:
                  "La auditoría me destrabó el marketing. Cambié dos cosas y a la semana ya tenía leads nuevos. Vale cada peso.",
                rating: 5,
              },
              {
                name: "Paula Garza",
                role: "Community Manager",
                quote:
                  "Contraté el Kickstart de Meta Ads. David me explicó todo sin tecnicismos y la campaña quedó lista. Ahora la escalo sola.",
                rating: 5,
              },
            ].map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur h-full">
                  <div className="text-amber-400 text-sm mb-3">
                    {"★".repeat(t.rating)}
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">"{t.quote}"</p>
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-white/60">{t.role}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* --------------------------- CTA FINAL --------------------------- */}
      <section className="py-20">
        <Container>
          <div className="relative overflow-hidden rounded-3xl bg-brand-gradient px-8 py-16 sm:px-16 sm:py-20 text-center text-white shadow-glow">
            <div className="absolute inset-0 bg-brand-radial opacity-50" />
            <div className="relative">
              <Isotipo size={48} className="mx-auto mb-6" />
              <h2 className="display-2 text-white">
                Da el siguiente click a tu negocio.
              </h2>
              <p className="mt-4 text-lg text-white/90 max-w-xl mx-auto">
                Mándanos WhatsApp y te contamos sin compromiso qué servicio
                encaja con lo que tu negocio necesita hoy.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button href="/servicios" variant="accent" size="lg">
                  Ver servicios
                </Button>
                <WhatsAppButton
                  intent="sales"
                  size="lg"
                  className="bg-white/10 text-white hover:bg-white/20 !shadow-none border-2 border-white/30"
                />
              </div>
            </div>
          </div>
        </Container>
      </section>

      <Footer />
    </>
  );
}
