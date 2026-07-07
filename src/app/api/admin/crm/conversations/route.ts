import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  listRealConversations,
  getRealConversationForLead,
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
 * Server-only.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase no configurado (modo demo).",
        conversations: [],
      },
      { status: 501 },
    );
  }

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin.", conversations: [] },
      { status: 401 },
    );
  }

  const rl = recordAndCheckRateLimit(`conv:${admin.email}`, {
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

  const url = new URL(req.url);
  const leadId = url.searchParams.get("leadId");

  try {
    if (leadId) {
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
    console.error("[api/admin/crm/conversations] error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "Error leyendo conversaciones.", conversations: [] },
      { status: 500 },
    );
  }
}