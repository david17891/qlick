import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  listRealConversations,
  getRealConversationForLead,
  appendConversationMessage,
  softDeleteConversation,
} from "@/lib/crm/conversations-server";
import { recordAndCheckRateLimit } from "@/lib/api/rate-limit";

/**
 * GET /api/admin/crm/conversations
 *   Query params:
 *     leadId=<uuid>  → devuelve solo la conversación de ese lead
 *                       (lo usa LeadDetailDrawer al abrir un chat).
 *
 * Sin `leadId`: devuelve todas las conversaciones ordenadas por
 * `updatedAt DESC`. Cada conversación trae sus mensajes reales
 * (`lead_whatsapp_conversations` + `lead_interactions`).
 *
 * Rate limit per-admin: 30 req/min. Key=conv:${adminEmail}. Este endpoint
 * se refresca mucho desde el panel admin (cada vez que el admin abre un
 * lead o cambia de sección) pero sigue siendo caro (2 queries + map).
 *
 * POST /api/admin/crm/conversations
 *   Body JSON: { leadId, body, direction, phoneNormalized? }
 *
 * Registra manualmente un mensaje de texto en la conversación de un
 * lead. Si el lead no tenía historial, este es el primer mensaje
 * (la conversación se materializa al insertar). FIX 2026-07-06
 * (conversaciones v2): David pidió poder registrar contactos que
 * llegan por canales fuera del bot (WhatsApp directo al admin, voz,
 * email) — solo texto por ahora.
 *
 * DELETE /api/admin/crm/conversations?leadId=<uuid>
 *   Body opcional: { reason?: string }
 *
 * Soft-delete de TODA la conversación del lead (mensajes de
 * `lead_whatsapp_conversations`). Preserva los rows (compliance LGPD)
 * y oculta de la UI. Idempotente.
 *
 * Server-only.
 */

export const dynamic = "force-dynamic";

/* UUID v4-ish shape check (DB constraint enforces uuid type, pero
 * validamos server-side para no gastar round-trip a Supabase con
 * input basura). */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BODY_LENGTH = 4000;

async function requireAdminOrError(): Promise<
  { admin: { email: string } } | { response: NextResponse }
> {
  if (!checkSupabaseConfig().configured) {
    return {
      response: NextResponse.json(
        { ok: false, error: "Supabase no configurado (modo demo)." },
        { status: 501 },
      ),
    };
  }
  const admin = await requireAdmin();
  if (!admin) {
    return {
      response: NextResponse.json(
        { ok: false, error: "No autenticado como admin." },
        { status: 401 },
      ),
    };
  }
  return { admin };
}

/** Rate limit compartido entre GET/POST/DELETE de esta ruta. Mismo
 *  budget por minuto (30 req/min) que el GET original. */
function checkConvRateLimit(key: string): NextResponse | null {
  const rl = recordAndCheckRateLimit(`conv:${key}`, {
    windowMs: 60_000,
    maxCalls: 30,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Rate limit excedido: máximo 30 requests por minuto. Reintenta en ${Math.ceil(rl.resetMs / 1000)}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminOrError();
  if ("response" in guard) return guard.response;
  const { admin } = guard;

  const rl = checkConvRateLimit(admin.email);
  if (rl) return rl;

  const url = new URL(req.url);
  const leadId = url.searchParams.get("leadId");

  try {
    if (leadId) {
      if (!UUID_LIKE.test(leadId)) {
        return NextResponse.json(
          { ok: false, error: "leadId inválido." },
          { status: 400 },
        );
      }
      const conversation = await getRealConversationForLead(leadId);
      return NextResponse.json({
        ok: true,
        conversation: conversation ?? null,
        demo: false,
      });
    }

    const conversations = await listRealConversations();
    return NextResponse.json({
      ok: true,
      conversations,
      count: conversations.length,
      demo: false,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/admin/crm/conversations] GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "Error leyendo conversaciones.", conversations: [] },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/crm/conversations
 *   Body JSON: { leadId, body, direction, phoneNormalized? }
 *
 * FIX 2026-07-06 ~23:50 — registra un mensaje de texto manual en la
 * conversación del lead. body se trimea + valida (1-4000 chars).
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdminOrError();
  if ("response" in guard) return guard.response;
  const { admin } = guard;

  const rl = checkConvRateLimit(admin.email);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  // Validación.
  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  const rawBody = typeof body.body === "string" ? body.body.trim() : "";
  const direction = body.direction;
  const phoneNormalized =
    typeof body.phoneNormalized === "string"
      ? body.phoneNormalized.trim()
      : undefined;

  if (!UUID_LIKE.test(leadId)) {
    return NextResponse.json(
      { ok: false, error: "leadId inválido (UUID)." },
      { status: 400 },
    );
  }
  if (rawBody.length === 0) {
    return NextResponse.json(
      { ok: false, error: "body vacío." },
      { status: 400 },
    );
  }
  if (rawBody.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        error: `body demasiado largo (máximo ${MAX_BODY_LENGTH} caracteres, recibido ${rawBody.length}).`,
      },
      { status: 400 },
    );
  }
  if (direction !== "inbound" && direction !== "outbound") {
    return NextResponse.json(
      {
        ok: false,
        error: "direction inválido (esperado 'inbound' o 'outbound').",
      },
      { status: 400 },
    );
  }

  const result = await appendConversationMessage(
    {
      leadId,
      body: rawBody,
      direction,
      phoneNormalized,
    },
    admin.email,
  );

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400,
  });
}

/**
 * DELETE /api/admin/crm/conversations?leadId=<uuid>
 *   Body opcional: { reason?: string }
 *
 * FIX 2026-07-06 ~23:50 — soft-delete de toda la conversación del
 * lead preservando rows (compliance LGPD). Idempotente.
 */
export async function DELETE(req: NextRequest) {
  const guard = await requireAdminOrError();
  if ("response" in guard) return guard.response;
  const { admin } = guard;

  const rl = checkConvRateLimit(admin.email);
  if (rl) return rl;

  const url = new URL(req.url);
  const leadId = url.searchParams.get("leadId");

  if (!leadId || !UUID_LIKE.test(leadId)) {
    return NextResponse.json(
      { ok: false, error: "leadId inválido (UUID en query string)." },
      { status: 400 },
    );
  }

  // reason opcional — viene en body si se manda (POST-style DELETE).
  let reason: string | undefined;
  const contentLength = req.headers.get("content-length");
  if (contentLength && contentLength !== "0") {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      if (typeof body.reason === "string" && body.reason.trim().length > 0) {
        reason = body.reason.trim().slice(0, 500);
      }
    } catch {
      // Body opcional. Si viene mal formado, lo ignoramos (la query
      // string ya validó leadId que es lo crítico).
    }
  }

  const result = await softDeleteConversation(leadId, admin.email, reason);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400,
  });
}
