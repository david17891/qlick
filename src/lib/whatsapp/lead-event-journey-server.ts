import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { Database, Json } from "@/types/supabase";
import {
  applyLeadEventJourneyPatch,
  createInitialLeadEventJourney,
  type AwaitingField,
  type JourneyPatch,
  type JourneySource,
  type LeadEventJourney,
  type RelationshipStage,
} from "./lead-event-journey";

type JourneyClient = SupabaseClient<Database>;
type JourneyRow = Database["public"]["Tables"]["lead_event_journeys"]["Row"];

const VALID_AWAITING_FIELDS: readonly AwaitingField[] = [
  "none",
  "name",
  "email",
  "registration_decision",
  "payment_decision",
];

export interface SyncLeadEventJourneyArgs {
  supabase: JourneyClient;
  leadId: string;
  eventId: string;
  intent: string;
  source: JourneySource;
  inboundMessageId?: string | null;
  outboundMessageId?: string | null;
  outboundSent?: boolean;
  outboundMetadata?: Record<string, unknown> | null;
  botMode?: string | null;
  botVersion?: string | null;
  now?: string;
}

function isAwaitingField(value: unknown): value is AwaitingField {
  return typeof value === "string"
    && VALID_AWAITING_FIELDS.includes(value as AwaitingField);
}

function mapRow(row: JourneyRow): LeadEventJourney {
  return {
    id: row.id,
    leadId: row.lead_id,
    eventId: row.event_id,
    relationshipStage: row.relationship_stage as RelationshipStage,
    awaitingField: row.awaiting_field as AwaitingField,
    paymentStatus: row.payment_status as LeadEventJourney["paymentStatus"],
    conversationControl: row.conversation_control as LeadEventJourney["conversationControl"],
    lastIntent: row.last_intent,
    lastAction: row.last_action,
    lastInboundAt: row.last_inbound_at,
    lastOutboundAt: row.last_outbound_at,
    nextFollowUpAt: row.next_follow_up_at,
    followUpCount: row.follow_up_count,
    recoveryState: row.recovery_state,
    botMode: row.bot_mode,
    botVersion: row.bot_version,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stageForIntent(
  current: RelationshipStage,
  intent: string,
): RelationshipStage {
  if (intent === "opt_out") return "closed";
  if (intent === "provide_email") return "registered";
  if (
    intent === "register"
    || intent === "interactive_event_inscribir"
    || intent === "interactive_event_yes"
  ) {
    return "capturing";
  }
  if (intent === "welcome" || intent === "greeting" || intent === "question") {
    return current === "new" ? "info_requested" : current;
  }
  return current;
}

function patchForTurn(
  current: LeadEventJourney,
  args: SyncLeadEventJourneyArgs,
): JourneyPatch {
  const metadataAwaiting = args.outboundMetadata
    ? args.outboundMetadata.awaiting_field
    : undefined;
  const awaitingField = isAwaitingField(metadataAwaiting)
    ? metadataAwaiting
    : args.intent === "register" || args.intent === "interactive_event_inscribir"
    || args.intent === "interactive_event_yes"
    ? "name"
    : args.intent === "provide_name" || args.intent === "provide_name_late"
    ? "email"
    : args.intent === "provide_email" || args.intent === "opt_out"
    ? "none"
    : current.awaitingField;

  return {
    relationshipStage: stageForIntent(current.relationshipStage, args.intent),
    awaitingField,
    conversationControl: args.intent === "opt_out" ? "paused" : undefined,
    lastIntent: args.intent,
    lastAction: args.outboundSent === false ? "outbound_failed" : `intent:${args.intent}`,
    lastInboundAt: args.inboundMessageId ? (args.now ?? new Date().toISOString()) : current.lastInboundAt,
    lastOutboundAt: args.outboundMessageId && args.outboundSent !== false
      ? (args.now ?? new Date().toISOString())
      : current.lastOutboundAt,
    botMode: args.botMode ?? current.botMode,
    botVersion: args.botVersion ?? current.botVersion,
    metadata: {
      ...current.metadata,
      last_source_message_id: args.inboundMessageId ?? null,
      last_outbound_message_id: args.outboundMessageId ?? null,
    },
  };
}

export async function syncLeadEventJourneyForBotTurn(
  args: SyncLeadEventJourneyArgs,
): Promise<{ ok: boolean; journeyId?: string; error?: string }> {
  const { data: existingRow, error: selectError } = await args.supabase
    .from("lead_event_journeys")
    .select("*")
    .eq("lead_id", args.leadId)
    .eq("event_id", args.eventId)
    .maybeSingle();

  if (selectError) {
    return { ok: false, error: selectError.message };
  }

  const current = existingRow
    ? mapRow(existingRow)
    : createInitialLeadEventJourney({
      id: randomUUID(),
      leadId: args.leadId,
      eventId: args.eventId,
      now: args.now,
    });
  const { journey, transition } = applyLeadEventJourneyPatch(
    current,
    patchForTurn(current, args),
    {
      source: args.source,
      reason: `bot_turn:${args.intent}`,
      now: args.now,
    },
  );

  const { data: savedRow, error: saveError } = await args.supabase
    .from("lead_event_journeys")
    .upsert({
      id: journey.id,
      lead_id: journey.leadId,
      event_id: journey.eventId,
      relationship_stage: journey.relationshipStage,
      awaiting_field: journey.awaitingField,
      payment_status: journey.paymentStatus,
      conversation_control: journey.conversationControl,
      last_intent: journey.lastIntent,
      last_action: journey.lastAction,
      last_inbound_at: journey.lastInboundAt,
      last_outbound_at: journey.lastOutboundAt,
      next_follow_up_at: journey.nextFollowUpAt,
      follow_up_count: journey.followUpCount,
      recovery_state: journey.recoveryState,
      bot_mode: journey.botMode,
      bot_version: journey.botVersion,
      metadata: journey.metadata as Json,
      updated_at: journey.updatedAt,
    }, { onConflict: "lead_id,event_id" })
    .select("id")
    .single();

  if (saveError || !savedRow) {
    return { ok: false, error: saveError?.message ?? "journey_upsert_empty" };
  }

  const shouldRecordTransition = !existingRow
    || transition.fromStage !== transition.toStage
    || transition.fromAwaitingField !== transition.toAwaitingField;

  if (shouldRecordTransition) {
    const { error: transitionError } = await args.supabase
      .from("lead_event_journey_transitions")
      .insert({
        journey_id: savedRow.id,
        lead_id: args.leadId,
        event_id: args.eventId,
        from_stage: existingRow ? transition.fromStage : null,
        to_stage: transition.toStage,
        from_awaiting_field: existingRow ? transition.fromAwaitingField : null,
        to_awaiting_field: transition.toAwaitingField,
        reason: transition.reason,
        source: transition.source,
        source_message_id: args.inboundMessageId ?? null,
        bot_mode: args.botMode ?? null,
        bot_version: args.botVersion ?? "journey-dual-write-v1",
        metadata: {
          intent: args.intent,
          outbound_sent: args.outboundSent ?? null,
        },
      });

    if (transitionError) {
      return { ok: false, journeyId: savedRow.id, error: transitionError.message };
    }
  }

  return { ok: true, journeyId: savedRow.id };
}
