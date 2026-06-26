import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Navbar, Footer } from "@/components/layout";
import {
  Container,
  Button,
  Badge,
  Card,
  ProgressBar,
  EmptyState
} from "@/components/ui";
import { LevelBadge, StatusBadge } from "@/components/course";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";
import {
  getAllCourses,
  getCourseBySlug,
  getCourseStats,
  getOtherCourses
} from "@/lib/data/courses";
import { getInstructorById } from "@/lib/data/instructors";
import { formatMXN, formatDuration } from "@/lib/utils";
import { CourseCard } from "@/components/course";

export function generateStaticParams() {
  return getAllCourses().map((c) => ({ slug: c.slug }));
}

export function generateMetadata({
  params
}: {
  params: { slug: string };
}): Metadata {
  const course = getCourseBySlug(params.slug);
  if (!course) return { title: "Curso no encontrado" };
  return {
    title: course.title,
    description: course.shortDescription,
    alternates: { canonical: `/cursos/${course.slug}` },
    openGraph: {
      title: course.title,
      description: course.shortDescription,
      images: [{ url: course.thumbnailUrl }]
    }
  };
}

export default function CourseDetailPage({
  params
}: {
  params: { slug: string };
}) {
  const course = getCourseBySlug(params.slug);
  if (!course) notFound();

  const instructor = getInstructorById(course.instructorId);
  const stats = getCourseStats(course.id);
  const related = getOtherCourses(course.id, 3);
  const firstLesson = course.modules[0]?.lessons[0];
  const previewLesson = course.modules[0]?.lessons.find((l) => l.isPreview) ?? firstLesson;

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
                <LevelBadge level={course.level} />
                <StatusBadge status={course.status} />
                {course.tags.map((t) => (
                  <Badge key={t.id} tone="neutral" className="bg-white/10 text-white">
                    {t.label}
                  </Badge>
                ))}
              </div>
              <h1 className="display-2 text-white">{course.title}</h1>
              <p className="mt-4 text-lg text-white/80 max-w-2xl">
                {course.shortDescription}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/70">
                {course.rating && (
                  <span className="text-amber-400 font-semibold">
                    ★ {course.rating}
                  </span>
                )}
                <span>· {course.studentsCount ?? 0} alumnos</span>
                <span>· {stats.totalModules} módulos</span>
                <span>· {stats.totalLessons} lecciones</span>
                <span>· {formatDuration(stats.totalMinutes)}</span>
              </div>
              {instructor && (
                <p className="mt-4 text-sm text-white/70">
                  Imparte <span className="font-semibold text-white">{instructor.name}</span> — {instructor.title}
                </p>
              )}
            </div>

            {/* Card de compra */}
            <div className="lg:row-span-2">
              <Card className="overflow-hidden sticky top-20">
                <div className="relative aspect-video">
                  <Image
                    src={course.thumbnailUrl}
                    alt={course.title}
                    fill
                    sizes="(max-width: 1024px) 90vw, 400px"
                    className="object-cover"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-baseline gap-3 mb-1">
                    {course.status === "gratis" || course.priceMXN === 0 ? (
                      <span className="text-3xl font-bold text-emerald-600">Gratis</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold text-ink">
                          {formatMXN(course.priceMXN)}
                        </span>
                        {course.originalPriceMXN &&
                          course.originalPriceMXN > course.priceMXN && (
                            <span className="text-ink-muted line-through">
                              {formatMXN(course.originalPriceMXN)}
                            </span>
                          )}
                      </>
                    )}
                  </div>
                  {course.originalPriceMXN &&
                    course.originalPriceMXN > course.priceMXN && (
                      <Badge tone="accent" className="mb-4">
                        Ahorras{" "}
                        {formatMXN(course.originalPriceMXN - course.priceMXN)}
                      </Badge>
                    )}

                  <div className="mt-4 space-y-2">
                    {course.status === "proximamente" ? (
                      <Button variant="secondary" size="lg" className="w-full" href="/contacto">
                        Avísame al lanzar
                      </Button>
                    ) : (
                      <Button size="lg" className="w-full" href={`/inscripcion/${course.slug}`}>
                        {course.priceMXN === 0 ? "Inscribirme gratis" : "Comprar curso"}
                      </Button>
                    )}
                    {previewLesson && (
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full"
                        href={`/aprender/${course.slug}/${previewLesson.slug}`}
                      >
                        Ver vista previa
                      </Button>
                    )}
                    {course.status !== "proximamente" && (
                      <WhatsAppButton
                        intent="enroll"
                        courseName={course.title}
                        variant="outline"
                        size="lg"
                        fullWidth
                        label="Inscribirme por WhatsApp"
                      />
                    )}
                  </div>

                  <ul className="mt-6 space-y-2 text-sm text-ink-soft">
                    <li className="flex gap-2">
                      <span className="text-brand-600">✓</span> Acceso indefinido
                    </li>
                    <li className="flex gap-2">
                      <span className="text-brand-600">✓</span> Certificado al completar
                    </li>
                    <li className="flex gap-2">
                      <span className="text-brand-600">✓</span> Recursos descargables
                    </li>
                    <li className="flex gap-2">
                      <span className="text-brand-600">✓</span> Garantía de 7 días
                    </li>
                  </ul>

                  <p className="mt-4 text-xs text-ink-muted border-t border-brand-100 pt-4">
                    Pago seguro · tarjeta, SPEI u OXXO · facturación disponible
                  </p>
                </div>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <p className="text-white/85 leading-relaxed">
                {course.longDescription}
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Qué aprenderás */}
      <section className="py-14">
        <Container size="wide" className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-4">Qué aprenderás</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {course.whatYouWillLearn.map((item, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="mt-1 h-5 w-5 shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                      ✓
                    </span>
                    <p className="text-ink-soft">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Contenido del curso */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-ink">Contenido del curso</h2>
                <span className="text-sm text-ink-muted">
                  {stats.totalModules} módulos · {stats.totalLessons} lecciones
                </span>
              </div>
              <div className="space-y-3">
                {course.modules.map((m, mi) => {
                  const moduleMinutes = m.lessons.reduce(
                    (a, l) => a + l.durationMinutes,
                    0
                  );
                  return (
                    <Card key={m.id} className="overflow-hidden">
                      <div className="px-5 py-4 border-b border-brand-50 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase text-brand-600">
                            Módulo {mi + 1}
                          </p>
                          <h4 className="font-semibold text-ink">
                            {m.title.replace(/^Módulo \d+ · /, "")}
                          </h4>
                        </div>
                        <span className="text-xs text-ink-muted">
                          {m.lessons.length} lecciones · {formatDuration(moduleMinutes)}
                        </span>
                      </div>
                      <ul className="divide-y divide-brand-50">
                        {m.lessons.map((l, li) => (
                          <li
                            key={l.id}
                            className="flex items-center gap-3 px-5 py-3 text-sm"
                          >
                            <span className="text-brand-500">
                              {l.type === "video" ? "▶" : l.type === "exercise" ? "✍" : "📄"}
                            </span>
                            <span className="flex-1 text-ink-soft">
                              {mi + 1}.{li + 1} {l.title}
                            </span>
                            {l.isPreview && (
                              <Badge tone="success">Vista previa</Badge>
                            )}
                            <span className="text-xs text-ink-muted">
                              {formatDuration(l.durationMinutes)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Requisitos y público */}
            <div className="grid sm:grid-cols-2 gap-8">
              <div>
                <h2 className="text-xl font-bold text-ink mb-3">Requisitos</h2>
                <ul className="space-y-2">
                  {course.requirements.map((r, i) => (
                    <li key={i} className="flex gap-2 text-ink-soft">
                      <span className="text-brand-600">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-xl font-bold text-ink mb-3">¿Para quién es?</h2>
                <ul className="space-y-2">
                  {course.targetAudience.map((r, i) => (
                    <li key={i} className="flex gap-2 text-ink-soft">
                      <span className="text-brand-600">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Instructor */}
            {instructor && (
              <Card className="p-6">
                <h2 className="text-xl font-bold text-ink mb-4">Tu instructor</h2>
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold text-xl shrink-0">
                    {instructor.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-bold text-ink">{instructor.name}</p>
                    <p className="text-sm text-brand-600 font-semibold">{instructor.title}</p>
                    <p className="mt-2 text-sm text-ink-muted">{instructor.bio}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {instructor.specialties.map((s) => (
                        <Badge key={s} tone="neutral">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <Card className="p-6">
              <h3 className="font-bold text-ink mb-3">Resumen</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Nivel</dt>
                  <dd className="font-semibold text-ink capitalize">{course.level}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Duración</dt>
                  <dd className="font-semibold text-ink">
                    {formatDuration(stats.totalMinutes)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Módulos</dt>
                  <dd className="font-semibold text-ink">{stats.totalModules}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Lecciones</dt>
                  <dd className="font-semibold text-ink">{stats.totalLessons}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Idioma</dt>
                  <dd className="font-semibold text-ink">Español</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Certificado</dt>
                  <dd className="font-semibold text-ink">Sí</dd>
                </div>
              </dl>
            </Card>

            <Card className="p-6 bg-brand-50/50">
              <p className="text-sm text-ink-soft">
                ¿Tienes dudas sobre si este curso es para ti?
              </p>
              <Button href="/contacto" variant="outline" size="sm" className="mt-3 w-full">
                Hablar con un asesor
              </Button>
            </Card>
          </aside>
        </Container>
      </section>

      {/* Relacionados */}
      {related.length > 0 && (
        <section className="py-14 bg-brand-50/40 border-t border-brand-100">
          <Container size="wide">
            <h2 className="text-2xl font-bold text-ink mb-6">Cursos relacionados</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          </Container>
        </section>
      )}

      <Footer />
    </>
  );
}
