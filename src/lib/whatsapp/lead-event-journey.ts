/**
 * Contrato puro del journey operativo por persona + evento.
 *
 * Este módulo no hace I/O ni envía WhatsApp. Su objetivo es que el bot,
 * follow-ups, rescates y revisión humana compartan las mismas invariantes
 * antes de conectarse a Supabase.
 */

export const RELATIONSHIP_STAGES = [
  "new",
  "info_requested",
  "interested",
  "capturing",
  "registered",
  "attended",
  "no_show",
  "closed",
] as const;

export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];

export const AWAITING_FIELDS = [
  "none",
  "name",
  "email",
  "registration_decision",
  "payment_decision",
] as const;

export type AwaitingField = (typeof AWAITING_FIELDS)[number];

export const PAYMENT_STATUSES = [
  "not_required",
  "pending",
  "partial",
  "paid",
  "failed",
  "refunded",
  "disputed",
] as const;

export type JourneyPaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CONVERSATION_CONTROLS = ["bot", "human", "paused"] as const;

export type ConversationControl = (typeof CONVERSATION_CONTROLS)[number];

export const JOURNEY_SOURCES = [
  "inbound",
  "outbound",
  "followup",
  "recovery",
  "reminder",
  "survey",
  "manual",
  "system",
] as const;

export type JourneySource = (typeof JOURNEY_SOURCES)[number];

export interface LeadEventJourney {
  id: string;
  leadId: string;
  eventId: string;
  relationshipStage: RelationshipStage;
  awaitingField: AwaitingField;
  paymentStatus: JourneyPaymentStatus;
  conversationControl: ConversationControl;
  lastIntent: string | null;
  lastAction: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  nextFollowUpAt: string | null;
  followUpCount: number;
  recoveryState: string;
  botMode: string | null;
  botVersion: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type JourneyPatch = Partial<
  Pick<
    LeadEventJourney,
    | "relationshipStage"
    | "awaitingField"
    | "paymentStatus"
    | "conversationControl"
    | "lastIntent"
    | "lastAction"
    | "lastInboundAt"
    | "lastOutboundAt"
    | "nextFollowUpAt"
    | "followUpCount"
    | "recoveryState"
    | "botMode"
    | "botVersion"
    | "metadata"
  >
>;

export interface JourneyTransition {
  leadId: string;
  eventId: string;
  fromStage: RelationshipStage | null;
  toStage: RelationshipStage;
  fromAwaitingField: AwaitingField | null;
  toAwaitingField: AwaitingField;
  reason: string;
  source: JourneySource;
}

export function createInitialLeadEventJourney(input: {
  id: string;
  leadId: string;
  eventId: string;
  now?: string;
}): LeadEventJourney {
  const now = input.now ?? new Date().toISOString();

  return {
    id: input.id,
    leadId: input.leadId,
    eventId: input.eventId,
    relationshipStage: "new",
    awaitingField: "none",
    paymentStatus: "not_required",
    conversationControl: "bot",
    lastIntent: null,
    lastAction: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    nextFollowUpAt: null,
    followUpCount: 0,
    recoveryState: "none",
    botMode: null,
    botVersion: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function isJourneyTerminal(stage: RelationshipStage): boolean {
  return stage === "attended" || stage === "no_show" || stage === "closed";
}

export function applyLeadEventJourneyPatch(
  current: LeadEventJourney,
  patch: JourneyPatch,
  context: { reason: string; source: JourneySource; now?: string },
): { journey: LeadEventJourney; transition: JourneyTransition } {
  if (!context.reason.trim()) {
    throw new Error("journey_transition_reason_required");
  }

  const nextStage = patch.relationshipStage ?? current.relationshipStage;
  const nextAwaitingField = patch.awaitingField ?? current.awaitingField;
  const isTerminalExit = isJourneyTerminal(current.relationshipStage)
    && nextStage !== current.relationshipStage;

  if (isTerminalExit && context.source !== "manual") {
    throw new Error("terminal_journey_requires_manual_reopen");
  }

  if (current.paymentStatus === "paid"
    && patch.paymentStatus !== undefined
    && patch.paymentStatus !== "paid"
    && context.source !== "manual") {
    throw new Error("paid_journey_requires_manual_payment_change");
  }

  if (current.conversationControl === "human"
    && patch.conversationControl === "bot"
    && context.source !== "manual") {
    throw new Error("human_control_requires_manual_resume");
  }

  const now = context.now ?? new Date().toISOString();
  const journey: LeadEventJourney = {
    ...current,
    ...patch,
    updatedAt: now,
  };

  return {
    journey,
    transition: {
      leadId: current.leadId,
      eventId: current.eventId,
      fromStage: current.relationshipStage,
      toStage: journey.relationshipStage,
      fromAwaitingField: current.awaitingField,
      toAwaitingField: journey.awaitingField,
      reason: context.reason.trim(),
      source: context.source,
    },
  };
}

export function assertJourneyBelongsToEvent(
  journey: Pick<LeadEventJourney, "leadId" | "eventId">,
  expected: { leadId: string; eventId: string },
): void {
  if (journey.leadId !== expected.leadId || journey.eventId !== expected.eventId) {
    throw new Error("journey_identity_mismatch");
  }
}
