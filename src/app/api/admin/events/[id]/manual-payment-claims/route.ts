import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { registerManualPayment } from "@/lib/payments/manual-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkSupabaseConfig().configured) return NextResponse.json({ ok: false, error: "Supabase no configurado." }, { status: 501 });
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No autenticado como admin." }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_manual_payment_claims" as never)
    .select("id, lead_id, confirmation_id, whatsapp_message_id, receipt_attachment_id, phone_normalized, payment_method, claimed_amount_mxn, status, customer_note, reviewer_note, submitted_at, reviewed_at")
    .eq("event_id" as never, params.id as never)
    .order("submitted_at" as never, { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: "No se pudo cargar la cola de comprobantes." }, { status: 500 });
  const claims = await Promise.all((data ?? []).map(async (claim) => {
    const row = claim as { receipt_attachment_id?: string | null };
    if (!row.receipt_attachment_id) return claim;
    const { data: attachment } = await supabase
      .from("whatsapp_media_attachments" as never)
      .select("storage_bucket, storage_path, status, mime_type, byte_size")
      .eq("id" as never, row.receipt_attachment_id as never)
      .maybeSingle();
    const attachmentRow = attachment as { storage_bucket?: string; storage_path?: string | null; status?: string; mime_type?: string | null; byte_size?: number | null } | null;
    let receiptUrl: string | null = null;
    if (attachmentRow?.storage_bucket && attachmentRow.storage_path && attachmentRow.status === "stored") {
      const signed = await supabase.storage.from(attachmentRow.storage_bucket).createSignedUrl(attachmentRow.storage_path, 3600);
      receiptUrl = signed.data?.signedUrl ?? null;
    }
    return { ...(claim as object), receipt: { status: attachmentRow?.status ?? "pending", mimeType: attachmentRow?.mime_type ?? null, byteSize: attachmentRow?.byte_size ?? null, url: receiptUrl } };
  }));
  return NextResponse.json({ ok: true, claims });
}

interface ReviewBody {
  claimId?: unknown;
  action?: unknown;
  confirmationId?: unknown;
  amountMXN?: unknown;
  notes?: unknown;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!checkSupabaseConfig().configured) return NextResponse.json({ ok: false, error: "Supabase no configurado." }, { status: 501 });
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "No autenticado como admin." }, { status: 401 });
  let body: ReviewBody;
  try { body = (await req.json()) as ReviewBody; } catch { return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 }); }
  if (typeof body.claimId !== "string" || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json({ ok: false, error: "Se requiere claimId y action approve|reject." }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();
  const { data: claim, error: claimError } = await supabase
    .from("event_manual_payment_claims" as never)
    .select("id, event_id, confirmation_id, payment_method, claimed_amount_mxn, status")
    .eq("id" as never, body.claimId as never)
    .eq("event_id" as never, params.id as never)
    .maybeSingle();
  if (claimError || !claim) return NextResponse.json({ ok: false, error: "Comprobante no encontrado." }, { status: 404 });
  const row = claim as { id: string; event_id: string; confirmation_id?: string | null; payment_method: string; claimed_amount_mxn?: number | null; status: string };
  if (row.status === "approved" || row.status === "rejected") return NextResponse.json({ ok: false, error: "Este comprobante ya fue revisado." }, { status: 409 });

  if (body.action === "reject") {
    const { error } = await supabase.from("event_manual_payment_claims" as never).update({ status: "rejected", reviewer_email: admin.email, reviewer_note: typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null, reviewed_at: new Date().toISOString() } as never).eq("id" as never, row.id as never);
    if (error) return NextResponse.json({ ok: false, error: "No se pudo rechazar el comprobante." }, { status: 500 });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  const confirmationId = typeof body.confirmationId === "string" && body.confirmationId ? body.confirmationId : row.confirmation_id;
  const amountMXN = typeof body.amountMXN === "number" && Number.isFinite(body.amountMXN) ? body.amountMXN : Number(row.claimed_amount_mxn ?? 0);
  if (!confirmationId || amountMXN <= 0) return NextResponse.json({ ok: false, error: "Para aprobar, primero vincula una confirmación y el monto validado." }, { status: 400 });
  const payment = await registerManualPayment({
    eventId: params.id,
    confirmationId,
    method: row.payment_method === "transfer" ? "transfer" : "oxxo",
    amountMXN,
    notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "Comprobante revisado manualmente",
    actorEmail: admin.email,
  });
  if (!payment.ok || (payment.paymentStatus !== "paid" && payment.paymentStatus !== "partial")) {
    return NextResponse.json({ ok: false, error: payment.error ?? "El pago no quedó confirmado." }, { status: 400 });
  }
  const { error: updateError } = await supabase.from("event_manual_payment_claims" as never).update({ status: "approved", confirmation_id: confirmationId, claimed_amount_mxn: amountMXN, reviewer_email: admin.email, reviewer_note: typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null, reviewed_at: new Date().toISOString() } as never).eq("id" as never, row.id as never);
  if (updateError) return NextResponse.json({ ok: false, error: "El pago quedó registrado, pero no se pudo cerrar el comprobante; revisa la cola antes de reintentar." }, { status: 500 });
  return NextResponse.json({ ok: true, status: "approved", paymentStatus: payment.paymentStatus, paymentId: payment.paymentId, eventAccessId: payment.eventAccessId });
}
