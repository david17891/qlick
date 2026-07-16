/**
 * Sprint v0.12: endpoint "Olvidar este número" para que David pueda
 * probar el bot con su número real sin que el contexto se acumule
 * entre pruebas.
 *
 * FIX 2026-07-16 (sprint cobro-en-puerta, sesion David "el boton
 * olvidar no limpia bien la memoria del bot"): ademas del wizard
 * state y el lead_profile.summary, este endpoint limpia:
 *   - leads.name + email + status + whatsapp_status
 *   - event_qr_tokens (por attendee_phone_normalized)
 *   - event_confirmations (por phone_normalized O email)
 *   - event_payments (vinculadas a las confirmations)
 *   - event_access (por lead_id)
 *
 * La logica vive en `src/lib/admin/reset-lead.ts` para que sea
 * testeable sin depender de Next.js. Este route es solo un wrapper
 * HTTP: auth + parse body + llamar a la funcion + mapear respuesta.
 *
 * Auth: `requireAdmin` (David usa la sesion admin que ya tiene).
 *
 * @server
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resetLeadContext } from "@/lib/admin/reset-lead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ResetLeadRequest {
  phone: string;
  /** Opcional: si true, también borra event_attendees rows del lead. */
  alsoDeleteAttendees?: boolean;
}

export async function POST(req: NextRequest) {
  // 1. Auth admin.
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "No admin session" }, { status: 401 });
  }

  // 2. Parse body.
  let body: ResetLeadRequest;
  try {
    body = (await req.json()) as ResetLeadRequest;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.phone || typeof body.phone !== "string") {
    return NextResponse.json(
      { error: "Falta `phone` (string E.164, ej. '+526532935492')" },
      { status: 400 }
    );
  }

  // 3. Llamar a la función helper (testeable sin Next.js).
  const sb = createSupabaseAdminClient();
  const result = await resetLeadContext(sb, body.phone, {
    alsoDeleteAttendees: body.alsoDeleteAttendees ?? false,
    adminEmail: admin.email,
  });

  // 4. Mapear resultado a HTTP response.
  if (!result.ok) {
    // Errores de normalización o búsqueda → 400/500.
    if (result.error?.startsWith("No se pudo normalizar")) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result, { status: 200 });
}
