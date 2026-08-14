-- Operational safety for the WhatsApp bot. Additive only: no conversations,
-- leads, payments, QR tokens or applied migrations are deleted or rewritten.

alter table public.leads
  add column if not exists name_status text not null default 'unknown',
  add column if not exists name_source_message_id text,
  add column if not exists name_verified_at timestamptz;

alter table public.leads drop constraint if exists leads_name_status_check;
alter table public.leads add constraint leads_name_status_check
  check (name_status in ('unknown', 'profile_unverified', 'user_verified', 'admin_verified'));

-- Existing names remain intact. They are deliberately not promoted to a
-- verified name; a later conversation/admin action can do that explicitly.
update public.leads
set name_status = case
  when name is null or btrim(name) = ''
    or lower(btrim(name)) in ('asistente', 'por confirmar', 'sin nombre', 'lead sin nombre')
    then 'unknown'
  else 'profile_unverified'
end
where name_status = 'unknown';

alter table public.lead_event_journeys
  add column if not exists active_domain text not null default 'general',
  add column if not exists expected_reply text not null default 'none',
  add column if not exists state_version bigint not null default 0;

alter table public.lead_event_journeys drop constraint if exists lead_event_journeys_active_domain_check;
alter table public.lead_event_journeys add constraint lead_event_journeys_active_domain_check
  check (active_domain in ('event', 'service', 'support', 'general'));
alter table public.lead_event_journeys drop constraint if exists lead_event_journeys_expected_reply_check;
alter table public.lead_event_journeys add constraint lead_event_journeys_expected_reply_check
  check (expected_reply in ('none', 'event_choice', 'name', 'email', 'payment_action', 'service_goal'));

alter table public.event_payment_reminder_log
  add column if not exists error_code text,
  add column if not exists error_type text;
alter table public.event_payment_reminder_log drop constraint if exists event_payment_reminder_log_status_check;
alter table public.event_payment_reminder_log add constraint event_payment_reminder_log_status_check
  check (status in ('shadow', 'sending', 'sent', 'failed', 'skipped'));

create table if not exists public.whatsapp_inbound_jobs (
  id uuid primary key default gen_random_uuid(),
  whatsapp_message_id text not null unique,
  lead_id uuid references public.leads(id) on delete set null,
  phone_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'review')),
  attempt_count integer not null default 0,
  leased_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  last_error_type text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists whatsapp_inbound_jobs_due_idx
  on public.whatsapp_inbound_jobs (status, next_attempt_at);

create table if not exists public.whatsapp_outbound_actions (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  lead_id uuid references public.leads(id) on delete set null,
  phone_hash text,
  action_type text not null,
  state_version bigint not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'review')),
  external_id text,
  error_code text,
  error_subcode text,
  error_type text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists whatsapp_outbound_actions_lead_idx
  on public.whatsapp_outbound_actions (lead_id, created_at desc);

create table if not exists public.bot_turns (
  id uuid primary key default gen_random_uuid(),
  inbound_job_id uuid references public.whatsapp_inbound_jobs(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  state_version bigint not null default 0,
  domain text,
  intent text,
  confidence numeric,
  expected_reply text,
  answer_key text,
  engine_mode text,
  bot_version text,
  prompt_version text,
  validation_status text,
  validation_reasons text[] not null default '{}',
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  delivery_status text,
  created_at timestamptz not null default now()
);
create index if not exists bot_turns_created_idx on public.bot_turns (created_at desc);

do $$
declare t text;
begin
  foreach t in array array['whatsapp_inbound_jobs','whatsapp_outbound_actions','bot_turns'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- Pending human handoffs are an explicit bot pause. This is reversible by the
-- existing admin handoff close/reactivation flow and does not touch messages.
update public.leads l
set bot_paused = true,
    bot_paused_at = coalesce(bot_paused_at, now()),
    bot_paused_reason = coalesce(bot_paused_reason, 'manual')
where exists (
  select 1 from public.handoff_requests h
  where h.lead_id = l.id and h.status = 'pending'
);

notify pgrst, 'reload schema';
