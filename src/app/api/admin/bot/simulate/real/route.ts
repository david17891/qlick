/**
 * Sprint v0.9.x PR #3: endpoint para el modo "Real" del simulador.
 *
 * A diferencia del modo Sandbox (que solo invoca al LLM con system
 * prompt override), el modo Real ejecuta el flow completo del bot:
 *
 *   1. Verifica que el leadId corresponde a un lead sintético
 *      (simulation_source = "admin_lab"). Rechaza si es un lead real.
 *   2. Construye un `IncomingWhatsAppMessage` con el phone del lead
 *      sintético.
 *   3. Llama a `processInboundMessage` directamente (sin pasar por el
 *      handshake de Meta ni por el endpoint HTTP del webhook).
 *   4. Devuelve el `BotProcessResult` + telemetría adicional.
 *
 * El phone sintético (`+52555555XX`) NO existe en Meta, así que el
 * provider real va a fallar el envío outbound. Ese error queda loggeado
 * en `lead_whatsapp_conversations.metadata.error_note` para que David
 * pueda auditar.
 *
 * Auth: `requireAdmin` + lead sintético (no se puede simular contra
 * leads reales para evitar contaminación del CRM).
 *
 * Rate limit (FIX 2026-07-14): el endpoint valida que la sesión de
 * simulación no exceda 100 turnos por lead sintético (defense in depth
 * contra loops accidentales).
 *
 * @server
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { processInboundMessage } from "@/lib/whatsapp/bot-engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  SIMULATION_SOURCE_ADMIN_LAB
} from "@/lib/whatsapp/synthetic-leads";
import type { IncomingWhatsAppMessage } from "@/lib/whatsapp/webhooks/types";
import { errorLog, infoLog } from "@/lib/log";
import { normalizePhone } from "@/lib/crm/phone-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TURNS_PER_SYNTHETIC_LEAD = 100;

interface SimulateRealRequest {
  leadId: string;
  body: string;
  /** Opcional: timestamp sintético. Default: Date.now(). */
  timestamp?: string;
}

interface SimulateRealResponse {
  ok: boolean;
  /** Lo que el LLM decidió (intent detectado, response_kind, etc.). */
  botResult: {
    ok: boolean;
    intent: string | null;
    leadId: string | null;
    responseKind: string;
    responsePreview: string | null;
    note: string;
  };
  /** Info del lead sintético (para UI). */
  lead: {
    id: string;
    phoneNormalized: string;
    name: string;
  };
  /** Lo que el provider intentó enviar a Meta (siempre falla porque
   *  el phone sintético no existe). */
  providerAttempt: {
    attempted: boolean;
    errorMessage: string | null;
  };
  /** Latencia total del flow. */
  latencyMs: number;
  note?: string;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 }
    );
  }

  let body: SimulateRealRequest;
  try {
    body = (await req.json()) as SimulateRealRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 }
    );
  }

  if (!body.leadId || typeof body.leadId !== "string") {
    return NextResponse.json(
      { ok: false, error: "Falta leadId (debe ser UUID de un lead sintético)." },
      { status: 400 }
    );
  }
  if (!body.body || typeof body.body !== "string" || body.body.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Falta body (mensaje del lead sintético)." },
      { status: 400 }
    );
  }

  // 1. Cargar el lead y verificar que es sintético.
  const supabase = createSupabaseAdminClient();
  const { data: lead, error: leadErr } = await supabase
    .from("leads" as never)
    .select("id, phone_normalized, name, simulation_source" as never)
    .eq("id" as never, body.leadId as never)
    .maybeSingle();

  if (leadErr || !lead) {
    return NextResponse.json(
      { ok: false, error: `Lead no encontrado: ${leadErr?.message ?? "not found"}` },
      { status: 404 }
    );
  }

  const leadRow = lead as {
    id: string;
    phone_normalized: string;
    name: string;
    simulation_source: string | null;
  };

  if (leadRow.simulation_source !== SIMULATION_SOURCE_ADMIN_LAB) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "El lead NO es sintético. El modo Real solo opera contra leads creados por el laboratorio (simulation_source='admin_lab')."
      },
      { status: 403 }
    );
  }

  // 2. Rate limit defense in depth: contar turnos previos de este lead.
  //    (best-effort: si falla, dejamos pasar.)
  const { count: priorTurns } = await supabase
    .from("lead_whatsapp_conversations" as never)
    .select("id" as never, { count: "exact", head: true } as never)
    .eq("lead_id" as never, leadRow.id as never)
    .eq("direction" as never, "inbound" as never);

  if (typeof priorTurns === "number" && priorTurns > MAX_TURNS_PER_SYNTHETIC_LEAD) {
    return NextResponse.json(
      {
        ok: false,
        error: `Rate limit: el lead sintético ya tiene ${priorTurns} turnos. Limpia el lead y crea uno nuevo (máximo ${MAX_TURNS_PER_SYNTHETIC_LEAD} turnos por sesión).`
      },
      { status: 429 }
    );
  }

  // 3. Construir el IncomingWhatsAppMessage.
  const phone = normalizePhone(leadRow.phone_normalized) ?? leadRow.phone_normalized;
  const message: IncomingWhatsAppMessage = {
    messageId: `sim_real_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from: phone,
    timestamp: body.timestamp ?? new Date().toISOString(),
    type: "text",
    text: body.body.trim(),
    contactName: leadRow.name
  };

  // 4. Ejecutar processInboundMessage (el flow completo).
  const t0 = Date.now();
  let botResult;
  try {
    botResult = await processInboundMessage(message);
  } catch (err) {
    errorLog("[simulate-real] processInboundMessage lanzó", {
      leadId: leadRow.id,
      error: err instanceof Error ? err.message : String(err)
    });
    return NextResponse.json(
      {
        ok: false,
        error: `processInboundMessage lanzó: ${
          err instanceof Error ? err.message : String(err)
        }`
      },
      { status: 500 }
    );
  }
  const latencyMs = Date.now() - t0;

  // 5. El provider real SIEMPRE falla porque el phone sintético no
  //    existe en Meta. Lo loggeamos en infoLog para que David lo vea.
  const providerFailed = botResult.ok === false || botResult.responseKind === "none";
  if (providerFailed) {
    infoLog("[simulate-real] provider falló (esperado para phone sintético)", {
      leadId: leadRow.id,
      phone,
      note: botResult.note
    });
  }

  const response: SimulateRealResponse = {
    ok: true,
    botResult: {
      ok: botResult.ok,
      intent: botResult.intent ?? null,
      leadId: botResult.leadId ?? null,
      responseKind: botResult.responseKind,
      responsePreview: botResult.responsePreview ?? null,
      note: botResult.note ?? ""
    },
    lead: {
      id: leadRow.id,
      phoneNormalized: phone,
      name: leadRow.name
    },
    providerAttempt: {
      attempted: true,
      errorMessage: providerFailed ? botResult.note : null
    },
    latencyMs,
    note: `Modo Real: flow completo ejecutado contra lead sintético. Provider ${
      providerFailed ? "falló (esperado)" : "envió OK (inusual)"
    }.`
  };

  return NextResponse.json(response);
}
