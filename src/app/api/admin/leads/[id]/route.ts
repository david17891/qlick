import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { updateLeadStatus, archiveLead } from "@/lib/crm/leads-admin-server";

/**
 * Operaciones admin sobre un lead concreto.
 *
 * PATCH /api/admin/leads/[id] { status: LeadStatus }
 *   -> cambia el status del lead (audit log + interacción del sistema).
 *
 * DELETE /api/admin/leads/[id]
 *   -> archiva el lead (soft delete). NO soporta `?mode=hard` por
 *      compliance (LGPD/LFPDPPP): hard delete destruiría en CASCADE
 *      `lead_consent_log`, que es prueba legal de consentimiento.
 *      El derecho al olvido se maneja anonimizando el row, no
 *      borrándolo.
 *
 * Defensa en profundidad: middleware ya validó admin; aquí re-validamos.
 */

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin." },
      { status: 401 },
    );
  }

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  const status = typeof body.status === "string" ? body.status : "";
  const result = await updateLeadStatus(params.id, status, admin.email);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.note ?? "No se pudo actualizar." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, lead: result.lead });
}

/**
 * Archiva un lead (soft delete). Idempotente: archivar un lead ya
 * archivado también devuelve 200 (registra audit entry adicional).
 *
 * Hard delete deshabilitado por compliance. Si el cliente envía
 * `?mode=hard` explícitamente, devolvemos 400 con mensaje claro.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin." },
      { status: 401 },
    );
  }

  // Hard delete explícitamente bloqueado. Si llega, devolvemos 400 con
  // explicación en vez de ignorar silenciosamente.
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");
  if (mode === "hard") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Hard delete deshabilitado por compliance (LGPD/LFPDPPP). Use archivado lógico (status='archived') o anonimización para derecho al olvido.",
      },
      { status: 400 },
    );
  }

  const result = await archiveLead(params.id, admin.email);

  if (!result.ok) {
    // Conflict (otro writer cambió el status) → 409. Otro error → 400.
    const isConflict = result.note?.startsWith("Conflicto");
    return NextResponse.json(
      { ok: false, error: result.note ?? "No se pudo archivar." },
      { status: isConflict ? 409 : 400 },
    );
  }
  return NextResponse.json({ ok: true, lead: result.lead });
}
