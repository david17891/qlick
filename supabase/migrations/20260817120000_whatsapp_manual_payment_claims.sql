-- Manual OXXO/transfer receipt intake. Additive only: no historical rows are
-- deleted or rewritten. Operational tables are service-role only.

create table if not exists public.whatsapp_media_attachments (
  id uuid primary key default gen_random_uuid(),
  whatsapp_message_id text not null unique,
  lead_id uuid references public.leads(id) on delete set null,
  phone_hash text,
  media_kind text not null check (media_kind in ('image', 'document', 'audio', 'video', 'sticker')),
  meta_media_id text not null,
  storage_bucket text not null,
  storage_path text,
  mime_type text,
  byte_size integer,
  sha256 text,
  status text not null default 'pending'
    check (status in ('pending', 'stored', 'failed', 'expired')),
  error_code text,
  created_at timestamptz not null default now(),
  stored_at timestamptz
);
create index if not exists whatsapp_media_attachments_lead_idx
  on public.whatsapp_media_attachments (lead_id, created_at desc);

create table if not exists public.event_manual_payment_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  confirmation_id uuid references public.event_confirmations(id) on delete set null,
  whatsapp_message_id text not null unique,
  receipt_attachment_id uuid references public.whatsapp_media_attachments(id) on delete set null,
  phone_normalized text,
  payment_method text not null check (payment_method in ('oxxo_card', 'transfer')),
  claimed_amount_mxn numeric(10,2),
  status text not null default 'review'
    check (status in ('received', 'review', 'approved', 'rejected')),
  customer_note text,
  reviewer_email text,
  reviewer_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_manual_payment_claims_queue_idx
  on public.event_manual_payment_claims (status, submitted_at desc);
create index if not exists event_manual_payment_claims_event_idx
  on public.event_manual_payment_claims (event_id, status, submitted_at desc);

insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['whatsapp_media_attachments','event_manual_payment_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
