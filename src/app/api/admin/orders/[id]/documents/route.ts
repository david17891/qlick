/**
 * /api/admin/orders/[id]/documents — documentos del pedido.
 *
 * GET   /api/admin/orders/[id]/documents
 *   -> { ok, documents: ServiceOrderDocument[] }
 *
 * POST  /api/admin/orders/[id]/documents
 *   body: CreateOrderDocumentInput
 *   -> { ok, document: ServiceOrderDocument }
 *
 * NOTA: este endpoint NO sube archivos a storage. El caller (panel admin)
 * sube el archivo por su cuenta (Supabase Storage, S3, link externo) y
 * nos pasa la URL final + metadata. Eso mantiene el endpoint simple y
 * no acopla el panel a un backend de storage específico.
 *
 * Server-only, admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { addOrderDocument } from "@/lib/services";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapServiceOrderDocumentRow } from "@/lib/services/mappers";
import type { ServiceOrderDocumentRow } from "@/lib/services/mappers";
import type { CreateOrderDocumentInput, OrderDocumentType } from "@/types/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TYPES: OrderDocumentType[] = [
  "receipt",
  "certificate",
  "brief",
  "deliverable",
  "contract",
  "other",
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
    .from("service_order_documents")
    .select("*")
    .eq("order_id", params.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Error listando documentos: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    documents: ((data as ServiceOrderDocumentRow[] | null) ?? []).map(
      mapServiceOrderDocumentRow,
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

  let body: Partial<CreateOrderDocumentInput>;
  try {
    body = (await req.json()) as Partial<CreateOrderDocumentInput>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  if (!body.fileName?.trim() || !body.fileUrl?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Faltan fileName o fileUrl." },
      { status: 400 },
    );
  }

  if (body.fileType && !VALID_TYPES.includes(body.fileType)) {
    return NextResponse.json(
      { ok: false, error: `fileType inválido: ${body.fileType}` },
      { status: 400 },
    );
  }

  const result = await addOrderDocument(
    params.id,
    {
      fileName: body.fileName,
      fileUrl: body.fileUrl,
      fileType: body.fileType,
      fileSizeBytes: body.fileSizeBytes,
      mimeType: body.mimeType,
      description: body.description,
    },
    admin.email,
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, document: result.data });
}
