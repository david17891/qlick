/**
 * Seguimiento comercial de leads por WhatsApp.
 *
 * El job solo puede enviar mensajes cuando:
 *   - `system_settings.lead_followup_mode === "live"`;
 *   - hay consentimiento explícito;
 *   - el lead está en registro incompleto o pago pendiente;
 *   - la conversación sigue dentro de la ventana de servicio de 24 horas;
 *   - el último mensaje es outbound del bot, no un inbound pendiente ni una
 *     respuesta manual;
 *   - no se han enviado dos seguimientos en la ventana actual.
 *
 * `shadow` ejecuta toda la lectura y clasificación, pero no reclama leads,
 * no llama a Meta y no escribe en Supabase. Es el modo recomendado para
 * validar producción antes de habilitar `live`.
 */

import { createSupabaseAdminClient } from "../supabase/admin";
import { checkSupabaseConfig } from "../supabase/health";
import {
  KEY_BOT_DAILY_OUTBOUND_LIMIT,
  KEY_BOT_PAUSED_GLOBAL,
  KEY_LEAD_FOLLOWUP_MODE,
  readSystemSetting,
} from "../admin/system-settings-server";
import { getActiveWhatsAppProvider } from "../whatsapp";
import { getWhatsAppSessionWindow } from "../whatsapp/session-window";
import type { LeadIntent, LeadStatus } from "@/types/crm";
import {
  decideLeadFollowup,
  getNextLeadFollowupAt,
  LEAD_FOLLOWUP_CLAIM_DELAY_MS,
  LEAD_FOLLOWUP_MAX_PER_RUN,
  LEAD_FOLLOWUP_RETRY_DELAY_MS,
  normalizeLeadFollowupMode,
  getPendingRegistrationField,
  type LeadFollowupMode,
  type LeadFollowupDecision,
} from "../whatsapp/lead-followup";

const DEFAULT_GLOBAL_OUTBOUND_LIMIT = 50;
const FOLLOWUP_TOTAL_LIMIT_24H = 20;
const CANDIDATE_SCAN_LIMIT = 50;

interface LeadFollowupRow {
  id: string;
  name: string;
  phone: string | null;
  phone_normalized: string | null;
  status: "interested" | "payment_pending" | string;
  intent: string;
  tags: string[] | null;
  consent_to_contact: boolean;
  bot_paused: boolean;
  next_follow_up_at: string | null;
}

interface ConversationRow {
  lead_id: string | null;
  direction: "inbound" | "outbound";
  body: string | null;
  metadata: unknown;
  created_at: string;
}

interface FollowupMetadata {
  auto_sent_source?: string;
  manual?: boolean;
  ui_source?: string;
  awaiting_field?: "name" | "email" | null;
}

export interface LeadFollowupRunResult {
  ok: boolean;
  mode: LeadFollowupMode;
  note: string;
  scanned: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  skippedByReason: Record<string, number>;
}

function emptyResult(mode: LeadFollowupMode, note: string): LeadFollowupRunResult {
  return {
    ok: true,
    mode,
    note,
    scanned: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    skippedByReason: {},
  };
}

function metadataOf(value: unknown): FollowupMetadata {
  return value && typeof value === "object" ? (value as FollowupMetadata) : {};
}

function incrementReason(result: LeadFollowupRunResult, reason: string): void {
  result.skipped++;
  result.skippedByReason[reason] = (result.skippedByReason[reason] ?? 0) + 1;
}

function toPhone(row: LeadFollowupRow): string | null {
  const value = row.phone_normalized || row.phone;
  const normalized = value?.replace(/[^0-9]/g, "") ?? "";
  return normalized.length >= 10 ? normalized : null;
}

function latestRows(rows: ConversationRow[]): {
  last: ConversationRow | null;
  lastInbound: ConversationRow | null;
  lastOutbound: ConversationRow | null;
} {
  const ordered = [...rows].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  const last = ordered.at(-1) ?? null;
  const lastInbound = [...ordered].reverse().find((row) => row.direction === "inbound") ?? null;
  const lastOutbound = [...ordered].reverse().find((row) => row.direction === "outbound") ?? null;
  return { last, lastInbound, lastOutbound };
}

function isFollowupMessage(row: ConversationRow, sinceMs: number): boolean {
  if (row.direction !== "outbound" || Date.parse(row.created_at) < sinceMs) return false;
  return metadataOf(row.metadata).auto_sent_source === "lead_followup";
}

function isManualOutbound(row: ConversationRow | null): boolean {
  if (!row) return false;
  const metadata = metadataOf(row.metadata);
  return metadata.manual === true || metadata.ui_source === "conversations_panel";
}

async function claimLead(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  lead: LeadFollowupRow,
  now: Date,
): Promise<string | null> {
  if (!lead.next_follow_up_at) return null;
  const claimUntil = new Date(now.getTime() + LEAD_FOLLOWUP_CLAIM_DELAY_MS).toISOString();
  const { data, error } = await supabase
    .from("leads")
    .update({ next_follow_up_at: claimUntil })
    .eq("id", lead.id)
    .eq("next_follow_up_at", lead.next_follow_up_at)
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return claimUntil;
}

async function updateClaimedLead(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  leadId: string,
  claimUntil: string,
  nextFollowUpAt: string | null,
): Promise<void> {
  await supabase
    .from("leads")
    .update({ next_follow_up_at: nextFollowUpAt })
    .eq("id", leadId)
    .eq("next_follow_up_at", claimUntil);
}

function decisionForLead(
  lead: LeadFollowupRow,
  rows: ConversationRow[],
  now: Date,
): {
  decision: LeadFollowupDecision;
  last: ConversationRow | null;
  lastInbound: ConversationRow | null;
  lastOutbound: ConversationRow | null;
  count: number;
  awaitingField: "name" | "email" | null;
} {
  const sinceMs = now.getTime() - 24 * 60 * 60 * 1000;
  const latest = latestRows(rows);
  const count = rows.filter((row) => isFollowupMessage(row, sinceMs)).length;
  const pendingRegistrationField = getPendingRegistrationField(rows);
  const decision = decideLeadFollowup({
    name: lead.name,
    status: lead.status as LeadStatus,
    intent: lead.intent as LeadIntent,
    tags: lead.tags,
    consentToContact: lead.consent_to_contact,
    botPaused: lead.bot_paused,
    nextFollowUpAt: lead.next_follow_up_at,
    lastInboundAt: latest.lastInbound?.created_at ?? null,
    lastMessageDirection: latest.last?.direction ?? null,
    lastOutboundManual: isManualOutbound(latest.lastOutbound),
    awaitingField: pendingRegistrationField,
    sentCountInWindow: count,
    now,
  });
  return { decision, ...latest, count, awaitingField: pendingRegistrationField };
}

function shouldClearDueFollowup(reason: string): boolean {
  return ["window_closed", "window_unknown", "max_attempts_reached", "manual_reply_pending"].includes(reason);
}

/** Ejecuta una pasada del seguimiento automático. Server-only. */
export async function runLeadFollowupJob(now = new Date()): Promise<LeadFollowupRunResult> {
  if (!checkSupabaseConfig().configured) {
    return emptyResult("off", "Supabase no configurado; seguimiento apagado.");
  }

  const rawMode = await readSystemSetting(KEY_LEAD_FOLLOWUP_MODE);
  const mode = normalizeLeadFollowupMode(rawMode);
  if (mode === "off") {
    return emptyResult(mode, "Modo off: no se leen candidatos ni se envían mensajes.");
  }

  const supabase = createSupabaseAdminClient();
  const [globalPausedRaw, globalLimitRaw] = await Promise.all([
    readSystemSetting(KEY_BOT_PAUSED_GLOBAL),
    readSystemSetting(KEY_BOT_DAILY_OUTBOUND_LIMIT),
  ]);
  if (globalPausedRaw === true) {
    return emptyResult(mode, "Bot pausado globalmente; no se ejecuta seguimiento.");
  }

  const globalLimit = typeof globalLimitRaw === "number" && globalLimitRaw >= 0
    ? globalLimitRaw
    : DEFAULT_GLOBAL_OUTBOUND_LIMIT;
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { count: outbound24h } = await supabase
    .from("lead_whatsapp_conversations")
    .select("id", { count: "exact", head: true })
    .eq("direction", "outbound")
    .eq("metadata->>auto_sent", "true")
    .gte("created_at", since24h);
  const remainingGlobal = Math.max(0, globalLimit - (outbound24h ?? 0));
  const remainingFollowup = Math.max(0, FOLLOWUP_TOTAL_LIMIT_24H - (await countFollowups(supabase, since24h)));
  const available = Math.min(remainingGlobal, remainingFollowup, LEAD_FOLLOWUP_MAX_PER_RUN);

  const result = emptyResult(mode, "Pasada completada.");
  if (available === 0) {
    result.note = "Tope de seguridad alcanzado; no se procesan leads.";
    return result;
  }

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, name, phone, phone_normalized, status, intent, tags, consent_to_contact, bot_paused, next_follow_up_at")
    .in("status", ["interested", "payment_pending"])
    // Una inscripcion iniciada es un seguimiento transaccional dentro de la
    // ventana de servicio; la politica pura descarta los leads sin señal de
    // registro y conserva el bloqueo de bajas explicitas.
    .eq("bot_paused", false)
    .not("next_follow_up_at", "is", null)
    .lte("next_follow_up_at", now.toISOString())
    .order("next_follow_up_at", { ascending: true })
    .limit(CANDIDATE_SCAN_LIMIT);
  if (leadsError || !leads) {
    return {
      ...result,
      ok: false,
      note: `No se pudieron leer candidatos (${leadsError?.code ?? "unknown"}).`,
    };
  }

  result.scanned = leads.length;
  const leadRows = leads as unknown as LeadFollowupRow[];
  const leadIds = leadRows.map((lead) => lead.id);
  const { data: messageRows, error: messagesError } = leadIds.length
    ? await supabase
        .from("lead_whatsapp_conversations")
        .select("lead_id, direction, body, metadata, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (messagesError) {
    return { ...result, ok: false, note: `No se pudo leer el historial (${messagesError.code ?? "unknown"}).` };
  }

  const rowsByLead = new Map<string, ConversationRow[]>();
  for (const row of (messageRows ?? []) as unknown as ConversationRow[]) {
    if (!row.lead_id) continue;
    const current = rowsByLead.get(row.lead_id) ?? [];
    current.push(row);
    rowsByLead.set(row.lead_id, current);
  }

  const provider = mode === "live" ? getActiveWhatsAppProvider() : null;
  for (const lead of leadRows) {
    if (result.eligible >= available) break;
    const phone = toPhone(lead);
    if (!phone) {
      incrementReason(result, "phone_missing");
      continue;
    }
    const {
      decision,
      last,
      lastInbound,
      lastOutbound,
      count,
      awaitingField: pendingRegistrationField,
    } = decisionForLead(
      lead,
      rowsByLead.get(lead.id) ?? [],
      now,
    );
    if (!decision.eligible || !decision.stage || !decision.body) {
      incrementReason(result, decision.reason);
      if (mode === "live" && lead.next_follow_up_at && shouldClearDueFollowup(decision.reason)) {
        await supabase
          .from("leads")
          .update({ next_follow_up_at: null })
          .eq("id", lead.id)
          .eq("next_follow_up_at", lead.next_follow_up_at);
      }
      continue;
    }

    result.eligible++;
    if (mode === "shadow") continue;
    if (!provider) continue;

    const claimUntil = await claimLead(supabase, lead, now);
    if (!claimUntil) {
      incrementReason(result, "claim_lost");
      continue;
    }

    // Si entró un mensaje mientras clasificábamos, liberamos la reserva.
    const { data: newest } = await supabase
      .from("lead_whatsapp_conversations")
      .select("direction, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newest && last && Date.parse(newest.created_at) > Date.parse(last.created_at)) {
      await updateClaimedLead(supabase, lead.id, claimUntil, new Date(now.getTime() + 60 * 60 * 1000).toISOString());
      incrementReason(result, "new_message_during_claim");
      continue;
    }

    let sendResult: { ok: boolean; externalId?: string; note?: string };
    try {
      sendResult = await provider.send({ to: phone, body: decision.body });
    } catch (error) {
      sendResult = { ok: false, note: error instanceof Error ? error.message : String(error) };
    }

    if (!sendResult.ok) {
      const session = getWhatsAppSessionWindow(lastInbound?.created_at ?? null, now);
      const retryAt = session.openUntil && Date.parse(session.openUntil) > now.getTime() + LEAD_FOLLOWUP_RETRY_DELAY_MS
        ? new Date(now.getTime() + LEAD_FOLLOWUP_RETRY_DELAY_MS).toISOString()
        : null;
      await updateClaimedLead(supabase, lead.id, claimUntil, retryAt);
      result.failed++;
      continue;
    }

    const { error: persistError } = await supabase
      .from("lead_whatsapp_conversations")
      .insert({
        lead_id: lead.id,
        phone_normalized: phone,
        direction: "outbound",
        message_type: "text",
        body: decision.body,
        whatsapp_message_id: sendResult.externalId ?? null,
        metadata: {
          auto_sent: true,
          auto_sent_source: "lead_followup",
          followup_stage: decision.stage,
          followup_number: decision.followupNumber,
          awaiting_field: pendingRegistrationField,
        },
      } as never);
    if (persistError) result.failed++;

    const session = getWhatsAppSessionWindow(lastInbound?.created_at ?? null, now);
    const next = getNextLeadFollowupAt(
      decision.stage,
      count + 1,
      now,
      session.openUntil,
    );
    await updateClaimedLead(supabase, lead.id, claimUntil, next);
    if (!persistError) result.sent++;
  }

  result.note = mode === "shadow"
    ? `Shadow: ${result.eligible} candidatos elegibles; 0 mensajes enviados.`
    : `Live: ${result.sent} mensajes enviados; ${result.failed} fallos.`;
  return result;
}

async function countFollowups(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  sinceIso: string,
): Promise<number> {
  const { count } = await supabase
    .from("lead_whatsapp_conversations")
    .select("id", { count: "exact", head: true })
    .eq("direction", "outbound")
    .eq("metadata->>auto_sent_source", "lead_followup")
    .gte("created_at", sinceIso);
  return count ?? 0;
}
