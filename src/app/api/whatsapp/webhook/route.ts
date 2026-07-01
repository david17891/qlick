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

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

import {
  handleWebhookPayload
} from "../../../../lib/whatsapp/webhooks/handler";
import { verifyWebhook } from "../../../../lib/whatsapp/webhooks/verify";
import type {
  IncomingWhatsAppMessage,
  WhatsAppMessageStatus
} from "../../../../lib/whatsapp/webhooks/types";
import { normalizePhone } from "../../../../lib/crm/phone-utils";
import { processInboundMessage } from "../../../../lib/whatsapp/bot-engine";
import { debugLog } from "../../../../lib/log";

// Next.js: este endpoint siempre corre en Node runtime (necesita crypto).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Constantes                                                          */
/* ------------------------------------------------------------------ */

const META_SIGNATURE_HEADER = "x-hub-signature-256";
const SIGNATURE_PREFIX = "sha256=";

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

  // 2. Validar firma si WHATSAPP_WEBHOOK_SECRET está seteada.
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get(META_SIGNATURE_HEADER);
    if (!provided) {
      return NextResponse.json(
        { ok: false, message: "Falta X-Hub-Signature-256." },
        { status: 401 }
      );
    }
    if (!verifySignature(rawBody, provided, secret)) {
      return NextResponse.json(
        { ok: false, message: "Firma inválida." },
        { status: 401 }
      );
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "[whatsapp/webhook] WHATSAPP_WEBHOOK_SECRET no seteada; saltando validación de firma (NO recomendado en prod)."
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

  for (const msg of parsed.messages) {
    const stored = await persistInboundIfPossible(supabase, msg);
    if (stored) queued.push(stored);
    // Fire-and-forget: Meta espera response en <5s o reintenta.
    // El bot corre async en background; Vercel mantiene el container vivo
    // hasta que la Promise resuelva o el maxDuration expire.
    //
    // NOTA A3 del auditor 2026-07-01: ideal sería `waitUntil(promise)` pero
    // ese helper solo está disponible en Next.js 15+. En 14.2 (la versión
    // actual del repo) usamos `void`. Trade-off conocido: si el bot tarda
    // más que maxDuration, Vercel mata el container antes de que termine.
    // La idempotencia por `whatsapp_message_id UNIQUE` previene duplicados
    // en re-entregas de Meta.
    void processInboundSafely(msg);
  }

  // 5. Persistir status updates (no gatillan bot).
  const statusCount = await persistStatusUpdatesIfAny(supabase, payload);

  return NextResponse.json({
    ok: true,
    parsedMessages: parsed.messages.length,
    persisted: queued.length,
    statusUpdates: statusCount,
    note: parsed.note
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Verifica la firma `X-Hub-Signature-256: sha256=<hex>` con HMAC SHA256.
 * Usa `timingSafeEqual` para evitar timing attacks.
 */
function verifySignature(
  rawBody: string,
  header: string,
  secret: string
): boolean {
  if (!header.startsWith(SIGNATURE_PREFIX)) return false;
  const providedHex = header.slice(SIGNATURE_PREFIX.length);
  const computedHex = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  if (providedHex.length !== computedHex.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(providedHex, "hex"),
      Buffer.from(computedHex, "hex")
    );
  } catch {
    return false;
  }
}

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
 * Inserta el mensaje inbound en `lead_whatsapp_conversations`.
 * Si ya existe (23505 unique violation por wamid), es idempotente.
 * Devuelve el wamid en caso de éxito o null si no pudo persistir.
 */
async function persistInboundIfPossible(
  supabase: SupabaseClient<Database> | null,
  msg: IncomingWhatsAppMessage
): Promise<string | null> {
  if (!supabase) return null;
  const phone = normalizePhone(msg.from);
  if (!phone) return null;
  const { error } = await supabase
    .from("lead_whatsapp_conversations" as never)
    .insert({
      lead_id: null, // se completa en el bot engine cuando se resuelve el lead
      phone_normalized: phone,
      direction: "inbound",
      message_type: msg.type === "text" ? "text" : "interactive",
      body: msg.text ?? null,
      whatsapp_message_id: msg.messageId,
      metadata: {
        timestamp: msg.timestamp,
        contactName: msg.contactName
      }
    } as never);
  if (error) {
    // 23505 = unique_violation en whatsapp_message_id. Idempotente: OK.
    if ((error as { code?: string }).code !== "23505") {
      // eslint-disable-next-line no-console
      console.error("[whatsapp/webhook] persistInbound falló", {
        code: (error as { code?: string }).code
      });
    }
    return null;
  }
  return msg.messageId;
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
        message_type: "metadata",
        body: null,
        whatsapp_message_id: s.id,
        metadata: {
          status: s.status,
          timestamp: s.timestamp
        }
      } as never);
    if (!error) count++;
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
  debugLog("[whatsapp/webhook] processInboundSafely START", {
    messageId: msg.messageId
  });
  try {
    await processInboundMessage(msg);
    debugLog("[whatsapp/webhook] processInboundSafely END OK", {
      messageId: msg.messageId
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp/webhook] processInboundMessage lanzó excepción", {
      messageId: msg.messageId,
      from: msg.from,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
