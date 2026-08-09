-- Journey operativo por persona + evento.
--
-- Esta tabla no reemplaza leads, lead_event_links, confirmaciones, pagos,
-- asistentes ni conversaciones. Es una proyección operacional para que los
-- bots puedan decidir el siguiente paso sin mezclar eventos.

create table if not exists public.lead_event_journeys (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  relationship_stage text not null default 'new'
    check (relationship_stage in (
      'new',
      'info_requested',
      'interested',
      'capturing',
      'registered',
      'attended',
      'no_show',
      'closed'
    )),
  awaiting_field text not null default 'none'
    check (awaiting_field in (
      'none',
      'name',
      'email',
      'registration_decision',
      'payment_decision'
    )),
  payment_status text not null default 'not_required'
    check (payment_status in (
      'not_required',
      'pending',
      'partial',
      'paid',
      'failed',
      'refunded',
      'disputed'
    )),
  conversation_control text not null default 'bot'
    check (conversation_control in ('bot', 'human', 'paused')),
  last_intent text,
  last_action text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  next_follow_up_at timestamptz,
  follow_up_count integer not null default 0 check (follow_up_count >= 0),
  recovery_state text not null default 'none'
    check (recovery_state in (
      'none',
      'candidate',
      'eligible',
      'sent',
      'replied',
      'completed',
      'excluded',
      'duplicate_review',
      'blocked_template_required',
      'failed'
    )),
  bot_mode text,
  bot_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_event_journeys_lead_event_unique unique (lead_id, event_id)
);

create index if not exists lead_event_journeys_event_stage_idx
  on public.lead_event_journeys (event_id, relationship_stage, updated_at desc);

create index if not exists lead_event_journeys_lead_idx
  on public.lead_event_journeys (lead_id, updated_at desc);

create index if not exists lead_event_journeys_followup_idx
  on public.lead_event_journeys (next_follow_up_at)
  where next_follow_up_at is not null
    and conversation_control = 'bot'
    and relationship_stage not in ('attended', 'no_show', 'closed');

alter table public.lead_event_journeys enable row level security;
revoke all on table public.lead_event_journeys from anon, authenticated;
grant all on table public.lead_event_journeys to service_role;

comment on table public.lead_event_journeys is
  'Estado operativo por lead + evento. No sustituye confirmaciones, pagos, asistentes ni conversaciones. Backend/service_role only.';
comment on column public.lead_event_journeys.relationship_stage is
  'Etapa de la relación con este evento; no debe copiarse desde otro evento del mismo lead.';
comment on column public.lead_event_journeys.payment_status is
  'Snapshot operativo; la verdad del pago sigue en event_confirmations/event_payments y sus webhooks.';
comment on column public.lead_event_journeys.conversation_control is
  'bot procesa; human requiere pausa del bot; paused queda detenido hasta acción explícita.';

-- Historial append-only de decisiones para revisión humana, regresiones y
-- rollback. La aplicación será responsable de insertar una fila por cambio.
create table if not exists public.lead_event_journey_transitions (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.lead_event_journeys(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  from_awaiting_field text,
  to_awaiting_field text not null,
  reason text not null,
  source text not null
    check (source in (
      'inbound',
      'outbound',
      'followup',
      'recovery',
      'reminder',
      'survey',
      'manual',
      'system'
    )),
  source_message_id uuid references public.lead_whatsapp_conversations(id) on delete set null,
  bot_mode text,
  bot_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_event_journey_transitions_journey_idx
  on public.lead_event_journey_transitions (journey_id, created_at desc);

create index if not exists lead_event_journey_transitions_event_idx
  on public.lead_event_journey_transitions (event_id, created_at desc);

alter table public.lead_event_journey_transitions enable row level security;
revoke all on table public.lead_event_journey_transitions from anon, authenticated;
grant all on table public.lead_event_journey_transitions to service_role;

comment on table public.lead_event_journey_transitions is
  'Historial append-only de cambios del journey por lead + evento. Backend/service_role only.';
