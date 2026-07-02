/**
 * Endpoint público que devuelve el QR de un pase como imagen PNG.
 *
 * FIX 2026-07-02 (sesion David): antes el QR se embebia en el email como
 * data URL inline (`<img src="data:image/png;base64,...">`). Gmail y
 * Outlook NO renderizan data URLs inline (politica anti-tracking).
 * Ahora el QR se sirve desde aca, y el email lo referencia por URL.
 *
 * Path: /api/event-qr/[token] (separado de /api/qr/[courseSlug] que
 * devuelve el QR de inscripcion a un curso LMS).
 *
 * Uso en el email:
 *   <img src="https://qlick.digital/api/event-qr/abc123.png" />
 *
 * El QR codifica la URL publica del check-in:
 *   https://qlick.digital/check-in/abc123
 *
 * El staff en puerta escanea el QR desde la pantalla del celular del
 * asistente o desde el email, y se abre el check-in.
 *
 * Publico: el QR ya es visible en la URL del check-in (que se manda
 * por WhatsApp), asi que no agrega superficie de ataque.
 */

import { generateQrPng } from "@/lib/qr/generate";
import { appBaseUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { token: string };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { token } = params;
  if (!token || token.length < 16) {
    return new Response("Token invalido", { status: 400 });
  }

  // El QR codifica la URL publica del check-in (misma URL que se manda
  // por WhatsApp). El staff escanea y abre esa URL.
  const checkInUrl = `${appBaseUrl()}/check-in/${encodeURIComponent(token)}`;

  try {
    const png = await generateQrPng(checkInUrl, { width: 512 });
    return new Response(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable", // 24h
        "Content-Length": png.length.toString(),
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[api/event-qr] generateQrPng failed",
      err instanceof Error ? err.message : String(err),
    );
    return new Response("Error generando QR", { status: 500 });
  }
}
