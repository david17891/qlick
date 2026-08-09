import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { listRealConversations } from "./conversations-server";
import { createLeadInteraction } from "./interactions-server";
import { createCRMNote } from "./notes-server";
import { logAdminAction } from "./audit-server";
import type { Conversation, ConversationMessage, LeadStatus } from "@/types/crm";

export const HUMAN_REVIEW_CAUSES = [
  "repetitive_or_long_copy",
  "generic_handoff",
  "missing_followup",
  "payment_friction",
  "missing_contact_data",
  "likely_low_intent",
  "wrong_fact_or_date",
  "unknown",
] as const;

export type HumanReviewCause = (typeof HUMAN_REVIEW_CAUSES)[number];

export const HUMAN_REVIEW_OUTCOMES = [
  "pending",
  "recoverable",
  "not_recoverable",
  "do_not_contact",
  "needs_human",
  "wrong_number",
  "already_resolved",
] as const;

export type HumanReviewOutcome = (typeof HUMAN_REVIEW_OUTCOMES)[number];

export interface HumanReviewContextMessage {
  direction: "inbound" | "outbound";
  body: string;
  at: string;
}

export interface HumanReviewItem {
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  ownerId: string | null;
  leadStatus: LeadStatus | null;
  emailPending: boolean;
  priority: "high" | "medium" | "low";
  priorityLabel: string;
  probableCause: HumanReviewCause;
  probableCauseLabel: string;
  reasonCodes: string[];
  evidence: string[];
  lastDirection: "inbound" | "outbound" | null;
  lastMessageAt: string | null;
  ageHours: number | null;
  lastMessagePreview: string;
  context: HumanReviewContextMessage[];
  reviewed: boolean;
  reviewOutcome: HumanReviewOutcome | null;
  reviewedAt: string | null;
  eventBucket: "active" | "previous" | "both" | "other" | "unassigned";
  eventAssociations: HumanReviewEventAssociation[];
}

export interface HumanReviewEventAssociation {
  eventId: string;
  title: string;
  status: string;
  startsAt: string | null;
  kind: "active" | "previous" | "other";
  sources: string[];
}

export interface HumanReviewQueue {
  generatedAt: string;
  totalCandidates: number;
  items: HumanReviewItem[];
  counts: {
    high: number;
    medium: number;
    low: number;
    reviewed: number;
    byCause: Partial<Record<HumanReviewCause, number>>;
  };
}

interface LeadReviewRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  owner_id: string | null;
  status: LeadStatus;
}

interface EventRow {
  id: string;
  title: string;
  status: string;
  starts_at: string | null;
}

interface LeadEventLinkRow {
  lead_id: string;
  event_id: string;
}

interface EventAttendeeRow {
  lead_id: string | null;
  event_id: string;
  phone_normalized: string | null;
}

interface EventConfirmationRow {
  event_id: string;
  email: string | null;
  phone_normalized: string | null;
}

const CAUSE_LABELS: Record<HumanReviewCause, string> = {
  repetitive_or_long_copy: "Respuesta repetitiva o demasiado larga",
  generic_handoff: "Transferencia genérica demasiado pronto",
  missing_followup: "Faltó seguimiento o cierre",
  payment_friction: "Fricción o confusión en el pago",
  missing_contact_data: "Faltan datos para completar el registro",
  likely_low_intent: "Señal de intención baja o ambigua",
  wrong_fact_or_date: "Dato factual o fecha incorrecta",
  unknown: "Requiere lectura humana",
};

const OUTCOME_LABELS: Record<HumanReviewOutcome, string> = {
  pending: "Pendiente",
  recoverable: "Recuperable",
  not_recoverable: "No recuperable",
  do_not_contact: "No contactar",
  needs_human: "Requiere humano",
  wrong_number: "Número incorrecto",
  already_resolved: "Ya resuelto",
};

const REVIEWABLE_STATUSES = new Set<LeadStatus>([
  "new",
  "contacted",
  "interested",
  "qualified",
  "info_requested",
  "payment_pending",
]);

const NON_WHATSAPP_MESSAGE_TYPES = new Set([
  "email",
  "phone",
  "form",
  "system",
  "internal_note",
  "ai_suggestion",
]);

function isWhatsAppMessage(message: ConversationMessage): boolean {
  return !NON_WHATSAPP_MESSAGE_TYPES.has(message.messageType ?? "");
}

function bodyMatches(body: string, pattern: RegExp): boolean {
  return pattern.test(body.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / (1000 * 60 * 60));
}

function preview(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}…` : compact;
}

function normalizedPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/[^\d]/g, "") ?? "";
  return digits.length >= 8 ? digits : null;
}

function normalizedEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  return email.includes("@") ? email : null;
}

function buildEventAssociations(
  leads: LeadReviewRow[],
  events: EventRow[],
  links: LeadEventLinkRow[],
  attendees: EventAttendeeRow[],
  confirmations: EventConfirmationRow[],
): Map<string, HumanReviewEventAssociation[]> {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const activeEvent = events
    .filter((event) => event.status === "published")
    .sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""))[0] ?? null;
  const previousEvent = events
    .filter((event) => event.id !== activeEvent?.id)
    .sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""))[0] ?? null;
  const associations = new Map<string, Map<string, Set<string>>>();

  function add(leadId: string, eventId: string, source: string) {
    if (!eventById.has(eventId)) return;
    const byEvent = associations.get(leadId) ?? new Map<string, Set<string>>();
    const sources = byEvent.get(eventId) ?? new Set<string>();
    sources.add(source);
    byEvent.set(eventId, sources);
    associations.set(leadId, byEvent);
  }

  for (const link of links) add(link.lead_id, link.event_id, "lead_event_link");
  for (const attendee of attendees) {
    if (attendee.lead_id) add(attendee.lead_id, attendee.event_id, "event_attendee");
  }

  const leadsByPhone = new Map<string, string[]>();
  const leadsByEmail = new Map<string, string[]>();
  for (const lead of leads) {
    const phone = normalizedPhone(lead.phone);
    const email = normalizedEmail(lead.email);
    if (phone) leadsByPhone.set(phone, [...(leadsByPhone.get(phone) ?? []), lead.id]);
    if (email) leadsByEmail.set(email, [...(leadsByEmail.get(email) ?? []), lead.id]);
  }
  for (const confirmation of confirmations) {
    const leadIds = new Set<string>();
    const phone = normalizedPhone(confirmation.phone_normalized);
    const email = normalizedEmail(confirmation.email);
    for (const leadId of phone ? leadsByPhone.get(phone) ?? [] : []) leadIds.add(leadId);
    for (const leadId of email ? leadsByEmail.get(email) ?? [] : []) leadIds.add(leadId);
    for (const leadId of leadIds) {
      if (phone && (leadsByPhone.get(phone) ?? []).includes(leadId)) add(leadId, confirmation.event_id, "confirmation_phone");
      else add(leadId, confirmation.event_id, "confirmation_email");
    }
  }

  const result = new Map<string, HumanReviewEventAssociation[]>();
  for (const [leadId, byEvent] of associations) {
    const rows = [...byEvent.entries()].flatMap(([eventId, sources]) => {
      const event = eventById.get(eventId);
      if (!event) return [];
      const kind: HumanReviewEventAssociation["kind"] = event.id === activeEvent?.id ? "active" : event.id === previousEvent?.id ? "previous" : "other";
      return [{ eventId, title: event.title, status: event.status, startsAt: event.starts_at, kind, sources: [...sources] }];
    });
    rows.sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? ""));
    result.set(leadId, rows);
  }
  return result;
}

function eventBucket(associations: HumanReviewEventAssociation[]): HumanReviewItem["eventBucket"] {
  if (!associations.length) return "unassigned";
  const hasActive = associations.some((event) => event.kind === "active");
  const hasPrevious = associations.some((event) => event.kind === "previous");
  if (hasActive && hasPrevious) return "both";
  if (hasActive) return "active";
  if (hasPrevious) return "previous";
  return "other";
}

function classifyConversation(
  conversation: Conversation,
  lead: LeadReviewRow,
): Omit<HumanReviewItem, "reviewed" | "reviewOutcome" | "reviewedAt" | "eventBucket" | "eventAssociations"> | null {
  const messages = conversation.messages.filter(isWhatsAppMessage);
  if (!messages.length || !REVIEWABLE_STATUSES.has(lead.status)) return null;

  const last = messages[messages.length - 1];
  const inbound = [...messages].reverse().find((message) => message.direction === "inbound");
  const outbound = [...messages].reverse().find((message) => message.direction === "outbound");
  const ageHours = hoursSince(last.at);
  const inboundBody = inbound?.body ?? "";
  const allBodies = messages.map((message) => message.body).join(" ");
  const asksForInfo = bodyMatches(inboundBody, /quiero|dame|mas informacion|informacion|info|detalles|precios|costo/);
  const registrationOrPayment = bodyMatches(
    inboundBody,
    /inscrib|registr|apart|reserv|pago|pagare|liquid|lugar|qr|curso|taller/,
  );
  const genericHandoff = bodyMatches(allBodies, /recibi tu mensaje|un asesor.*contactara|atencion personalizada/);
  const wrongFact = bodyMatches(allBodies, /martes 20|lunes 20|miercoles 20|viernes 20/);
  const consecutiveOutbound = messages.some(
    (message, index) => index > 0 && message.direction === "outbound" && messages[index - 1].direction === "outbound",
  );
  const paymentFriction =
    lead.status === "payment_pending" ||
    bodyMatches(allBodies, /enlace de pago|completar tu pago|apartar tu lugar|saldo pendiente/);
  const staleOutbound = last.direction === "outbound" && (ageHours ?? 0) >= 72;
  const waitingInbound = last.direction === "inbound" && (ageHours ?? 0) >= 12;

  const reasonCodes: string[] = [];
  if (waitingInbound) reasonCodes.push("last_inbound");
  if (staleOutbound) reasonCodes.push("bot_last_message_72h_plus");
  if (asksForInfo) reasonCodes.push("information_request");
  if (registrationOrPayment) reasonCodes.push("registration_or_payment_signal");
  if (genericHandoff) reasonCodes.push("generic_handoff");
  if (consecutiveOutbound) reasonCodes.push("consecutive_outbound");
  if (paymentFriction) reasonCodes.push("payment_signal");
  if (lead.email === null) reasonCodes.push("email_pending");

  // No se presenta como certeza: es una hipótesis de trabajo basada en
  // señales observables y debe confirmarse al leer el contexto completo.
  let probableCause: HumanReviewCause = "unknown";
  if (wrongFact) probableCause = "wrong_fact_or_date";
  else if (registrationOrPayment && paymentFriction) probableCause = "payment_friction";
  else if (registrationOrPayment && lead.email === null) probableCause = "missing_contact_data";
  else if (genericHandoff) probableCause = "generic_handoff";
  else if (consecutiveOutbound) probableCause = "repetitive_or_long_copy";
  else if (waitingInbound || asksForInfo) probableCause = "missing_followup";
  else if (staleOutbound) probableCause = "likely_low_intent";

  const shouldReview =
    waitingInbound ||
    staleOutbound ||
    genericHandoff ||
    consecutiveOutbound ||
    registrationOrPayment ||
    paymentFriction;
  if (!shouldReview) return null;

  const priority: HumanReviewItem["priority"] =
    registrationOrPayment || paymentFriction || waitingInbound ? "high" : staleOutbound ? "medium" : "low";
  const priorityLabel = priority === "high" ? "Prioridad alta" : priority === "medium" ? "Prioridad media" : "Prioridad baja";

  return {
    leadId: lead.id,
    leadName: lead.name,
    leadPhone: lead.phone,
    ownerId: lead.owner_id,
    leadStatus: lead.status,
    emailPending: lead.email === null,
    priority,
    priorityLabel,
    probableCause,
    probableCauseLabel: CAUSE_LABELS[probableCause],
    reasonCodes,
    evidence: [
      `${messages.length} mensajes WhatsApp en el contexto`,
      last.direction === "inbound" ? "El último mensaje lo envió el lead" : "El último mensaje lo envió el bot/equipo",
      ageHours === null ? "Antigüedad no disponible" : `Última actividad hace ${Math.round(ageHours)} h`,
    ],
    lastDirection: last.direction,
    lastMessageAt: last.at,
    ageHours,
    lastMessagePreview: preview(last.body),
    context: messages.slice(-6).map((message) => ({
      direction: message.direction,
      body: preview(message.body),
      at: message.at,
    })),
  };
}

export async function getHumanReviewQueue(): Promise<HumanReviewQueue> {
  if (!checkSupabaseConfig().configured) {
    return {
      generatedAt: new Date().toISOString(),
      totalCandidates: 0,
      items: [],
      counts: { high: 0, medium: 0, low: 0, reviewed: 0, byCause: {} },
    };
  }

  const supabase = createSupabaseAdminClient();
  const [leadResult, conversations, reviewResult, eventResult, linkResult, attendeeResult, confirmationResult] = await Promise.all([
    supabase.from("leads").select("id,name,email,phone,owner_id,status"),
    listRealConversations(),
    supabase
      .from("admin_audit_log")
      .select("entity_id,metadata,created_at")
      .eq("action", "crm_human_review_recorded")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("events").select("id,title,status,starts_at").order("starts_at", { ascending: false }),
    supabase.from("lead_event_links").select("lead_id,event_id"),
    supabase.from("event_attendees").select("lead_id,event_id,phone_normalized"),
    supabase.from("event_confirmations").select("event_id,email,phone_normalized"),
  ]);

  if (leadResult.error) throw new Error("No se pudieron leer los leads para revisión humana.");
  const leads = (leadResult.data ?? []) as LeadReviewRow[];
  const eventAssociations = buildEventAssociations(
    leads,
    (eventResult.data ?? []) as EventRow[],
    (linkResult.data ?? []) as LeadEventLinkRow[],
    (attendeeResult.data ?? []) as EventAttendeeRow[],
    (confirmationResult.data ?? []) as EventConfirmationRow[],
  );
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const reviews = new Map<string, { outcome: HumanReviewOutcome | null; at: string }>();
  for (const row of (reviewResult.data ?? []) as Array<{ entity_id: string | null; metadata: unknown; created_at: string }>) {
    if (!row.entity_id || reviews.has(row.entity_id)) continue;
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    const outcome = typeof metadata.outcome === "string" && HUMAN_REVIEW_OUTCOMES.includes(metadata.outcome as HumanReviewOutcome)
      ? metadata.outcome as HumanReviewOutcome
      : null;
    reviews.set(row.entity_id, { outcome, at: row.created_at });
  }

  const items: HumanReviewItem[] = [];
  for (const conversation of conversations) {
    const lead = leadsById.get(conversation.leadId);
    if (!lead) continue;
    const item = classifyConversation(conversation, lead);
    if (!item) continue;
    const review = reviews.get(item.leadId);
    const associatedEvents = eventAssociations.get(item.leadId) ?? [];
    items.push({
      ...item,
      reviewed: Boolean(review),
      reviewOutcome: review?.outcome ?? null,
      reviewedAt: review?.at ?? null,
      eventBucket: eventBucket(associatedEvents),
      eventAssociations: associatedEvents,
    });
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  const byCause: Partial<Record<HumanReviewCause, number>> = {};
  for (const item of items) byCause[item.probableCause] = (byCause[item.probableCause] ?? 0) + 1;

  return {
    generatedAt: new Date().toISOString(),
    totalCandidates: items.length,
    items,
    counts: {
      high: items.filter((item) => item.priority === "high").length,
      medium: items.filter((item) => item.priority === "medium").length,
      low: items.filter((item) => item.priority === "low").length,
      reviewed: items.filter((item) => item.reviewed).length,
      byCause,
    },
  };
}

export async function deleteLeadFromHumanReview(input: {
  leadId: string;
  actorEmail: string;
}): Promise<{ ok: boolean; deleted?: boolean; notFound?: boolean; counts?: Record<string, number>; error?: string }> {
  if (!checkSupabaseConfig().configured) return { ok: false, error: "Supabase no configurado." };
  if (!input.leadId || !input.actorEmail) return { ok: false, error: "Lead y administrador son obligatorios." };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("admin_delete_lead_cascade" as never, {
    p_lead_id: input.leadId,
    p_actor_email: input.actorEmail,
  } as never);
  if (error) {
    console.error("[crm/human-review] delete lead error", error);
    return { ok: false, error: "No se pudo eliminar el lead y sus datos CRM." };
  }
  const result = data as { ok?: boolean; not_found?: boolean; counts?: Record<string, number> } | null;
  if (result?.not_found) return { ok: false, notFound: true, error: "El lead ya no existe." };
  if (!result?.ok) return { ok: false, error: "No se pudo confirmar el borrado." };
  return { ok: true, deleted: true, counts: result.counts ?? {} };
}

export async function recordHumanReview(input: {
  leadId: string;
  outcome: HumanReviewOutcome;
  probableCause: HumanReviewCause;
  botImprovement: string;
  reviewerNote: string;
  actorEmail: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!checkSupabaseConfig().configured) return { ok: false, error: "Supabase no configurado." };
  const botImprovement = input.botImprovement.trim().slice(0, 1000);
  const reviewerNote = input.reviewerNote.trim().slice(0, 2000);
  if (!input.leadId || !input.actorEmail || !botImprovement) {
    return { ok: false, error: "Resultado, lead y mejora del bot son obligatorios." };
  }

  const summary = `Revisión humana: ${OUTCOME_LABELS[input.outcome]}; causa probable: ${CAUSE_LABELS[input.probableCause]}; mejora bot: ${botImprovement}`;
  const noteBody = [
    "[REVISION HUMANA CRM]",
    `Resultado: ${OUTCOME_LABELS[input.outcome]}`,
    `Causa probable: ${CAUSE_LABELS[input.probableCause]}`,
    `Mejora para el bot: ${botImprovement}`,
    reviewerNote ? `Nota del revisor: ${reviewerNote}` : "",
  ].filter(Boolean).join("\n");

  const [noteResult, interactionResult] = await Promise.all([
    createCRMNote(input.leadId, noteBody, input.actorEmail),
    createLeadInteraction({ leadId: input.leadId, channel: "system", direction: "system", summary }, input.actorEmail),
  ]);
  if (!noteResult.ok || !interactionResult.ok) {
    return { ok: false, error: "No se pudo guardar la revisión humana completa." };
  }

  await logAdminAction({
    actor_email: input.actorEmail,
    action: "crm_human_review_recorded",
    entity_type: "lead",
    entity_id: input.leadId,
    metadata: {
      outcome: input.outcome,
      probable_cause: input.probableCause,
      bot_improvement: botImprovement,
      has_reviewer_note: Boolean(reviewerNote),
      source: "crm_human_review",
    },
  });
  return { ok: true };
}

export function humanReviewCauseLabel(cause: HumanReviewCause): string {
  return CAUSE_LABELS[cause];
}

export function humanReviewOutcomeLabel(outcome: HumanReviewOutcome): string {
  return OUTCOME_LABELS[outcome];
}
