-- Cola auditable e idempotente para rescates historicos de WhatsApp.
-- Service role only: la UI administrativa accede mediante Route Handlers.

create table if not exists public.lead_recovery_campaigns (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_key text not null,
  state text not null default 'candidate'
    check (state in (
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
  window_kind text not null default 'template_required'
    check (window_kind in ('service_24h', 'free_entry_72h', 'template_required')),
  reason text not null,
  source_conversation_id uuid references public.lead_whatsapp_conversations(id) on delete set null,
  source_requested_at timestamptz,
  scheduled_at timestamptz,
  sent_at timestamptz,
  replied_at timestamptz,
  last_error text,
  copy_version text not null default 'info_recovery_close_v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, campaign_key)
);

create index if not exists lead_recovery_campaigns_state_schedule_idx
  on public.lead_recovery_campaigns (state, scheduled_at)
  where state in ('candidate', 'eligible', 'failed');

create index if not exists lead_recovery_campaigns_lead_idx
  on public.lead_recovery_campaigns (lead_id, created_at desc);

alter table public.lead_recovery_campaigns enable row level security;

comment on table public.lead_recovery_campaigns is
  'Cola idempotente y auditable de recuperacion de leads de informacion por WhatsApp.';
