/**
 * /api/admin/orders/[id] — item.
 *
 * GET   /api/admin/orders/[id]
 *   -> { ok, order: ServiceOrderWithRelations }
 *
 * PATCH /api/admin/orders/[id]
 *   body: UpdateOrderInput
 *   -> { ok, order: ServiceOrder }
 *
 * DELETE /api/admin/orders/[id]
 *   -> { ok, note: 'Pedido cancelado.' }
 *
 * Borrar un pedido NO lo elimina físicamente (no hay DELETE policy
 * en cascada). Lo marca como 'cancelled' (soft delete) y registra
 * la razón. Esto preserva la historia y el timeline.
 *
 * Server-only, admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getOrderById, updateOrder, addOrderEvent } from "@/lib/services";
import type { UpdateOrderInput } from "@/types/services";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
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

  const order = await getOrderById(params.id);
  if (!order) {
    return NextResponse.json(
      { ok: false, error: "Pedido no existe." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, order });
}

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

  let body: UpdateOrderInput;
  try {
    body = (await req.json()) as UpdateOrderInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  const result = await updateOrder(params.id, body, admin.email);
  if (!result.ok) {
    const status = result.error === "Pedido no existe." ? 404 : 400;
    return NextResponse.json(
      { ok: false, error: result.error },
      { status },
    );
  }

  return NextResponse.json({ ok: true, order: result.data });
}

export async function DELETE(
  _req: NextRequest,
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

  // Soft delete: marcar como cancelled con razón "Pedido eliminado por admin".
  const result = await updateOrder(
    params.id,
    {
      status: "cancelled",
      cancellationReason: `Pedido eliminado por ${admin.email}.`,
    },
    admin.email,
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error === "Pedido no existe." ? 404 : 400 },
    );
  }

  // Log adicional de system event.
  await addOrderEvent(params.id, {
    type: "status_change",
    actorId: admin.email,
    actorType: "admin",
    payload: { kind: "soft_delete", from: "active", to: "cancelled" },
  });

  return NextResponse.json({ ok: true, note: "Pedido cancelado." });
}
