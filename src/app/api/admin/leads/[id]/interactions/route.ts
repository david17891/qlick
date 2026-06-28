import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  createLeadInteraction,
  getLeadInteractions
} from "@/lib/crm/interactions-server";

/**
 * Tipos de Supabase (enums public.interaction_channel / interaction_direction).
 * Source of truth = schema de DB. El UI los mapea a labels en español.
 */
type InteractionChannel = "whatsapp" | "email" | "phone" | "form" | "system";
type InteractionDirection = "inbound" | "outbound" | "system";

/**
 * Interacciones de un lead (contactos outbound + respuestas inbound + sistema).
 *
 * Bloque 2E (Fase 4): historial de contactos WhatsApp en el drawer del CRM.
 *
 * GET   /api/admin/leads/[id]/interactions  -> lista (desc por created_at)
 * POST  /api/admin/leads/[id]/interactions  -> crea { summary, channel?, direction? }
 *
 * Server-only, admin (defensa en profundidad).
 */

export const dynamic = "force-dynamic";

const VALID_CHANNELS: InteractionChannel[] = ["whatsapp", "email", "phone", "form", "system"];
const VALID_DIRECTIONS: InteractionDirection[] = ["inbound", "outbound", "system"];

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
  const interactions = await getLeadInteractions(params.id);
  return NextResponse.json({ ok: true, interactions });
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

  let body: { summary?: unknown; channel?: unknown; direction?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!summary) {
    return NextResponse.json(
      { ok: false, error: "El resumen es obligatorio." },
      { status: 400 },
    );
  }

  const channel: InteractionChannel | undefined =
    typeof body.channel === "string" && (VALID_CHANNELS as string[]).includes(body.channel)
      ? (body.channel as InteractionChannel)
      : undefined;

  const direction: InteractionDirection | undefined =
    typeof body.direction === "string" && (VALID_DIRECTIONS as string[]).includes(body.direction)
      ? (body.direction as InteractionDirection)
      : undefined;

  const result = await createLeadInteraction(
    {
      leadId: params.id,
      channel,
      direction,
      summary,
    },
    admin.email,
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "No se pudo registrar la interacción." },
      { status: 400 },
    );
  }

  // Devolvemos la lista actualizada para que el cliente refresque en una sola llamada.
  const interactions = await getLeadInteractions(params.id);
  return NextResponse.json({ ok: true, interactions });
}