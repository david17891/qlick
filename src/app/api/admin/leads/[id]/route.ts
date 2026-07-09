import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  updateLeadStatus,
  archiveLead,
  updateLeadFields,
  type LeadFieldUpdate,
} from "@/lib/crm/leads-admin-server";

/**
 * Operaciones admin sobre un lead concreto.
 *
 * PATCH /api/admin/leads/[id] { status?: LeadStatus, name?, email?, phone? }
 *   -> cambia el status y/o edita campos editables (name/email/phone).
 *      El body puede traer CUALQUIER combinación. La rama status va por
 *      `updateLeadStatus` (optimistic lock + audit con from/to reales);
 *      los otros campos van por `updateLeadFields` (diff + audit con
 *      before/after snapshots). Si el body trae ambos, se aplican ambos
 *      en orden: primero status (que es la fuente de verdad del bot),
 *      después campos (que son cosmética del admin).
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

  let body: { status?: unknown; name?: unknown; email?: unknown; phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  // 1. Status (si viene). Va primero porque es la "fuente de verdad" del bot.
  if (typeof body.status === "string" && body.status.length > 0) {
    const result = await updateLeadStatus(params.id, body.status, admin.email);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.note ?? "No se pudo actualizar el status." },
        { status: 400 },
      );
    }
  }

  // 2. Campos editables (si viene alguno). Después del status para que el
  //    lead devuelto al final tenga tanto status como name/email/phone
  //    frescos.
  const fieldPatch: LeadFieldUpdate = {};
  if (typeof body.name === "string") fieldPatch.name = body.name;
  if (typeof body.email === "string") fieldPatch.email = body.email;
  if (typeof body.phone === "string") fieldPatch.phone = body.phone;

  if (Object.keys(fieldPatch).length > 0) {
    const result = await updateLeadFields(params.id, fieldPatch, admin.email);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.note ?? "No se pudieron actualizar los campos." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, lead: result.lead });
  }

  // 3. Si solo vino status, ya respondimos arriba. Si vino vacío, error.
  if (typeof body.status !== "string") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Body vacío. Mandá al menos `status`, `name`, `email` o `phone`.",
      },
      { status: 400 },
    );
  }

  // Status-only path: re-leer para devolver el row con updated_at fresco.
  // updateLeadStatus ya devuelve el lead actualizado, pero como abajo
  // tenemos un solo return, lo recuperamos acá.
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "Status actualizado pero no se pudo releer." },
      { status: 500 },
    );
  }
  const { mapLeadRowToLead } = await import("@/lib/crm/leads-mapper");
  return NextResponse.json({ ok: true, lead: mapLeadRowToLead(data) });
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
