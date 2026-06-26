import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Navbar, Footer } from "@/components/layout";
import {
  Container,
  Button,
  Badge,
  Card,
  EmptyState
} from "@/components/ui";
import { LevelBadge, StatusBadge } from "@/components/course";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";
import { CourseCard } from "@/components/course";
import {
  getCourseBySlug as getCourseBySlugLMS,
  getCourseModules as getCourseModulesLMS,
  getModuleLessons as getModuleLessonsLMS,
} from "@/lib/lms/courses-server";
import { getCurrentStudent } from "@/lib/auth/session";
import { checkCourseAccess } from "@/lib/lms/entitlements";
import { formatMXN, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const course = await getCourseBySlugLMS(params.slug);
  if (!course) return { title: "Curso no encontrado · Qlick" };
  return {
    title: course.title,
    description: course.description ?? undefined,
    alternates: { canonical: `/cursos/${course.slug}` },
    openGraph: {
      title: course.title,
      description: course.description ?? undefined,
      images: course.coverImageUrl ? [{ url: course.coverImageUrl }] : [],
    },
  };
}

export default async function CourseDetailPage({
  params
}: {
  params: { slug: string };
}) {
  const course = await getCourseBySlugLMS(params.slug);
  if (!course) notFound();

  // Cargamos módulos y lecciones del LMS (en lugar del mock).
  const lmsModules = await getCourseModulesLMS(course.id);
  const lmsLessonsByModule: Record<string, Array<{ id: string; slug: string; title: string; description: string | null; durationMinutes: number; isFreePreview: boolean }>> = {};
  for (const m of lmsModules) {
    lmsLessonsByModule[m.id] = (await getModuleLessonsLMS(m.id)).map((l) => ({
      id: l.id,
      slug: l.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      title: l.title,
      description: l.description,
      durationMinutes: l.durationMinutes ?? 0,
      isFreePreview: l.isFreePreview,
    }));
  }
  const totalLessons = Object.values(lmsLessonsByModule).reduce(
    (a, ls) => a + ls.length,
    0
  );
  const totalMinutes = Object.values(lmsLessonsByModule).reduce(
    (a, ls) => a + ls.reduce((b, l) => b + l.durationMinutes, 0),
    0,
  );

  // Determinar el CTA según el estado del user.
  const session = await getCurrentStudent();
  let alreadyHasAccess = false;
  if (session && course.accessType === "paid") {
    const access = await checkCourseAccess(session.userId, course.id);
    alreadyHasAccess = access.hasAccess;
  }
  // Primer módulo / lección para el botón "Empezar".
  const firstModule = lmsModules[0];
  const firstLesson = firstModule ? lmsLessonsByModule[firstModule.id]?.[0] : null;
  const firstLessonHref = firstLesson
    ? `/aprender/${course.slug}/${firstLesson.slug}`
    : null;

  // CTA dinámico.
  const cta =
    alreadyHasAccess && firstLessonHref
      ? { href: firstLessonHref, label: "Continuar curso", tone: "primary" as const }
      : course.accessType === "paid"
        ? { href: `/inscripcion/${course.slug}`, label: `Comprar curso · ${formatMXN(course.priceMXN ?? 0)}`, tone: "primary" as const }
        : { href: `/inscripcion/${course.slug}`, label: "Empezar gratis", tone: "primary" as const };

  return (
    <>
      <Navbar />

      {/* Hero del curso */}
      <section className="bg-ink text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-mesh opacity-40" />
        <Container size="wide" className="py-14 relative">
          <div className="grid lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {/* LevelBadge y StatusBadge consumen shapes legacy (español).
                    Mapeamos desde el LMS (inglés) al runtime. */}
                <LevelBadge
                  level={
                    course.level === "beginner" ? "basico"
                    : course.level === "intermediate" ? "intermedio"
                    : course.level === "advanced" ? "avanzado"
                    : "basico"
                  }
                />
                <StatusBadge
                  status={
                    course.accessType === "paid" ? "pago"
                    : "gratis"
                  }
                />
                {course.accessType === "paid" && (
                  <Badge tone="warning" className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                    {course.priceMXN && course.priceMXN > 0
                      ? `${formatMXN(course.priceMXN)}`
                      : "Premium"}
                  </Badge>
                )}
                {course.accessType === "free" && (
                  <Badge tone="success" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    Gratis
                  </Badge>
                )}
                {course.accessType === "freemium" && (
                  <Badge tone="info" className="bg-sky-500/20 text-sky-300 border-sky-500/30">
                    Freemium
                  </Badge>
                )}
              </div>
              <h1 className="display-2 text-white">{course.title}</h1>
              {course.subtitle && (
                <p className="mt-4 text-lg text-white/80 max-w-2xl">
                  {course.subtitle}
                </p>
              )}
              {course.description && (
                <p className="mt-4 text-base text-white/70 max-w-2xl whitespace-pre-line">
                  {course.description}
                </p>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/70">
                <span>· {lmsModules.length} módulos</span>
                <span>· {totalLessons} lecciones</span>
                <span>· {formatDuration(totalMinutes)}</span>
                {course.instructorName && (
                  <span>
                    · Instructor:{" "}
                    <span className="font-semibold text-white">
                      {course.instructorName}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Card de compra */}
            <div className="lg:row-span-2">
              <Card className="overflow-hidden sticky top-20">
                {course.coverImageUrl && (
                  <div className="relative aspect-video">
                    <Image
                      src={course.coverImageUrl}
                      alt={course.title}
                      fill
                      sizes="(max-width: 1024px) 90vw, 400px"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="p-6">
                  <div className="flex items-baseline gap-3 mb-1">
                    {course.accessType === "free" || course.priceMXN === 0 ? (
                      <span className="text-3xl font-bold text-emerald-600">Gratis</span>
                    ) : (
                      <span className="text-3xl font-bold text-ink">
                        {formatMXN(course.priceMXN ?? 0)}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    {cta.href ? (
                      <Button
                        size="lg"
                        className="w-full"
                        href={cta.href}
                      >
                        {cta.label}
                      </Button>
                    ) : (
                      <Button size="lg" className="w-full" disabled>
                        Próximamente
                      </Button>
                    )}
                    {firstLessonHref && !alreadyHasAccess && course.accessType === "paid" && (
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full"
                        href={firstLessonHref}
                      >
                        Ver primera lección gratis
                      </Button>
                    )}
                    {course.accessType === "free" && firstLessonHref && (
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full"
                        href={firstLessonHref}
                      >
                        Vista previa
                      </Button>
                    )}
                  </div>

                  <ul className="mt-6 space-y-2 text-sm text-ink-soft">
                    <li className="flex gap-2">
                      <span className="text-brand-600">✓</span> Acceso indefinido
                    </li>
                    <li className="flex gap-2">
                      <span className="text-brand-600">✓</span> Video on-demand
                    </li>
                    <li className="flex gap-2">
                      <span className="text-brand-600">✓</span> Recursos descargables
                    </li>
                    <li className="flex gap-2">
                      <span className="text-brand-600">✓</span> Soporte por WhatsApp
                    </li>
                  </ul>

                  <p className="mt-4 text-xs text-ink-muted border-t border-brand-100 pt-4">
                    {course.accessType === "paid"
                      ? "Pago seguro · tarjeta, SPEI u OXXO · facturación disponible"
                      : "Curso sin costo · acceso inmediato · soporte incluido"}
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </Container>
      </section>

      {/* Contenido del curso */}
      {lmsModules.length > 0 ? (
        <section className="py-14">
          <Container size="wide">
            <h2 className="text-2xl font-bold text-ink mb-6">Contenido del curso</h2>
            <div className="space-y-3">
              {lmsModules.map((m, mi) => {
                const lessons = lmsLessonsByModule[m.id] ?? [];
                const moduleMinutes = lessons.reduce(
                  (a, l) => a + l.durationMinutes,
                  0,
                );
                return (
                  <Card key={m.id} className="overflow-hidden">
                    <div className="px-5 py-4 border-b border-brand-50 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-brand-600">
                          Módulo {mi + 1}
                        </p>
                        <h4 className="font-semibold text-ink">{m.title}</h4>
                      </div>
                      <span className="text-xs text-ink-muted">
                        {lessons.length} lecciones · {formatDuration(moduleMinutes)}
                      </span>
                    </div>
                    {lessons.length > 0 && (
                      <ul className="divide-y divide-brand-50">
                        {lessons.map((l, li) => (
                          <li
                            key={l.id}
                            className="flex items-center gap-3 px-5 py-3 text-sm"
                          >
                            <span className="text-brand-500">▶</span>
                            <span className="flex-1 text-ink-soft">
                              {mi + 1}.{li + 1} {l.title}
                            </span>
                            {l.isFreePreview && (
                              <Badge tone="success">Vista previa</Badge>
                            )}
                            <span className="text-xs text-ink-muted">
                              {formatDuration(l.durationMinutes)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </div>
          </Container>
        </section>
      ) : (
        <section className="py-14">
          <Container size="wide">
            <EmptyState
              icon="📚"
              title="El contenido de este curso se está preparando"
              description="Volvé pronto para ver las lecciones."
            />
          </Container>
        </section>
      )}

      <Footer />
    </>
  );
}
