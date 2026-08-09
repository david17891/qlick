import type { LeadStatus, LeadIntent } from "@/types/crm";
import type { createSupabaseAdminClient } from "../supabase/admin";
import { getWhatsAppSessionWindow } from "../whatsapp/session-window";
import {
  getFreeEntryPointUntil,
  WHATSAPP_STANDARD_SESSION_MS,
} from "../whatsapp/lead-followup";

export const HISTORICAL_INFO_RECOVERY_CAMPAIGN = "info_recovery_2026_08_v1";
export const HISTORICAL_INFO_RECOVERY_TAG = "recovery:info_historical";
export const HISTORICAL_INFO_RECOVERY_TEMPLATE_TAG = "recovery:template_required";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export interface RecoveryConversationRow {
  id: string;
  lead_id: string | null;
  direction: "inbound" | "outbound";
  body: string | null;
  metadata: unknown;
  created_at: string;
}

interface RecoveryLeadRow {
  id: string;
  status: string;
  intent: string;
  tags: string[] | null;
  bot_paused: boolean;
  next_follow_up_at: string | null;
}

interface ExistingCampaignRow {
  lead_id: string;
  state: string;
  sent_at: string | null;
  replied_at: string | null;
}

export interface HistoricalRecoveryDiscoveryResult {
  scanned: number;
  candidates: number;
  eligible: number;
  blockedTemplate: number;
  duplicateReview: number;
  replied: number;
  excluded: number;
  scheduled: number;
}

const INFO_REQUEST_RE = /\b(?:quiero\s+(?:m[aá]s\s+)?informaci[oó]n|m[aá]s\s+informaci[oó]n|quiero\s+info)\b/i;

function metadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function hasOptOut(tags: string[] | null): boolean {
  return (tags ?? []).includes("whatsapp:opt_out");
}

function hasCompletedRegistration(tags: string[] | null): boolean {
  return (tags ?? []).includes("registration:complete");
}

function addTags(tags: string[] | null, additions: string[]): string[] {
  return Array.from(new Set([...(tags ?? []), ...additions]));
}

function sortMessages(rows: RecoveryConversationRow[]): RecoveryConversationRow[] {
  return [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

function isInformationRequest(body: string | null): boolean {
  return Boolean(body && INFO_REQUEST_RE.test(body));
}

function hasInboundAfter(rows: RecoveryConversationRow[], timestamp: string): boolean {
  const at = Date.parse(timestamp);
  return rows.some((row) => row.direction === "inbound" && Date.parse(row.created_at) > at);
}

function hasManualOutboundAfter(rows: RecoveryConversationRow[], timestamp: string): boolean {
  const at = Date.parse(timestamp);
  return rows.some((row) => {
    if (row.direction !== "outbound" || Date.parse(row.created_at) <= at) return false;
    const metadata = metadataOf(row.metadata);
    return metadata.manual === true || metadata.ui_source === "conversations_panel";
  });
}

function hasHistoricalRescue(rows: RecoveryConversationRow[]): boolean {
  return findHistoricalRescueAt(rows) !== null;
}

function findHistoricalRescueAt(rows: RecoveryConversationRow[]): string | null {
  const rescue = rows.find((row) => {
    if (row.direction !== "outbound") return false;
    const metadata = metadataOf(row.metadata);
    return metadata.recovery_campaign_key === HISTORICAL_INFO_RECOVERY_CAMPAIGN;
  });
  return rescue?.created_at ?? null;
}

function hasInboundAfterHistoricalRescue(rows: RecoveryConversationRow[]): boolean {
  const rescueAt = findHistoricalRescueAt(rows);
  return rescueAt ? hasInboundAfter(rows, rescueAt) : false;
}

function hasDuplicateBotOutbound(rows: RecoveryConversationRow[], after: string): boolean {
  const at = Date.parse(after);
  return rows.filter((row) => {
    if (row.direction !== "outbound" || Date.parse(row.created_at) <= at) return false;
    return metadataOf(row.metadata).auto_sent_source === "bot";
  }).length > 1;
}

function findInfoRequest(rows: RecoveryConversationRow[]): RecoveryConversationRow | null {
  return sortMessages(rows).find(
    (row) => row.direction === "inbound" && isInformationRequest(row.body),
  ) ?? null;
}

function classify(
  lead: RecoveryLeadRow,
  rows: RecoveryConversationRow[],
  now: Date,
): {
  state: string;
  windowKind: "service_24h" | "free_entry_72h" | "template_required";
  reason: string;
  source: RecoveryConversationRow;
  sourceRequestedAt: string;
  scheduledAt: string | null;
  freeEntryPointUntil: string | null;
} | null {
  const source = findInfoRequest(rows);
  if (!source) return null;
  const ordered = sortMessages(rows);
  const sourceAt = Date.parse(source.created_at);
  if (!Number.isFinite(sourceAt)) return null;
  const outboundAfter = ordered.filter(
    (row) => row.direction === "outbound" && Date.parse(row.created_at) > sourceAt,
  );
  const freeEntryPointUntil = getFreeEntryPointUntil(rows, now);
  const standardSession = getWhatsAppSessionWindow(source.created_at, now);
  const freeEntryPointActive = Boolean(
    freeEntryPointUntil && Date.parse(freeEntryPointUntil) > now.getTime(),
  );
  const serviceWindowOpen = standardSession.state === "open" || freeEntryPointActive;
  const windowKind = freeEntryPointActive
    ? "free_entry_72h"
    : serviceWindowOpen
      ? "service_24h"
      : "template_required";

  if (hasInboundAfterHistoricalRescue(rows)) {
    return {
      state: "replied",
      windowKind,
      reason: "lead_replied_after_recovery",
      source,
      sourceRequestedAt: source.created_at,
      scheduledAt: null,
      freeEntryPointUntil,
    };
  }
  if (hasHistoricalRescue(rows)) {
    return {
      state: "sent",
      windowKind,
      reason: "already_sent_for_campaign",
      source,
      sourceRequestedAt: source.created_at,
      scheduledAt: null,
      freeEntryPointUntil,
    };
  }
  if (lead.bot_paused || hasOptOut(lead.tags) || hasCompletedRegistration(lead.tags)) {
    return {
      state: "excluded",
      windowKind,
      reason: lead.bot_paused ? "bot_paused" : hasOptOut(lead.tags) ? "opted_out" : "registration_complete",
      source,
      sourceRequestedAt: source.created_at,
      scheduledAt: null,
      freeEntryPointUntil,
    };
  }
  if (lead.status === "payment_pending" || lead.status === "enrolled" || lead.status === "active_student") {
    return {
      state: "excluded",
      windowKind,
      reason: "advanced_lead_stage",
      source,
      sourceRequestedAt: source.created_at,
      scheduledAt: null,
      freeEntryPointUntil,
    };
  }
  if (outboundAfter.length === 0) {
    return {
      state: "excluded",
      windowKind,
      reason: "no_initial_information_response",
      source,
      sourceRequestedAt: source.created_at,
      scheduledAt: null,
      freeEntryPointUntil,
    };
  }
  if (hasManualOutboundAfter(rows, source.created_at)) {
    return {
      state: "excluded",
      windowKind,
      reason: "manual_response_after_information",
      source,
      sourceRequestedAt: source.created_at,
      scheduledAt: null,
      freeEntryPointUntil,
    };
  }
  if (hasDuplicateBotOutbound(rows, source.created_at)) {
    return {
      state: "duplicate_review",
      windowKind,
      reason: "multiple_bot_messages_after_information",
      source,
      sourceRequestedAt: source.created_at,
      scheduledAt: null,
      freeEntryPointUntil,
    };
  }
  if (hasInboundAfter(rows, source.created_at)) {
    return {
      state: "replied",
      windowKind,
      reason: "lead_replied_after_information",
      source,
      sourceRequestedAt: source.created_at,
      scheduledAt: null,
      freeEntryPointUntil,
    };
  }
  if (!serviceWindowOpen) {
    return {
      state: "blocked_template_required",
      windowKind: "template_required",
      reason: "service_window_closed_without_template",
      source,
      sourceRequestedAt: source.created_at,
      scheduledAt: null,
      freeEntryPointUntil,
    };
  }

  return {
    state: "eligible",
    windowKind,
    reason: "no_reply_after_initial_information",
    source,
    sourceRequestedAt: source.created_at,
    scheduledAt: now.toISOString(),
    freeEntryPointUntil,
  };
}

/**
 * Descubre y materializa candidatos históricos. Es idempotente por
 * (lead_id, campaign_key) y no envía mensajes.
 */
export async function discoverHistoricalInfoRecovery(
  supabase: SupabaseAdmin,
  now = new Date(),
): Promise<HistoricalRecoveryDiscoveryResult> {
  const result: HistoricalRecoveryDiscoveryResult = {
    scanned: 0,
    candidates: 0,
    eligible: 0,
    blockedTemplate: 0,
    duplicateReview: 0,
    replied: 0,
    excluded: 0,
    scheduled: 0,
  };

  const { data: inboundRows, error: inboundError } = await supabase
    .from("lead_whatsapp_conversations" as never)
    .select("id, lead_id, direction, body, metadata, created_at")
    .eq("direction", "inbound")
    .or("body.ilike.%más información%,body.ilike.%mas informacion%,body.ilike.%quiero información%,body.ilike.%quiero informacion%,body.ilike.%quiero info%")
    .order("created_at", { ascending: false })
    .limit(500);
  if (inboundError || !inboundRows) return result;

  const leadIds = Array.from(new Set(
    (inboundRows as unknown as RecoveryConversationRow[])
      .map((row) => row.lead_id)
      .filter((id): id is string => Boolean(id)),
  ));
  if (leadIds.length === 0) return result;

  const [{ data: leadRows }, { data: allMessages }, { data: existingCampaigns }] = await Promise.all([
    supabase
      .from("leads" as never)
      .select("id, status, intent, tags, bot_paused, next_follow_up_at")
      .in("id", leadIds),
    supabase
      .from("lead_whatsapp_conversations" as never)
      .select("id, lead_id, direction, body, metadata, created_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("lead_recovery_campaigns" as never)
      .select("lead_id, state, sent_at, replied_at")
      .eq("campaign_key", HISTORICAL_INFO_RECOVERY_CAMPAIGN)
      .in("lead_id", leadIds),
  ]);

  const messagesByLead = new Map<string, RecoveryConversationRow[]>();
  for (const row of (allMessages ?? []) as unknown as RecoveryConversationRow[]) {
    if (!row.lead_id) continue;
    const list = messagesByLead.get(row.lead_id) ?? [];
    list.push(row);
    messagesByLead.set(row.lead_id, list);
  }
  const existingByLead = new Map<string, ExistingCampaignRow>();
  for (const row of (existingCampaigns ?? []) as unknown as ExistingCampaignRow[]) {
    existingByLead.set(row.lead_id, row);
  }

  for (const lead of (leadRows ?? []) as unknown as RecoveryLeadRow[]) {
    const rows = messagesByLead.get(lead.id) ?? [];
    const classification = classify(lead, rows, now);
    if (!classification) continue;
    result.scanned++;
    result.candidates++;
    const existing = existingByLead.get(lead.id);
    const isAlreadySent = existing?.state === "sent" || existing?.state === "completed";
    const isAlreadyReplied = existing?.state === "replied";
    const state = classification.state === "replied"
      ? "replied"
      : isAlreadySent
        ? existing!.state
        : isAlreadyReplied
          ? "replied"
          : classification.state;
    const scheduledAt = state === "eligible" ? classification.scheduledAt : null;

    await supabase
      .from("lead_recovery_campaigns" as never)
      .upsert({
        lead_id: lead.id,
        campaign_key: HISTORICAL_INFO_RECOVERY_CAMPAIGN,
        state,
        window_kind: classification.windowKind,
        reason: classification.reason,
        source_conversation_id: classification.source.id,
        source_requested_at: classification.sourceRequestedAt,
        scheduled_at: scheduledAt,
        sent_at: existing?.sent_at ?? null,
        replied_at: existing?.replied_at ?? (state === "replied" ? now.toISOString() : null),
        copy_version: "info_recovery_close_v1",
        metadata: {
          free_entry_point_until: classification.freeEntryPointUntil,
          discovered_at: now.toISOString(),
        },
        updated_at: now.toISOString(),
      } as never, { onConflict: "lead_id,campaign_key" } as never);

    if (state === "eligible") {
      result.eligible++;
      const nextTags = addTags(lead.tags, ["conversation:info_requested", HISTORICAL_INFO_RECOVERY_TAG]);
      const leadUpdate: Record<string, unknown> = {
        tags: nextTags,
        next_follow_up_at: lead.next_follow_up_at && Date.parse(lead.next_follow_up_at) > now.getTime()
          ? lead.next_follow_up_at
          : now.toISOString(),
      };
      if (lead.status === "new" || lead.status === "contacted") {
        leadUpdate.status = "info_requested" as LeadStatus;
        leadUpdate.intent = "course_information" as LeadIntent;
      }
      await supabase.from("leads" as never).update(leadUpdate as never).eq("id", lead.id);
      result.scheduled++;
    } else if (state === "blocked_template_required") {
      result.blockedTemplate++;
      await supabase.from("leads" as never).update({
        tags: addTags(lead.tags, [HISTORICAL_INFO_RECOVERY_TAG, HISTORICAL_INFO_RECOVERY_TEMPLATE_TAG]),
      } as never).eq("id", lead.id);
    } else if (state === "duplicate_review") {
      result.duplicateReview++;
    } else if (state === "replied") {
      result.replied++;
    } else if (state === "excluded") {
      result.excluded++;
    }
  }

  return result;
}
