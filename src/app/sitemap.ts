import type { MetadataRoute } from "next";
import { getAllCourses, flatLessons } from "@/lib/data/courses";

const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/cursos",
    "/acerca",
    "/beneficios",
    "/faq",
    "/contacto",
    "/login",
    "/dashboard"
  ].map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.8
  }));

  const courseRoutes = getAllCourses().map((c) => ({
    url: `${base}/cursos/${c.slug}`,
    lastModified: new Date(c.createdAt),
    changeFrequency: "monthly" as const,
    priority: 0.7
  }));

  const lessonRoutes = getAllCourses().flatMap((c) =>
    flatLessons(c).map((f) => ({
      url: `${base}/aprender/${c.slug}/${f.lesson.slug}`,
      lastModified: new Date(c.createdAt),
      changeFrequency: "monthly" as const,
      priority: 0.5
    }))
  );

  return [...staticRoutes, ...courseRoutes, ...lessonRoutes];
}
