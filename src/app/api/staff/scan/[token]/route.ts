/**
 * Endpoint público: valida el link del staff y redirige al scanner.
 *
 * GET /api/staff/scan/[token]
 *   - Si el token es válido → redirige a `/admin/eventos/[event_id]/staff/scan?token=...`
 *   - Si no existe → 404 con página explicativa
 *   - Si expiró → 410 con página explicativa
 *   - Si está revocado → 410 con página explicativa
 *   - Si aún no es válido (valid_from futuro) → 410 con página explicativa
 *
 * **Por qué un endpoint separado:** el staff abre el link en WhatsApp /
 * SMS. Si el token es malo, queremos mostrar un mensaje claro antes de
 * redirigir. Si fuera directo a la página, el staff vería una pantalla
 * rota sin contexto.
 *
 * **Público (sin auth):** la "autorización" es el token (192 bits
 * entropía). Mismo patrón que `/api/check-in/[token]`.
 *
 * Server-only.
 */

import { NextResponse } from "next/server";
import { validateStaffLink } from "@/lib/staff/links";
import { appBaseUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { token: string };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { token } = params;
  if (!token || token.length < 16) {
    return new NextResponse("Token invalido", { status: 400 });
  }

  const result = await validateStaffLink(token);
  if (!result.ok) {
    // Construimos un HTML mínimo explicando el motivo. No redirigimos
    // a la app porque el staff no tiene contexto — mejor pantalla clara.
    const reasonMap: Record<typeof result.reason, string> = {
      not_found: "Este link no existe o ya fue removido.",
      expired: "Este link expiró. Pedile al admin uno nuevo.",
      revoked: "Este link fue revocado. Pedile al admin uno nuevo.",
      not_yet_valid: "Este link aún no está activo. Volvé más tarde.",
    };
    const html = renderStaffErrorHtml(reasonMap[result.reason]);
    return new NextResponse(html, {
      status: result.reason === "not_found" ? 404 : 410,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Token válido → redirigir a la página del scanner.
  // Pasamos el token por query string para que la página pueda validar
  // de nuevo (defense in depth) y para que el staff pueda recargar sin
  // perder el contexto.
  const dest = `${appBaseUrl()}/admin/eventos/${result.link.eventId}/staff/scan?token=${encodeURIComponent(token)}`;
  return NextResponse.redirect(dest, { status: 302 });
}

function renderStaffErrorHtml(message: string): string {
  // HTML minimalista, mobile-first, sin dependencias. El staff abre
  // esto en su celular y necesita entender qué pasó.
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link de staff no válido</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: linear-gradient(180deg, #faf5ff 0%, #fff 100%);
           color: #1e293b; min-height: 100vh; display: flex; align-items: center; justify-content: center;
           padding: 24px; }
    .card { max-width: 420px; background: white; border: 1px solid #e9d5ff;
            border-radius: 16px; padding: 32px 24px; text-align: center;
            box-shadow: 0 4px 12px -2px rgba(192,38,211,0.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; color: #6d28d9; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.5; color: #475569; margin-bottom: 24px; }
    a { display: inline-block; background: linear-gradient(135deg, #6d28d9 0%, #c026d3 100%);
        color: white; font-weight: 600; padding: 12px 24px; border-radius: 9999px;
        text-decoration: none; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⛔</div>
    <h1>Link de staff no válido</h1>
    <p>${message}</p>
    <a href="https://wa.me/?text=Necesito%20un%20link%20de%20staff%20nuevo">Pedir uno nuevo por WhatsApp</a>
  </div>
</body>
</html>`;
}