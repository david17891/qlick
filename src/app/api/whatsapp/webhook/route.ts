/**
 * Endpoint HTTP del webhook de WhatsApp (Cloud API de Meta).
 *
 * GET  → handshake de verificación (hub.mode=subscribe + hub.verify_token).
 *        Devuelve `hub.challenge` como texto plano si todo OK.
 *
 * POST → notificación de mensaje entrante o status update.
 *        1. Valida firma X-Hub-Signature-256 si WHATSAPP_WEBHOOK_SECRET está
 *           seteada. Si no, log warning y sigue (dev friendly).
 *        2. Parsea el payload con `handleWebhookPayload`.
 *        3. Persiste el inbound en `lead_whatsapp_conversations`.
 *        4. Encola el procesamiento del bot (fire-and-forget).
 *        5. Responde 200 inmediatamente (Meta reintenta si >5s).
 *
 * Idempotencia: la columna `whatsapp_message_id` es UNIQUE; un re-entrega
 * de Meta genera un 23505 que se ignora silenciosamente.
 *
 * El handler NO espera a que el bot termine (sería bloquear la respuesta
 * de Meta y disparar re-intentos). El bot corre async en background.
 *
 * @server
 */

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

import {
  handleWebhookPayload
} from "../../../../lib/whatsapp/webhooks/handler";
import { verifyWebhook } from "../../../../lib/whatsapp/webhooks/verify";
import { checkWebhookSignatureGate } from "../../../../lib/whatsapp/webhooks/verify-signature";
import type {
  IncomingWhatsAppMessage,
  WhatsAppMessageStatus
} from "../../../../lib/whatsapp/webhooks/types";
import { normalizePhone } from "../../../../lib/crm/phone-utils";
import { processInboundMessage } from "../../../../lib/whatsapp/bot-engine";
import { debugLog, errorLog, infoLog } from "../../../../lib/log";

// Next.js: este endpoint siempre corre en Node runtime (necesita crypto).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Constantes                                                          */
/* ------------------------------------------------------------------ */

const VALID_STATUSES: readonly WhatsAppMessageStatus[] = [
  "sent",
  "delivered",
  "read",
  "failed",
  "deleted",
  "unknown"
];

/* ------------------------------------------------------------------ */
/*  GET — verificación del webhook                                     */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode") ?? undefined;
  const challenge = searchParams.get("hub.challenge") ?? undefined;
  const token = searchParams.get("hub.verify_token") ?? undefined;

  const result = verifyWebhook(mode, challenge, token);
  if (!result.ok || !result.challenge) {
    return new NextResponse(result.note, { status: 403 });
  }
  return new NextResponse(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" }
  });
}

/* ------------------------------------------------------------------ */
/*  POST — recepción de notificaciones                                 */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  // 1. Leer el body crudo (necesario para validar la firma HMAC).
  const rawBody = await req.text();

  // 2. Validar firma / hard-fail gate (extraído a verify-signature.ts
  //    para hacerlo testeable sin importar `next/server`).
  // FIX 2026-07-04 (auditoria nocturna, security gate): antes, si el
  // secret no estaba seteado, el webhook seguía procesando sin validar
  // firma (con solo un infoLog). En produccion esto = endpoint publico
  // y un atacante podria inyectar mensajes arbitrarios creando leads
  // falsos en DB. Misma remediacion que /api/cron/*: hard-fail 503 en
  // produccion si falta el secret. En dev permitimos skip.
  const gate = checkWebhookSignatureGate(req, rawBody);
  if (!gate.ok) {
    if (gate.status === 503) {
      // Solo loggeamos el 503 (es señal de config missing, no de ataque).
      errorLog("[whatsapp/webhook] gate 503", { message: gate.message });
    }
    return NextResponse.json(
      { ok: false, message: gate.message },
      { status: gate.status }
    );
  }

  // 3. Parsear payload.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, message: "Body inválido (JSON requerido)." },
      { status: 400 }
    );
  }

  const parsed = handleWebhookPayload(payload);

  // 4. Persistir inbound messages + encolar bot (fire-and-forget).
  const supabase = await getSupabase();
  const queued: string[] = [];

  // Contadores para observabilidad del fix outbound idempotency.
  let skippedDuplicates = 0;
  let processedNew = 0;

  for (const msg of parsed.messages) {
    const result = await persistInboundIfPossible(supabase, msg);
    // FIX 2026-07-04 (auditoria nocturna, outbound idempotency):
    // Si Meta reentrego este webhook (kind='duplicate'), NO corremos el
    // bot de nuevo. Sin este check, el bot enviaba el mismo reply al
    // usuario DOS veces (con el phantom row fix previo, persistiamos
    // correctamente, pero el outbound a Meta NO estaba deduped).
    //
    // El bot SI corre en:
    //  - kind='new'       → primera entrega de Meta
    //  - kind='errored'   → no pudimos persistir (Supabase caido); falla
    //                       silenciosa pero el bot intenta responder igual
    //                       porque el inbound quedo sin registrar y el
    //                       usuario todavia espera una respuesta.
    if (result.kind === "duplicate") {
      skippedDuplicates++;
      infoLog(
        "[whatsapp/webhook] idempotency: skip bot (duplicate wamid)",
        { wamid: result.wamid }
      );
      continue;
    }
    if (result.kind === "new") {
      processedNew++;
      queued.push(result.wamid ?? msg.messageId);
    }
    // Bloqueamos la respuesta hasta 8s para que el bot termine de mandar
    // el reply por la API de Meta antes de devolver 200. Margen < 10s
    // (umbral de retry de Meta).
    //
    // Es preferible a `void` porque con `void` Vercel mata el container
    // post-response y el usuario nunca recibe respuesta.
    await Promise.race([
      processInboundSafely(msg),
      new Promise<unknown>((resolve) => setTimeout(resolve, 8000))
    ]);
  }

  // 5. Persistir status updates (no gatillan bot).
  const statusCount = await persistStatusUpdatesIfAny(supabase, payload);

  return NextResponse.json({
    ok: true,
    parsedMessages: parsed.messages.length,
    persisted: processedNew,
    duplicatesSkipped: skippedDuplicates,
    statusUpdates: statusCount,
    note: parsed.note
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function getSupabase(): Promise<SupabaseClient<Database> | null> {
  const { checkSupabaseConfig } = await import("../../../../lib/supabase/health");
  const { createSupabaseAdminClient } = await import("../../../../lib/supabase/admin");
  if (!checkSupabaseConfig().configured) return null;
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

/**
 * Inserta el mensaje inbound en `lead_whatsapp_conversations` vía
 * upsert idempotente, y reporta si era NUEVO o un DUPLICATE de Meta.
 *
 * Outbound idempotency fix (auditoria 2026-07-04): el caller usa
 * `isDuplicate` para SKIPPEAR el bot en retries de Meta — si ya
 * procesamos este wamid, el bot NO corre de nuevo (y por lo tanto
 * NO envia otra respuesta al usuario).
 *
 * Retorna `{ kind: 'new' | 'duplicate' | 'errored' }`:
 *  - 'new'       → row insertada, wamid es este msg.messageId
 *  - 'duplicate' → row ya existia (ON CONFLICT DO NOTHING)
 *  - 'errored'   → phone invalido, supabase null, o error real
 */
type PersistResult = { kind: "new" | "duplicate" | "errored"; wamid: string | null };

async function persistInboundIfPossible(
  supabase: SupabaseClient<Database> | null,
  msg: IncomingWhatsAppMessage
): Promise<PersistResult> {
  if (!supabase) return { kind: "errored", wamid: null };
  const phone = normalizePhone(msg.from);
  if (!phone) return { kind: "errored", wamid: null };
  // FIX 2026-07-04 (auditoria nocturna): mapear el tipo real del mensaje
  // al enum del CHECK constraint (text|template|image|document|audio|
  // interactive) en lugar de forzar 'interactive' para todo. Para tipos
  // fuera del enum (button legacy, sticker, voice, etc.) caemos a
  // 'interactive' como fallback seguro.
  const VALID_INBOUND_TYPES: ReadonlySet<string> = new Set([
    "text",
    "template",
    "image",
    "document",
    "audio",
    "interactive"
  ]);
  // FIX 2026-07-04 (outbound idempotency): cambiar de .insert() a .upsert()
  // con onConflict sobre whatsapp_message_id e ignoreDuplicates:true.
  // - Si el row NO existe: se inserta y se devuelve (kind='new')
  // - Si ya existe: ON CONFLICT DO NOTHING → no devuelve nada (kind='duplicate')
  // Esto le permite al webhook distinguir 'Meta reentrega el mismo webhook'
  // (skip bot) de 'mensaje nuevo' (correr bot).
  const { data, error } = await supabase
    .from("lead_whatsapp_conversations" as never)
    .upsert(
      {
        lead_id: null, // se completa en el bot engine cuando se resuelve el lead
        phone_normalized: phone,
        direction: "inbound",
        message_type: VALID_INBOUND_TYPES.has(msg.type)
          ? msg.type
          : "interactive",
        body: msg.text ?? null,
        whatsapp_message_id: msg.messageId,
        metadata: {
          timestamp: msg.timestamp,
          contactName: msg.contactName
        }
      } as never,
      { onConflict: "whatsapp_message_id", ignoreDuplicates: true } as never
    )
    .select("id")
    .maybeSingle();
  if (error) {
    errorLog("[whatsapp/webhook] persistInbound falló", {
      code: (error as { code?: string }).code
    });
    return { kind: "errored", wamid: msg.messageId };
  }
  // data presente → row insertada (nueva). data null → row ya existia (duplicate).
  return data
    ? { kind: "new", wamid: msg.messageId }
    : { kind: "duplicate", wamid: msg.messageId };
}

/**
 * Persiste status updates de Meta (delivered/read/failed) en la misma tabla,
 * con direction='outbound' y message_type=metadata.status.
 *
 * Shape de Meta:
 *   entry[].changes[].value.statuses[] = [{ id, status, ... }]
 */
async function persistStatusUpdatesIfAny(
  supabase: SupabaseClient<Database> | null,
  payload: unknown
): Promise<number> {
  if (!supabase) return 0;
  const statuses = extractStatuses(payload);
  let count = 0;
  for (const s of statuses) {
    if (!VALID_STATUSES.includes(s.status)) continue;
    const phone = s.recipientId ? normalizePhone(s.recipientId) : null;
    const { error } = await supabase
      .from("lead_whatsapp_conversations" as never)
      .insert({
        lead_id: null,
        phone_normalized: phone,
        direction: "outbound",
        // FIX 2026-07-04 (auditoria nocturna): el CHECK constraint de
        // message_type NO acepta 'metadata' (cae en 23514 check_violation),
        // asi que los status updates fallaban silenciosamente desde el
        // inicio. Usamos 'interactive' como tipo neutral, y el campo
        // `metadata.status` ya distingue el evento (sent/delivered/read/
        // failed). TODO Fase 7: agregar tipo dedicado 'status_update' al
        // enum si vale la pena semánticamente.
        message_type: "interactive",
        body: null,
        whatsapp_message_id: s.id,
        metadata: {
          status: s.status,
          timestamp: s.timestamp
        }
      } as never);
    if (!error) {
      count++;
    } else if ((error as { code?: string }).code === "23505") {
      // FIX 2026-07-04 (auditoria nocturna): Meta reentrego el mismo wamid
      // en un status update. El row ya existe (outbound del bot o status
      // previo). Idempotente: contamos como procesado y seguimos. Mismo
      // patron que persistInboundIfPossible (linea ~228).
      count++;
    }
  }
  return count;
}

interface MetaStatus {
  id: string;
  status: WhatsAppMessageStatus;
  recipientId?: string;
  timestamp?: string;
}

/** Extrae el array de statuses del payload (silencioso ante shapes raros). */
function extractStatuses(payload: unknown): MetaStatus[] {
  try {
    const p = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{
              id?: string;
              status?: string;
              recipient_id?: string;
              timestamp?: string;
            }>;
          };
        }>;
      }>;
    };
    const out: MetaStatus[] = [];
    for (const entry of p.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const st of change.value?.statuses ?? []) {
          if (!st.id || !st.status) continue;
          out.push({
            id: st.id,
            status: st.status as WhatsAppMessageStatus,
            recipientId: st.recipient_id,
            timestamp: st.timestamp
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Envoltorio del bot que captura errores para no romper el webhook. */
async function processInboundSafely(
  msg: IncomingWhatsAppMessage
): Promise<void> {
  infoLog("[whatsapp/webhook] processInboundSafely START", {
    messageId: msg.messageId,
    from: msg.from
  });
  try {
    await processInboundMessage(msg);
    infoLog("[whatsapp/webhook] processInboundSafely END OK", {
      messageId: msg.messageId
    });
  } catch (err) {
    errorLog("[whatsapp/webhook] processInboundMessage lanzó excepción", {
      messageId: msg.messageId,
      from: msg.from,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
