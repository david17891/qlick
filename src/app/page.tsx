import Link from "next/link";
import Image from "next/image";
import { Navbar, Footer } from "@/components/layout";
import { Container, Button, Card, Badge, SectionHeading } from "@/components/ui";
import { CourseCard } from "@/components/course";
import { Logo, Isotipo } from "@/components/brand";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";
import { Reveal } from "@/components/feedback/Reveal";
import { LucideIcon } from "@/components/ui/Icon";
import {
  Award,
  Infinity as InfinityIcon,
  MapPin,
  MessageCircle,
  Target,
  Video
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { getPublishedCourses } from "@/lib/lms/courses-server";
import { getCourseStats } from "@/lib/data/courses";
import { testimonials } from "@/lib/data/content";
import { getInstructorById } from "@/lib/data/instructors";
import type { Course as LmsCourse } from "@/types/lms";
import type { FilterableCourse } from "@/app/cursos/CursosClient";

/**
 * Adapta un `Course` del LMS al shape legacy que necesita `CourseCard`.
 * Mismo adapter que `src/app/cursos/page.tsx`. Centralizado acá para
 * mantener una sola fuente de verdad de precios (LMS / Supabase).
 *
 * Decisión 2026-06-29 (sesión nocturna): NORMALIZACIÓN de precios.
 * Antes, home usaba mock data (`src/lib/data/courses.ts`) con
 * `priceMXN: 1499, originalPriceMXN: 2499` mientras que `/cursos` y
 * `/cursos/[slug]` usan LMS DB. Eso causaba inconsistencia visible:
 * home mostraba "$1,499 $2,499 -40%" pero el detail mostraba "$499".
 * Ahora home también usa LMS. Los precios definitivos aún no están
 * fijados por David — esta normalización solo unifica el origen de
 * datos, no cambia el valor (que viene del seed actual en DB).
 */
function lmsToLegacyAdapter(c: LmsCourse): FilterableCourse {
  const levelMap: Record<string, "basico" | "intermedio" | "avanzado"> = {
    beginner: "basico",
    intermediate: "intermedio",
    advanced: "avanzado",
  };
  const statusMap: Record<string, "gratis" | "pago" | "proximamente"> = {
    free: "gratis",
    paid: "pago",
    freemium: "gratis",
  };
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    shortDescription: c.description ?? c.subtitle ?? "",
    longDescription: c.description ?? "",
    thumbnailUrl: c.coverImageUrl ?? "",
    estimatedHours: c.durationMinutes ? c.durationMinutes / 60 : 0,
    level: levelMap[c.level] ?? "basico",
    instructorId: c.instructorName ?? "",
    category: c.category,
    tags: [],
    studentsCount: 0,
    rating: 0,
    priceMXN: c.priceMXN ?? 0,
    originalPriceMXN: null,
    isFeatured: c.isFeatured,
    status: statusMap[c.accessType] ?? "gratis",
    accessType: c.accessType,
  } as unknown as FilterableCourse;
}

export default async function HomePage() {
  // Decisión 2026-06-29: usar LMS como única fuente de precios (antes
  // era mock data con $1,499/$2,499). Centraliza el origen y evita
  // inconsistencias visuales entre home y /cursos.
  const lmsCourses = await getPublishedCourses();
  const featured: FilterableCourse[] = lmsCourses
    .filter((c) => c.isFeatured)
    .slice(0, 3)
    .map((lmsCourse) => {
      const adapted = lmsToLegacyAdapter(lmsCourse);
      const stats = getCourseStats(adapted.id);
      return { ...adapted, totalModules: stats.totalModules, totalLessons: stats.totalLessons } as FilterableCourse;
    });
  const allCourses = lmsCourses;

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
                Plataforma de cursos de marketing · México
              </Badge>
              <h1 className="display-1 text-ink">
                Marketing que <span className="text-brand-gradient">se traduce</span> en ventas.
              </h1>
              <p className="mt-5 text-lg text-ink-soft max-w-xl">
                Aprende publicidad, contenido, ventas y automatización con cursos
                prácticos diseñados para hacer crecer tu negocio. Sin teoría de
                relleno: aplicas desde la primera lección.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button href="/cursos" size="lg">
                  Ver cursos →
                </Button>
                <Button href="/login" variant="outline" size="lg">
                  Ya soy alumno
                </Button>
              </div>

              <div className="mt-10 flex items-center gap-6 text-sm text-ink-muted">
                <div className="flex items-center gap-2">
                  <span className="text-brand-600">★ ★ ★ ★ ★</span>
                  <span>+2,600 alumnos</span>
                </div>
                <div className="h-4 w-px bg-brand-200" />
                <span>Cursos en español</span>
                <div className="h-4 w-px bg-brand-200" />
                <span>Acceso de por vida</span>
              </div>
            </div>

            {/* Card visual del producto */}
            <div className="relative animate-fade-up [animation-delay:120ms]">
              <div className="absolute -inset-4 bg-brand-gradient opacity-20 blur-3xl rounded-[3rem]" />
              <Card className="relative p-5 rotate-1 hover:rotate-0 transition-transform duration-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Logo lockup="icon" height={28} />
                    <span className="font-bold text-ink">Aula Qlick</span>
                  </div>
                  <Badge tone="success">En vivo</Badge>
                </div>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-ink">
                  <Image
                    src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80"
                    alt="Vista previa del aula"
                    fill
                    sizes="(max-width: 1024px) 90vw, 500px"
                    className="object-cover opacity-80"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="h-16 w-16 rounded-full bg-white/90 flex items-center justify-center text-brand-600 text-2xl shadow-lg">
                      ▶
                    </span>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs text-brand-600 font-bold uppercase">Continúa viendo</p>
                  <h3 className="font-bold text-ink">Meta Ads · Escalamiento vertical</h3>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-brand-100">
                    <div className="h-full w-2/3 rounded-full bg-brand-500" />
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">Lección 7 de 9 · 44% completado</p>
                </div>
              </Card>

              <div className="absolute -bottom-5 -left-5 hidden sm:block">
                <Card className="px-4 py-3 flex items-center gap-3 shadow-glow">
                  <span className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                    ★
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink">Certificado</p>
                    <p className="text-xs text-ink-muted">al completar</p>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* --------------------------- LOGOS / PROOF --------------------------- */}
      <section className="border-y border-brand-100 bg-white">
        <Container size="wide" className="py-8">
          <p className="text-center text-xs uppercase tracking-widest text-ink-muted mb-6">
            Herramientas que aprenderás a dominar
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-ink-muted font-bold opacity-70">
            {["Meta Ads", "Google Ads", "WhatsApp Business", "HubSpot", "Canva", "CapCut", "GA4", "Looker Studio"].map(
              (t) => (
                <span key={t} className="text-sm sm:text-base">
                  {t}
                </span>
              )
            )}
          </div>
        </Container>
      </section>

      {/* --------------------------- BENEFICIOS --------------------------- */}
      <section className="py-20">
        <Container size="wide">
          <SectionHeading
            center
            eyebrow="Por qué Qlick"
            title="Aprendizaje que mueve el negocio, no solo el CV"
            description="Cada curso está pensado para que apliques el mismo día. Menos teoría, más resultados."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {(
              [
                {
                  icon: Target,
                  title: "Enfoque en resultados",
                  body: "Cada módulo termina con algo aplicable: una campaña, un bot, un calendario. No con un examen teórico."
                },
                {
                  icon: MapPin,
                  title: "Hecho para México",
                  body: "Ejemplos con mercado mexicano, métodos de pago locales (tarjeta, SPEI, OXXO) y casos reales."
                },
                {
                  icon: InfinityIcon,
                  title: "A tu ritmo, para siempre",
                  body: "Acceso de por vida. Mira las lecciones cuando quieras y repite las que necesites."
                },
                {
                  icon: Video,
                  title: "Calidad de producción",
                  body: "Video HD, recursos descargables y plantillas listas para usar en tu negocio."
                },
                {
                  icon: Award,
                  title: "Certificados verificables",
                  body: "Al completar obtienes un certificado con código único que puedes compartir en LinkedIn."
                },
                {
                  icon: MessageCircle,
                  title: "Soporte humano",
                  body: "Dudas reales reciben respuestas reales. No te dejamos solo con los videos."
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

      {/* --------------------------- CURSOS DESTACADOS --------------------------- */}
      <section className="py-20 bg-brand-50/50 border-y border-brand-100">
        <Container size="wide">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <SectionHeading
              eyebrow="Catálogo"
              title="Cursos destacados"
              description="Empieza por el que más se alinea con tu objetivo."
            />
            <Button href="/cursos" variant="outline">
              Ver todos los cursos
            </Button>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((c, i) => (
              <Reveal key={c.id} delay={i * 100}>
                <CourseCard course={c} />
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* --------------------------- COMO FUNCIONA --------------------------- */}
      <section className="py-20">
        <Container size="wide">
          <SectionHeading
            center
            eyebrow="Cómo funciona"
            title="Tres pasos para empezar a crecer"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Elige tu curso",
                body: "Explora el catálogo y empieza por el nivel correcto para ti, desde fundamentos hasta performance avanzado."
              },
              {
                step: "02",
                title: "Aprende aplicando",
                body: "Mira las lecciones, descarga las plantillas y aplica cada ejercicio directamente a tu negocio."
              },
              {
                step: "03",
                title: "Mide y crece",
                body: "Trackea tus resultados, itera y certifícate. Vuelve al contenido cuando quieras refrescar."
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
            eyebrow="Resultados reales"
            title="Lo que dicen nuestros alumnos"
            className="[&_h2]:text-white [&_p]:text-white/70"
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {testimonials.map((t, i) => (
              <Reveal key={t.id} delay={i * 100}>
                <div className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur h-full">
                  <div className="text-amber-400 text-sm mb-3">
                    {"★".repeat(t.rating)}
                    <span className="text-white/30">{"★".repeat(5 - t.rating)}</span>
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">"{t.quote}"</p>
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-white/60">
                      {t.role}
                      {t.company ? ` · ${t.company}` : ""}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* --------------------------- INSTRUCTORES --------------------------- */}
      <section className="py-20">
        <Container size="wide">
          <SectionHeading
            center
            eyebrow="Aprende de quienes hacen"
            title="Instructores que practican lo que enseñan"
            description="No son teóricos: son operadores que llevan años generando resultados."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {["inst_sofia", "inst_andres", "inst_luisa", "inst_emilio"].map((id, i) => {
              const ins = getInstructorById(id);
              if (!ins) return null;
              return (
                <Reveal key={id} delay={i * 100}>
                  <Card className="p-6 text-center h-full">
                    <div className="mx-auto h-16 w-16 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold text-xl">
                      {ins.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <h3 className="mt-4 font-bold text-ink">{ins.name}</h3>
                    <p className="text-xs text-brand-600 font-semibold mt-1">{ins.title}</p>
                    <p className="mt-3 text-sm text-ink-muted line-clamp-3">{ins.bio}</p>
                  </Card>
                </Reveal>
              );
            })}
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
                Inscríbete hoy y empieza a aplicar marketing que de verdad mueve
                tus números. Primer curso gratis.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button href="/cursos" variant="accent" size="lg">
                  Empezar ahora
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
