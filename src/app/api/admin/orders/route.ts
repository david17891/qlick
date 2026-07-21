/**
 * /api/admin/orders — colección.
 *
 * GET   /api/admin/orders
 *   query: ?status=pending_contact&status=confirmed (CSV) o repetir param
 *          ?serviceId=...&leadId=...&q=search
 *          ?limit=50&offset=0
 *   -> { ok, orders: ServiceOrder[], total: number }
 *
 * POST  /api/admin/orders
 *   body: CreateCheckoutInput + { leadId?: string, paymentMode?: ... }
 *   -> { ok, order: ServiceOrder }
 *
 * Server-only, admin. Bypass RLS via service role.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createOrder, listOrders } from "@/lib/services";
import type {
  CreateCheckoutInput,
  ListOrdersFilters,
  OrderStatus,
} from "@/types/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseStatuses(v: string | null): OrderStatus[] | undefined {
  if (!v) return undefined;
  const valid: OrderStatus[] = [
    "pending_contact",
    "contacted",
    "confirmed",
    "in_progress",
    "delivered",
    "closed",
    "cancelled",
  ];
  const list = v
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is OrderStatus => valid.includes(s as OrderStatus));
  return list.length > 0 ? list : undefined;
}

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url);
  const status = parseStatuses(url.searchParams.get("status"));
  const filters: ListOrdersFilters = {
    status,
    serviceId: url.searchParams.get("serviceId") ?? undefined,
    leadId: url.searchParams.get("leadId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : 50,
    offset: url.searchParams.get("offset")
      ? Number(url.searchParams.get("offset"))
      : 0,
  };

  const result = await listOrders(filters);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    orders: result.orders,
    total: result.total,
  });
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

  let body: Partial<CreateCheckoutInput> & { leadId?: string | null };
  try {
    body = (await req.json()) as Partial<
      CreateCheckoutInput & { leadId?: string | null }
    >;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  if (
    !body.serviceSlug?.trim() ||
    !body.variantSlug?.trim() ||
    !body.customerName?.trim() ||
    !body.customerEmail?.trim()
  ) {
    return NextResponse.json(
      { ok: false, error: "Faltan datos requeridos." },
      { status: 400 },
    );
  }

  const result = await createOrder(
    {
      serviceSlug: body.serviceSlug,
      variantSlug: body.variantSlug,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      customerNotes: body.customerNotes,
      paymentMode: body.paymentMode,
      scheduledAt: body.scheduledAt,
      leadId: body.leadId ?? null,
    },
    admin.email,
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error.includes("no existe") ? 404 : 400 },
    );
  }

  return NextResponse.json({ ok: true, order: result.data });
}
