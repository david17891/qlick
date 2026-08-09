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
import { getWhatsAppSessionWindow } from "@/lib/whatsapp/session-window";

interface RouteParams {
  params: { leadId: string };
}

interface RequestBody {
  body?: string;
  /** Solo para plantillas aprobadas de Meta cuando la ventana está cerrada. */
  templateName?: string;
  templateLanguage?: string;
  /** Motivo operativo; marketing exige consentimiento explícito. */
  contactPurpose?: "service" | "transactional" | "marketing";
  /** Identificador del intento generado por el cliente para trazabilidad. */
  clientRequestId?: string;
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_LENGTH = 4000;
const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,120}$/;
const TEMPLATE_LANGUAGE_RE = /^[a-z]{2,3}_[A-Z]{2}$/;

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
  const templateName =
    typeof body.templateName === "string" && body.templateName.trim().length > 0
      ? body.templateName.trim()
      : undefined;
  const templateLanguage =
    typeof body.templateLanguage === "string" && body.templateLanguage.trim().length > 0
      ? body.templateLanguage.trim()
      : undefined;
  const contactPurpose = body.contactPurpose ?? "service";
  const clientRequestId =
    typeof body.clientRequestId === "string"
      ? body.clientRequestId.trim().slice(0, 120)
      : undefined;
  if (!["service", "transactional", "marketing"].includes(contactPurpose)) {
    return NextResponse.json(
      { ok: false, error: "contactPurpose inválido." },
      { status: 400 },
    );
  }
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
  if (templateName && !TEMPLATE_NAME_RE.test(templateName)) {
    return NextResponse.json(
      { ok: false, error: "templateName inválido." },
      { status: 400 },
    );
  }
  if (templateLanguage && !TEMPLATE_LANGUAGE_RE.test(templateLanguage)) {
    return NextResponse.json(
      { ok: false, error: "templateLanguage inválido." },
      { status: 400 },
    );
  }

  // 1. Resolver lead → phone.
  const supabase = createSupabaseAdminClient();
  const { data: leadRow, error: leadErr } = await supabase
    .from("leads")
    .select("id, name, phone, phone_normalized, email, consent_to_contact")
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

  // Una respuesta manual de servicio no equivale a permiso de marketing.
  // Este gate evita que el rescate o una plantilla comercial contacte a
  // personas sin consentimiento explícito.
  if (
    contactPurpose === "marketing" &&
    (leadRow as { consent_to_contact?: boolean | null }).consent_to_contact !== true
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "MARKETING_CONSENT_REQUIRED",
        error: "El lead no tiene consentimiento explícito para contacto comercial.",
      },
      { status: 409 },
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

  // Meta solo permite texto libre dentro de las 24 horas posteriores al
  // último mensaje entrante del usuario. No intentamos enviar a ciegas:
  // fuera de ventana el admin debe usar una plantilla aprobada.
  const { data: lastInboundRow, error: lastInboundErr } = await supabase
    .from("lead_whatsapp_conversations" as never)
    .select("created_at" as never)
    .eq("lead_id" as never, params.leadId)
    .eq("direction" as never, "inbound")
    .is("deleted_at" as never, null)
    .order("created_at" as never, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastInboundErr) {
    return NextResponse.json(
      { ok: false, error: `No se pudo verificar la ventana de WhatsApp: ${lastInboundErr.message}` },
      { status: 500 },
    );
  }
  const session = getWhatsAppSessionWindow(
    (lastInboundRow as { created_at?: string } | null)?.created_at ?? null,
  );
  if (session.state !== "open" && !templateName) {
    return NextResponse.json(
      {
        ok: false,
        code: "WHATSAPP_24H_WINDOW_CLOSED",
        error:
          session.state === "closed"
            ? "La ventana de WhatsApp de 24 horas ya cerró. Usa una plantilla aprobada de Meta para reabrir el contacto."
            : "No hay un mensaje entrante reciente para abrir la ventana de WhatsApp. Usa una plantilla aprobada de Meta.",
        whatsappWindow: session,
      },
      { status: 409 },
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
    sendResult = await provider.send({
      to: phone,
      body: messageBody,
      templateName,
      templateLanguage,
    });
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
        message_type: templateName ? "template" : "text",
        body: messageBody,
        whatsapp_message_id: sendResult.externalId ?? null,
        metadata: {
          source: "admin_manual_send",
          actor_email: admin.email ?? "unknown",
          provider: sendResult.provider,
          demo: sendResult.demo ?? false,
          templateName: templateName ?? null,
          templateLanguage: templateLanguage ?? null,
          contactPurpose,
          clientRequestId: clientRequestId ?? null,
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
        contactPurpose,
        clientRequestId: clientRequestId ?? null,
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
      whatsappWindow: session,
      error: sendResult.ok ? undefined : sendResult.note,
    },
    { status: sendResult.ok ? 200 : 502 },
  );
}
