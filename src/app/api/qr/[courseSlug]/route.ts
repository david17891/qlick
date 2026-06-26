/**
 * Endpoint público que devuelve el QR de inscripción de un curso como PNG.
 *
 * Uso:
 *   <img src="/api/qr/[slug]" alt="QR para inscribirme" />
 *   o descargar directo desde el browser.
 *
 * Respuestas:
 *   - 200 image/png si el curso existe.
 *   - 404 si el slug no corresponde a un curso publicado.
 *
 * Cache-Control: 1h (los QRs solo cambian si cambia el dominio).
 */

import { NextResponse } from "next/server";
import { generateQrPng, buildEnrollmentUrl } from "@/lib/qr/generate";
import { getCourseBySlug } from "@/lib/lms/courses-server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: { courseSlug: string } },
) {
  const { courseSlug } = ctx.params;
  const course = await getCourseBySlug(courseSlug);
  if (!course) {
    return new NextResponse(`Curso no encontrado: ${courseSlug}`, {
      status: 404,
    });
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const url = buildEnrollmentUrl(baseUrl, courseSlug);
  const png = await generateQrPng(url);
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
