/**
 * Sprint v0.9.6 — Endpoint del Laboratorio IA / Simulador.
 *
 * POST /api/admin/bot/simulate
 *   Body: SimulateRequest (ver `src/lib/ai/simulator.ts`).
 *   Response: SimulateResponse con reply + telemetría completa.
 *   Auth: requireAdmin (mismo guard que el resto del admin).
 *
 * Reglas duras (verificadas por los tests de aislamiento):
 *   - Cero llamadas al provider de WhatsApp.
 *   - Cero escrituras en conversaciones / leads / contadores / reglas.
 *   - Cero incremento del contador diario de outbound.
 *
 * El endpoint delega toda la lógica al simulador y solo se encarga
 * de: auth + validación de payload + serialización JSON.
 *
 * @server
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import {
  simulateConversationTurn,
  type SimulateResponse
} from "@/lib/ai/simulator";
import { parseSimulateRequest } from "@/lib/ai/simulator-schema";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  // 1. Auth.
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 }
    );
  }

  // 2. Parse + validate.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const parsed = parseSimulateRequest(raw);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  // 3. Delegar al simulador.
  let result: SimulateResponse;
  try {
    result = await simulateConversationTurn(parsed.value);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `El simulador falló: ${err instanceof Error ? err.message : String(err)}`
      },
      { status: 500 }
    );
  }

  // 4. Responder.
  return NextResponse.json(result);
}

/* ------------------------------------------------------------------ */
/* GET handler (health check + documentación del schema)               */
/* ------------------------------------------------------------------ */

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    endpoint: "bot/simulate",
    method: "POST",
    schema: {
      message: "string (1-4,000 chars, requerido)",
      history:
        "Array<{ direction: 'inbound'|'outbound', body: string (1-4,000), timestamp?: ISO 8601 }> (max 50, default [])",
      modeOverride: "BotMode | null (opcional; valores: socratic_autopilot_v2, socratic_no_tools_v1, super_executive, human_first)",
      leadContext:
        "{ leadId: UUID, profile?: LeadProfile, isFirstMessage?: boolean } | null (opcional)",
      ignoreLeadPause: "boolean (default false)",
      includeEventContext: "boolean (default true)",
      includeInjectedRules: "boolean (default true)"
    },
    guarantees: [
      "CERO llamadas al provider de WhatsApp.",
      "CERO escrituras en conversaciones / leads / contadores / reglas.",
      "CERO incremento del contador de outbound."
    ]
  });
}
