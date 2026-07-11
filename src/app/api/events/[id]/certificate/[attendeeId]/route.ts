/**
 * Endpoint de Certificado de Asistencia — PDF nativo (Concept C).
 *
 * Sprint Certificados 2026-07-08 (sesion David): convierte el placeholder
 * HTML imprimible (Fase 1, 2026-07-06) en un PDF nativo con diseno del
 * Concept C (dynamic authority), generado via @react-pdf/renderer.
 *
 * Cambios funcionales vs la version anterior:
 *   - Response Content-Type cambia de text/html a application/pdf.
 *   - El template visual lo define `src/lib/certificates/render-certificate.tsx`
 *     (NO esta en este archivo — esta capa es solo orquestacion HTTP).
 *   - Persistencia idempotente: cada cert queda registrado en
 *     `event_certificates` con folio UNIQUE QLK-YYYY-XXXXX. Re-pedir el
 *     mismo attendee devuelve el mismo folio (sin duplicar).
 *   - El QR del cert apunta a ${BASE_URL}/filosofia (landing de marca),
 *     NO a /verify/{folio} (decision de David 2026-07-08).
 *
 * GET /api/events/[id]/certificate/[attendeeId]
 *
 * Auth: requireAdmin() — solo David (o admin) puede descargar.
 *
 * Validacion (delegada a issueCertificate()):
 *   - Attendee pertenece al evento (FK).
 *   - Attendee hizo check-in (checked_in_at IS NOT NULL).
 *   - Attendee tiene nombre real (no placeholder).
 *
 * Response:
 *   - 200 + PDF (application/pdf, inline).
 *   - 400 si faltan params.
 *   - 401 si no es admin.
 *   - 404 si attendee o evento no existe.
 *   - 409 si attendee no hizo check-in.
 *   - 422 si attendee no tiene nombre valido.
 *   - 500 si falla la emision (UNIQUE collision no resuelta, etc.).
 *   - 501 si Supabase no esta configurado.
 */

import { NextResponse } from "next/server";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { requireAdmin } from "@/lib/auth/session";
import {
  issueCertificate,
  CertificateValidationError,
} from "@/lib/certificates/issue-certificate";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { id: string; attendeeId: string };
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

  // 3. Emision del certificado (idempotente, race-safe).
  try {
    const result = await issueCertificate({ eventId, attendeeId });

    return new NextResponse(result.pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="certificado-${result.folio}.pdf"`,
        "Cache-Control": "no-store",
        // Custom header para que el admin pueda saber si fue regenerado.
        "X-Certificate-Folio": result.folio,
        "X-Certificate-Already-Issued": String(result.alreadyIssued),
      },
    });
  } catch (err) {
    if (err instanceof CertificateValidationError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.statusCode },
      );
    }
    const message =
      err instanceof Error ? err.message : "Error desconocido al emitir.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
