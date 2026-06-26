/**
 * Helpers para generar QRs de inscripción.
 *
 * El QR codifica la URL pública de inscripción de un curso:
 *   `${NEXT_PUBLIC_APP_URL}/inscripcion/[slug]?ref=qr`
 *
 * Cuando el alumno escanea y entra con sesión, la página de inscripción
 * llama `enrollUserInCourse(userId, courseId, source="qr")` y persiste
 * la atribución en `enrollments.source`.
 *
 * Si después cambia el dominio (ej: deploy a producción), solo hay que
 * cambiar `NEXT_PUBLIC_APP_URL` y regenerar los QRs.
 *
 * Server-only. No importar desde Client Components.
 */

import QRCode from "qrcode";

export interface GenerateQrOptions {
  /** Tamaño en pixels del PNG (cuadrado). Default: 512. */
  width?: number;
  /** Margen blanco alrededor del QR (en módulos). Default: 2. */
  margin?: number;
  /** Nivel de corrección de errores: L (7%), M (15%), Q (25%), H (30%). Default: M. */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

const DEFAULTS: Required<GenerateQrOptions> = {
  width: 512,
  margin: 2,
  errorCorrectionLevel: "M",
};

/** Genera el QR como Buffer PNG listo para devolver como image/png. */
export async function generateQrPng(
  data: string,
  options: GenerateQrOptions = {},
): Promise<Buffer> {
  return QRCode.toBuffer(data, {
    type: "png",
    width: options.width ?? DEFAULTS.width,
    margin: options.margin ?? DEFAULTS.margin,
    errorCorrectionLevel:
      options.errorCorrectionLevel ?? DEFAULTS.errorCorrectionLevel,
  });
}

/** Genera el QR como data URL (base64) — útil para <img src=...>. */
export async function generateQrDataUrl(
  data: string,
  options: GenerateQrOptions = {},
): Promise<string> {
  return QRCode.toDataURL(data, {
    width: options.width ?? DEFAULTS.width,
    margin: options.margin ?? DEFAULTS.margin,
    errorCorrectionLevel:
      options.errorCorrectionLevel ?? DEFAULTS.errorCorrectionLevel,
  });
}

/**
 * Construye la URL de inscripción que codifica el QR.
 * Siempre incluye ?ref=qr para que la página de inscripción marque
 * el enrollment con source="qr" y la atribución quede registrada.
 *
 * Si `baseUrl` no es válida, cae a `http://localhost:3000` (defensa).
 */
export function buildEnrollmentUrl(baseUrl: string, slug: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    base = new URL("http://localhost:3000");
  }
  const path = `/inscripcion/${encodeURIComponent(slug)}`;
  const url = new URL(path, base);
  url.searchParams.set("ref", "qr");
  return url.toString();
}
