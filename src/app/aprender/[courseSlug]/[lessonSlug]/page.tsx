import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { LessonView } from "@/components/course/LessonView";
import {
  getCourseBySlug,
  getAllCourses,
  findLesson
} from "@/lib/data/courses";

export function generateStaticParams() {
  return getAllCourses().flatMap((c) =>
    c.modules.flatMap((m) =>
      m.lessons.map((l) => ({
        courseSlug: c.slug,
        lessonSlug: l.slug
      }))
    )
  );
}

export function generateMetadata({
  params
}: {
  params: { courseSlug: string; lessonSlug: string };
}): Metadata {
  const course = getCourseBySlug(params.courseSlug);
  if (!course) return { title: "Lección no encontrada" };
  const found = findLesson(course, params.lessonSlug);
  if (!found) return { title: course.title };
  return {
    title: `${found.lesson.title} · ${course.title}`,
    description: found.lesson.description,
    alternates: {
      canonical: `/aprender/${course.slug}/${found.lesson.slug}`
    }
  };
}

export default function LessonPage({
  params
}: {
  params: { courseSlug: string; lessonSlug: string };
}) {
  const course = getCourseBySlug(params.courseSlug);
  if (!course) notFound();

  return (
    <>
      <Navbar />
      <LessonView course={course} lessonSlug={params.lessonSlug} />
      <Footer />
    </>
  );
}
