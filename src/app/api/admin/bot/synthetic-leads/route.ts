/**
 * Sprint v0.9.x PR #3: endpoint CRUD para leads sintéticos del simulador.
 *
 * El simulador modo Real (BotSimulatorTab con toggle "Real") usa estos
 * endpoints para crear, listar y limpiar las personas sintéticas que
 * ejecuta contra el bot-engine.
 *
 * POST   /api/admin/bot/synthetic-leads   → crea un lead nuevo
 * GET    /api/admin/bot/synthetic-leads   → lista todos los sintéticos
 * DELETE /api/admin/bot/synthetic-leads   → borra TODOS (con cascade)
 *
 * Auth: `requireAdmin` (mismo patrón que el resto de endpoints admin).
 * El DELETE requiere un flag `confirm: true` en el body para evitar
 * borrados accidentales.
 *
 * @server
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  createSyntheticLead,
  listSyntheticLeads,
  deleteAllSyntheticLeads
} from "@/lib/whatsapp/synthetic-leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/* POST — crear un lead sintético                                       */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 }
    );
  }

  let body: { name?: string; phone?: string; sessionId?: string } = {};
  try {
    const raw = await req.json();
    if (raw && typeof raw === "object") body = raw as typeof body;
  } catch {
    // Body vacío es válido (todos los campos son opcionales).
  }

  try {
    const lead = await createSyntheticLead({
      createdBy: admin.email,
      ...(body.name ? { name: body.name } : {}),
      ...(body.phone ? { phone: body.phone } : {}),
      ...(body.sessionId ? { sessionId: body.sessionId } : {})
    });
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/* GET — listar leads sintéticos                                        */
/* ------------------------------------------------------------------ */

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 }
    );
  }

  try {
    const leads = await listSyntheticLeads();
    return NextResponse.json({ ok: true, leads, count: leads.length });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/* DELETE — borrar TODOS los sintéticos (con cascade)                  */
/* ------------------------------------------------------------------ */

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 }
    );
  }

  // FIX PR #3: el DELETE requiere confirmation explícita en el body
  // para evitar borrados accidentales desde la UI. La UI debe enviar
  // `{ confirm: true }` después de un segundo confirm del admin.
  let body: { confirm?: boolean } = {};
  try {
    const raw = await req.json();
    if (raw && typeof raw === "object") body = raw as typeof body;
  } catch {
    // Sin body → rechazamos.
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "DELETE requiere { confirm: true } en el body. Confirmación explícita obligatoria."
      },
      { status: 400 }
    );
  }

  const result = await deleteAllSyntheticLeads();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
