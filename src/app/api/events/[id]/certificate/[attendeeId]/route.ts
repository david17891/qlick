/**
 * Endpoint de Certificado de Asistencia (PLACEHOLDER minimalista).
 *
 * FIX 2026-07-06 (sesion David): David decidio implementar la generacion
 * de certificados en 2 fases. Esta primera fase (placeholder) devuelve
 * un documento HTML imprimible con los datos del asistente y del evento.
 * Sirve como base funcional para:
 *   - Validar el flujo en el panel admin (boton "Certificado" en tab Asistentes).
 *   - Probar el branding y los datos antes de invertir en maquetacion PDF.
 *
 * En una segunda fase se convertira este HTML a PDF (pdfkit o
 * @react-pdf/renderer) manteniendo este endpoint como fuente de verdad
 * de los datos.
 *
 * GET /api/events/[id]/certificate/[attendeeId]
 *
 * Auth: requireAdmin() — solo David (o admin) puede descargar.
 *
 * Validacion:
 *   - El attendee pertenece al evento (FK).
 *   - El attendee hizo check-in (checked_in_at IS NOT NULL).
 *   - El attendee tiene nombre real (no placeholder).
 *
 * Response:
 *   - 200 + HTML imprimible (text/html; charset=utf-8).
 *   - 400 si faltan params.
 *   - 401 si no es admin.
 *   - 404 si el attendee no existe.
 *   - 409 si el attendee no hizo check-in.
 *   - 422 si el attendee no tiene nombre valido.
 */

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { requireAdmin } from "@/lib/auth/session";

// Helpers locales (no usamos formatDateLong/formatTime porque no existen
// en lib/utils — solo formatDate. Inline para mantener el endpoint
// autocontenido).
//
// FIX 2026-07-07 (sesión David, "bot pone 17:00 UTC cuando admin escribió
// 10:00"): antes usábamos `timeZone: "UTC"` y el certificado mostraba la
// hora UTC al asistente. Como el admin escribe hora local del navegador
// (Phoenix, UTC-7) y la DB guarda timestamptz UTC, el certificado
// imprimible quedaba con la hora desplazada +7h. Ahora usamos la zona del
// proyecto.
function formatDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Phoenix",
    });
  } catch {
    return iso;
  }
}
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Phoenix",
    });
  } catch {
    return "";
  }
}

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { id: string; attendeeId: string };
}

interface AttendeeRow {
  id: string;
  event_id: string;
  name: string | null;
  email: string | null;
  phone_normalized: string | null;
  checked_in_at: string | null;
}

interface EventRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(_req: Request, ctx: RouteParams) {
  // 1. Auth
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 },
    );
  }

  // 2. Config
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado." },
      { status: 501 },
    );
  }

  const { id: eventId, attendeeId } = ctx.params;
  if (!eventId || !attendeeId) {
    return NextResponse.json(
      { ok: false, error: "Params faltantes." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  // 3. Attendee + event join
  const { data: attendeeRaw, error: attErr } = await supabase
    .from("event_attendees")
    .select("id, event_id, name, email, phone_normalized, checked_in_at")
    .eq("id", attendeeId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (attErr) {
    return NextResponse.json(
      { ok: false, error: `DB error: ${attErr.code ?? "?"}` },
      { status: 500 },
    );
  }
  if (!attendeeRaw) {
    return NextResponse.json(
      { ok: false, error: "Asistente no encontrado en este evento." },
      { status: 404 },
    );
  }

  const attendee = attendeeRaw as AttendeeRow;

  if (!attendee.checked_in_at) {
    return NextResponse.json(
      {
        ok: false,
        error: "El asistente no ha hecho check-in. El certificado solo se emite para asistentes que confirmaron asistencia.",
      },
      { status: 409 },
    );
  }

  // 4. Validar nombre (no placeholder)
  const name = attendee.name?.trim() ?? "";
  if (name.length < 2 || /^(asistente|por confirmar|confirmar|pendiente|test|n\/?a|anonimo|anonymous|sin nombre)$/i.test(name)) {
    return NextResponse.json(
      {
        ok: false,
        error: `El asistente no tiene un nombre real (actual: "${name}"). Edita su nombre en el panel admin antes de emitir el certificado.`,
      },
      { status: 422 },
    );
  }

  // 5. Cargar evento
  const { data: eventRaw, error: evtErr } = await supabase
    .from("events")
    .select("id, title, slug, description, starts_at, ends_at, location")
    .eq("id", eventId)
    .maybeSingle();

  if (evtErr || !eventRaw) {
    return NextResponse.json(
      { ok: false, error: "Evento no encontrado." },
      { status: 404 },
    );
  }

  const event = eventRaw as EventRow;

  // 6. Datos del certificado
  const safeName = escapeHtml(name);
  const safeEventTitle = escapeHtml(event.title);
  const safeLocation = escapeHtml(event.location ?? "Por confirmar");
  const eventDateLong = formatDateLong(event.starts_at);
  const eventTime = formatTime(event.starts_at);
  const duration = event.ends_at
    ? `${Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000)} minutos`
    : "90 minutos";
  const issuedAt = formatDateLong(new Date().toISOString());

  // 7. HTML imprimible (placeholder minimalista)
  // TODO Fase 2: convertir a PDF con pdfkit manteniendo este HTML como fuente.
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Certificado — ${safeName}</title>
<style>
  @page { size: landscape; margin: 1.5cm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    color: #2a1f4d;
    background: #fdfaff;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }
  .cert {
    width: 100%;
    max-width: 980px;
    background: #fff;
    border: 6px double #6c3aed;
    border-radius: 8px;
    padding: 64px 80px;
    text-align: center;
    box-shadow: 0 8px 32px rgba(108, 58, 237, 0.12);
  }
  .brand {
    font-size: 12px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #6c3aed;
    margin: 0 0 8px;
    font-weight: 600;
  }
  h1 {
    font-size: 48px;
    margin: 12px 0 32px;
    font-weight: 700;
    color: #2a1f4d;
  }
  .lead {
    font-size: 18px;
    line-height: 1.6;
    margin: 0 0 16px;
    color: #4a4060;
  }
  .name {
    font-size: 56px;
    margin: 24px 0 32px;
    font-weight: 700;
    font-style: italic;
    color: #2a1f4d;
    border-bottom: 2px solid #c4b5fd;
    display: inline-block;
    padding: 0 32px 12px;
  }
  .event-title {
    font-size: 28px;
    margin: 16px 0 12px;
    font-weight: 600;
    color: #2a1f4d;
  }
  .meta {
    font-size: 16px;
    color: #6c3aed;
    margin: 24px 0 0;
    font-weight: 500;
  }
  .meta-item { margin: 6px 0; }
  .footer {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid #e9e3f8;
    font-size: 11px;
    color: #8a7fad;
    line-height: 1.5;
  }
  .print-hint {
    margin-top: 24px;
    padding: 12px 16px;
    background: #faf5ff;
    border: 1px dashed #c4b5fd;
    border-radius: 6px;
    font-size: 12px;
    color: #6c3aed;
    font-family: system-ui, sans-serif;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .cert { box-shadow: none; max-width: 100%; }
    .print-hint { display: none; }
  }
</style>
</head>
<body>
  <div class="cert">
    <p class="brand">Qlick Marketing Digital</p>
    <h1>Certificado de Asistencia</h1>
    <p class="lead">Se otorga el presente certificado a</p>
    <div class="name">${safeName}</div>
    <p class="lead">por su participación en</p>
    <div class="event-title">${safeEventTitle}</div>
    <p class="meta">
      <span class="meta-item"><strong>${eventDateLong}</strong></span>
      <span class="meta-item">${eventTime} · ${duration}</span>
      <span class="meta-item">${safeLocation}</span>
    </p>
    <div class="footer">
      Certificado emitido digitalmente por Qlick Marketing Digital el ${issuedAt}.<br>
      <em>Este documento es un placeholder funcional para la versión PDF definitiva (Fase 2).</em>
    </div>
    <div class="print-hint">
      <strong>Placeholder Beta:</strong> Este certificado se entrega en HTML imprimible.
      Para guardar como PDF usa Ctrl+P → "Guardar como PDF". La versión PDF nativa (pdfkit) llega en la siguiente fase.
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="certificado-${event.slug}-${attendeeId.slice(0, 8)}.html"`,
      "Cache-Control": "no-store",
    },
  });
}