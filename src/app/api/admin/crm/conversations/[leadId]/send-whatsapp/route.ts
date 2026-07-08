/**
 * POST /api/admin/crm/conversations/[leadId]/send-whatsapp
 *
 * FIX 2026-07-08 (sesión madrugada David "poder escribir y mandar
 * mensaje" en la conversación admin): el admin (David) puede responderle
 * manualmente al lead por WhatsApp desde el panel CRM. El endpoint:
 *
 *   1. Resuelve el lead y su phone_normalized.
 *   2. Llama al provider activo de WhatsApp (Cloud API / BSP / manual).
 *   3. Persiste el outbound en `lead_whatsapp_conversations` con
 *      whatsapp_message_id del provider.
 *   4. Audit log en `admin_audit_log`.
 *
 * Esto complementa el endpoint existente
 * `POST /api/admin/crm/conversations` que SOLO persiste (no envía).
 *
 * Auth: `requireAdmin()` (gate via ADMIN_EMAIL_ALLOWLIST).
 *
 * Request body:
 *   { body: string }   // requerido, ≤4000 chars
 *
 * Response:
 *   {
 *     ok: boolean,
 *     provider: string,
 *     demo: boolean,
 *     externalId: string | null,
 *     messageId: string | null,  // id de la fila en lead_whatsapp_conversations
 *     error?: string,
 *   }
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/crm/audit-server";
import { getActiveWhatsAppProvider } from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/crm/phone-utils";

interface RouteParams {
  params: { leadId: string };
}

interface RequestBody {
  body?: string;
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_LENGTH = 4000;

export async function POST(req: NextRequest, { params }: RouteParams) {
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

  if (!UUID_LIKE.test(params.leadId)) {
    return NextResponse.json(
      { ok: false, error: "leadId inválido (UUID)." },
      { status: 400 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body JSON inválido." },
      { status: 400 },
    );
  }

  const messageBody = typeof body.body === "string" ? body.body.trim() : "";
  if (messageBody.length === 0) {
    return NextResponse.json(
      { ok: false, error: "body vacío." },
      { status: 400 },
    );
  }
  if (messageBody.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        error: `body demasiado largo (máximo ${MAX_BODY_LENGTH} caracteres, recibido ${messageBody.length}).`,
      },
      { status: 400 },
    );
  }

  // 1. Resolver lead → phone.
  const supabase = createSupabaseAdminClient();
  const { data: leadRow, error: leadErr } = await supabase
    .from("leads")
    .select("id, name, phone, phone_normalized, email")
    .eq("id", params.leadId)
    .maybeSingle();
  if (leadErr) {
    return NextResponse.json(
      { ok: false, error: `Lead lookup falló: ${leadErr.message}` },
      { status: 500 },
    );
  }
  if (!leadRow) {
    return NextResponse.json(
      { ok: false, error: "Lead no existe." },
      { status: 404 },
    );
  }

  const phone =
    (leadRow as { phone_normalized?: string | null }).phone_normalized ||
    (leadRow.phone ? normalizePhone(leadRow.phone) : null);
  if (!phone) {
    return NextResponse.json(
      {
        ok: false,
        error: "El lead no tiene teléfono. No se puede enviar WhatsApp.",
      },
      { status: 400 },
    );
  }

  // 2. Enviar por WhatsApp vía provider activo.
  const provider = getActiveWhatsAppProvider();
  let sendResult: {
    ok: boolean;
    externalId?: string;
    provider: string;
    demo?: boolean;
    note: string;
  };
  try {
    sendResult = await provider.send({ to: phone, body: messageBody });
  } catch (err) {
    sendResult = {
      ok: false,
      provider: provider.name,
      demo: false,
      note: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. Persistir outbound en lead_whatsapp_conversations.
  let persistedMessageId: string | null = null;
  if (sendResult.ok) {
    const { data: convRow, error: convErr } = await supabase
      .from("lead_whatsapp_conversations" as never)
      .insert({
        lead_id: params.leadId,
        phone_normalized: phone,
        direction: "outbound",
        message_type: "text",
        body: messageBody,
        whatsapp_message_id: sendResult.externalId ?? null,
        metadata: {
          source: "admin_manual_send",
          actor_email: admin.email ?? "unknown",
          provider: sendResult.provider,
          demo: sendResult.demo ?? false,
        },
      } as never)
      .select("id")
      .maybeSingle();
    if (convErr) {
      // No rompemos el flow — el WhatsApp ya se mandó. Solo loggeamos.
      // eslint-disable-next-line no-console
      console.error(
        "[api/admin/conversations/send-whatsapp] persist outbound falló",
        {
          leadId: params.leadId,
          error: convErr.message,
        },
      );
    } else {
      persistedMessageId = (convRow as { id?: string } | null)?.id ?? null;
    }
  }

  // 4. Audit log (best-effort).
  try {
    await logAdminAction({
      action: "admin_send_whatsapp_manual",
      entity_type: "lead_whatsapp_conversation",
      entity_id: persistedMessageId ?? "no_persisted",
      actor_email: admin.email ?? "unknown",
      metadata: {
        leadId: params.leadId,
        leadName: leadRow.name,
        phoneMasked:
          phone.length > 6 ? `${phone.slice(0, 2)}****${phone.slice(-4)}` : "****",
        bodyLength: messageBody.length,
        provider: sendResult.provider,
        demo: sendResult.demo ?? false,
        ok: sendResult.ok,
        externalId: sendResult.externalId ?? null,
      },
    });
  } catch {
    /* swallow */
  }

  return NextResponse.json(
    {
      ok: sendResult.ok,
      provider: sendResult.provider,
      demo: sendResult.demo ?? false,
      externalId: sendResult.externalId ?? null,
      messageId: persistedMessageId,
      error: sendResult.ok ? undefined : sendResult.note,
    },
    { status: sendResult.ok ? 200 : 502 },
  );
}