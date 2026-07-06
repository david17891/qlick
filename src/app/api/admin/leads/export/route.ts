import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { exportLeadsAsCsvStream } from "@/lib/crm/leads-csv-export";
import { recordAndCheckRateLimit } from "@/lib/api/rate-limit";

/**
 * GET /api/admin/leads/export
 *   Query params:
 *     include_all=true  → bypass del filtro de consent (default false)
 *     status=archived   → filtro opcional por status
 *     source=website    → filtro opcional por source
 *     owner_id=<uuid>   → filtro opcional por responsable
 *
 * Devuelve un stream CSV (`text/csv; charset=utf-8`) con `Transfer-Encoding:
 * chunked`. Pensado para cohorts grandes (20k+ leads) sin saturar la RAM
 * del serverless.
 *
 * Compliance:
 *   - Por default solo exporta leads con `consent_to_contact=true`
 *     (no podemos usar PII de leads sin consentimiento para outreach).
 *   - Bypass explícito con `include_all=true` (el admin asume
 *     responsabilidad legal).
 *   - Audit log obligatorio: `action='leads_export'`, metadata con
 *     filtros aplicados y conteo estimado.
 *
 * Rate limit per-admin: 5 req/min (más restrictivo que /bulk porque
 * cada export toca toda la tabla).
 *
 * Server-only.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkSupabaseConfig().configured) {
    return new Response(
      JSON.stringify({ ok: false, error: "Supabase no configurado (modo demo)." }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }

  const admin = await requireAdmin();
  if (!admin) {
    return new Response(
      JSON.stringify({ ok: false, error: "No autenticado como admin." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Rate limit per-admin: 5 req/min.
  const rl = recordAndCheckRateLimit(`export:${admin.email}`, {
    windowMs: 60_000,
    maxCalls: 5,
  });
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Rate limit excedido: máximo 5 exports por minuto. Reintenta en ${Math.ceil(rl.resetMs / 1000)}s.`,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
        },
      },
    );
  }

  const url = new URL(req.url);
  const includeAll = url.searchParams.get("include_all") === "true";
  const status = url.searchParams.get("status") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const ownerId = url.searchParams.get("owner_id") ?? undefined;

  try {
    const { stream } = await exportLeadsAsCsvStream(admin.email, {
      includeAll,
      status,
      source,
      ownerId,
    });

    const filename = `leads-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Transfer-Encoding: chunked lo setea Next automáticamente cuando
        // el body es un ReadableStream. Lo dejamos documentado para
        // claridad.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/admin/leads/export] error construyendo stream", {
      error: err instanceof Error ? err.message : String(err),
      actorEmail: admin.email,
    });
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Error construyendo el CSV.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}