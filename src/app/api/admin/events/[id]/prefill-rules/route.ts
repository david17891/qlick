import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getEventById } from "@/lib/events/events-server";
import { prefillEventRules } from "@/lib/ai/prefill-event-rules";

/**
 * Prefill de reglas del bot via DeepSeek.
 *
 * POST /api/admin/events/[id]/prefill-rules
 *   body: { existingPersonality?: string }
 *   -> { ok: true, rules: { personality, rules[] } }
 *
 * NO escribe en la DB. Devuelve las reglas sugeridas para que el admin
 * las vea en la UI y las acepte/edite antes de guardar via updateEvent.
 *
 * Fase 7b (feat/event-bot-rules).
 */

export const dynamic = "force-dynamic";

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

  let body: { existingPersonality?: unknown } = {};
  try {
    body = (await req.json()) as { existingPersonality?: unknown };
  } catch {
    // Body vacio es OK (no existingPersonality).
  }

  const event = await getEventById(params.id);
  if (!event) {
    return NextResponse.json(
      { ok: false, error: "Evento no existe." },
      { status: 404 },
    );
  }

  const existingPersonality =
    typeof body.existingPersonality === "string"
      ? body.existingPersonality
      : event.eventRules?.personality ?? "";

  const result = await prefillEventRules({
    title: event.title,
    description: event.description ?? null,
    existingPersonality: existingPersonality || undefined
  });

  if (!result.ok || !result.rules) {
    return NextResponse.json(
      {
        ok: false,
        error: result.note,
        rawResponse: result.rawResponse ?? null
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    rules: result.rules,
    note: result.note
  });
}