import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  bulkUpdateLeads,
  type BulkAction,
} from "@/lib/crm/leads-admin-server";
import { recordAndCheckRateLimit } from "@/lib/api/rate-limit";

/**
 * POST /api/admin/leads/bulk
 *   Body: { leadIds: string[], action: 'status'|'owner'|'archive', value?: string }
 *
 * Aplica una acción en bulk con optimistic locking. Replica el patrón de
 * `updateLeadStatus` (1 SELECT previo + N UPDATEs con WHERE prev_status)
 * para no pisar cambios concurrentes del bot de WhatsApp.
 *
 * Rate limit per-admin: 10 req/min. Esto evita que un admin autenticado
 * pueda disparar 100 bulks de 50 leads cada uno en 1 minuto (lo cual
 * saturaría Supabase). Key = `bulk:${adminEmail}`.
 *
 * Respuesta:
 *   200 { ok: true, succeeded, conflicted, failed, bulkActionId, errors? }
 *   400 si falta leadIds/action/value inválido.
 *   401 si no admin.
 *   429 si rate limit excedido.
 *   500 si error inesperado.
 *
 * Server-only. Defense-in-depth: middleware ya validó admin; aquí re-validamos.
 */

export const dynamic = "force-dynamic";

interface BulkRequestBody {
  leadIds?: unknown;
  action?: unknown;
  value?: unknown;
}

function isBulkAction(v: unknown): v is BulkAction {
  return v === "status" || v === "archive" || v === "owner";
}

export async function POST(req: NextRequest) {
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

  // Rate limit per-admin: 10 req/min. Key por email (no por IP) porque
  // múltiples admins pueden compartir NAT y un mismo admin puede
  // cambiar de IP.
  const rl = recordAndCheckRateLimit(`bulk:${admin.email}`, {
    windowMs: 60_000,
    maxCalls: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Rate limit excedido: máximo 10 bulk operations por minuto. Reintenta en ${Math.ceil(rl.resetMs / 1000)}s.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
        },
      },
    );
  }

  let body: BulkRequestBody;
  try {
    body = (await req.json()) as BulkRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  // Validación de input.
  const leadIds = Array.isArray(body.leadIds)
    ? body.leadIds.filter((x): x is string => typeof x === "string")
    : [];
  if (leadIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "leadIds requerido (array no-vacío de UUIDs)." },
      { status: 400 },
    );
  }
  if (leadIds.length > 500) {
    return NextResponse.json(
      {
        ok: false,
        error: `Máximo 500 leads por bulk request (recibido ${leadIds.length}).`,
      },
      { status: 400 },
    );
  }
  if (!isBulkAction(body.action)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "action inválido. Valores permitidos: 'status', 'archive', 'owner'.",
      },
      { status: 400 },
    );
  }
  const value = typeof body.value === "string" ? body.value : "";

  const result = await bulkUpdateLeads(leadIds, body.action, value, admin.email);

  // Si TODO falló (ej. Supabase caída), devolvemos 500.
  // Si al menos uno tuvo éxito, devolvemos 200 con detalle.
  const status =
    result.succeeded === 0 && result.failed > 0 ? 500 : 200;

  return NextResponse.json(
    {
      ok: result.ok,
      totalRequested: result.totalRequested,
      succeeded: result.succeeded,
      conflicted: result.conflicted,
      failed: result.failed,
      bulkActionId: result.bulkActionId,
      errors: result.errors,
      note: result.note,
    },
    { status },
  );
}