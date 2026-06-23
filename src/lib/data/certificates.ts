import type { Certificate } from "@/types";

/**
 * Certificados simulados. En la Fase 4 se generan como PDF con código verificable.
 */

export const certificates: Certificate[] = [
  {
    id: "cert_1",
    userId: "user_alumno",
    courseId: "course_fundamentos",
    code: "QLICK-CERT-001",
    issuedAt: "2025-05-12T10:00:00Z",
    pdfUrl: "#"
  }
];

export function getCertificatesForUser(userId: string): Certificate[] {
  return certificates.filter((c) => c.userId === userId);
}
