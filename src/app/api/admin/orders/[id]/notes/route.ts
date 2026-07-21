/**
 * /api/admin/orders/[id]/notes — notas internas del pedido.
 *
 * GET   /api/admin/orders/[id]/notes
 *   -> { ok, notes: ServiceOrderNote[] }
 *
 * POST  /api/admin/orders/[id]/notes
 *   body: { body: string, noteType?: OrderNoteType, isPinned?: boolean }
 *   -> { ok, note: ServiceOrderNote }
 *
 * Server-only, admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { addOrderNote } from "@/lib/services";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapServiceOrderNoteRow } from "@/lib/services/mappers";
import type { ServiceOrderNoteRow } from "@/lib/services/mappers";
import type { CreateOrderNoteInput, OrderNoteType } from "@/types/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_NOTE_TYPES: OrderNoteType[] = [
  "general",
  "client_request",
  "blocker",
  "follow_up",
];

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

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("service_order_notes")
    .select("*")
    .eq("order_id", params.id)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Error listando notas: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    notes: ((data as ServiceOrderNoteRow[] | null) ?? []).map(
      mapServiceOrderNoteRow,
    ),
  });
}

export async function POST(
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

  let body: Partial<CreateOrderNoteInput>;
  try {
    body = (await req.json()) as Partial<CreateOrderNoteInput>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  if (body.noteType && !VALID_NOTE_TYPES.includes(body.noteType)) {
    return NextResponse.json(
      { ok: false, error: `noteType inválido: ${body.noteType}` },
      { status: 400 },
    );
  }

  const result = await addOrderNote(
    params.id,
    {
      body: body.body ?? "",
      noteType: body.noteType,
      isPinned: body.isPinned,
    },
    admin.email,
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, note: result.data });
}
