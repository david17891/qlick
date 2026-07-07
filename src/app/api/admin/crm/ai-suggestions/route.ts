import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { generateSalesSuggestionsForLead } from "@/lib/crm/ai-sales-server";
import { recordAndCheckRateLimit } from "@/lib/api/rate-limit";

/**
 * GET /api/admin/crm/ai-suggestions?leadId=X
 *
 * Devuelve hasta 3 sugerencias de venta (close/value/reactivate)
 * personalizadas para el lead, con link wa.me listo para enviar.
 *
 * Rate limit per-admin: 30 req/min. Key=ai:${adminEmail}.
 *
 * Server-only.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado.", suggestions: [] },
      { status: 501 },
    );
  }

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin.", suggestions: [] },
      { status: 401 },
    );
  }

  const rl = recordAndCheckRateLimit(`ai:${admin.email}`, {
    windowMs: 60_000,
    maxCalls: 30,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Rate limit excedido: máximo 30 requests por minuto. Reintenta en ${Math.ceil(rl.resetMs / 1000)}s.`,
        suggestions: [],
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      },
    );
  }

  const url = new URL(req.url);
  const leadId = url.searchParams.get("leadId");
  if (!leadId) {
    return NextResponse.json(
      { ok: false, error: "leadId es requerido.", suggestions: [] },
      { status: 400 },
    );
  }

  try {
    const suggestions = await generateSalesSuggestionsForLead(leadId);
    return NextResponse.json({
      ok: true,
      suggestions,
      count: suggestions.length,
      demo: false,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/admin/crm/ai-suggestions] error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "Error generando sugerencias.", suggestions: [] },
      { status: 500 },
    );
  }
}