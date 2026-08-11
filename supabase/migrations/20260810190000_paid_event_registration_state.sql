-- Paid-event registration state (additive follow-up to
-- 20260810120000_event_payment_reminder_24h.sql).
--
-- This migration deliberately keeps the previous reminder column/table and
-- existing payment ledger values. It adds an operational registration state
-- so financial progress and attendance eligibility are not conflated.

alter table public.event_confirmations
  add column if not exists registration_status text,
  add column if not exists registration_confirmed_at timestamptz,
  add column if not exists payment_priority_expires_at timestamptz,
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

-- Preserve legacy rows while making the new state explicit. A free event is
-- confirmed immediately; an unpaid or unverified paid registration is not.
update public.event_confirmations
set registration_status = case
  when payment_status in ('not_required', 'paid', 'paid_manual') then 'confirmed'
  else 'payment_pending'
end
where registration_status is null;

update public.event_confirmations
set registration_confirmed_at = confirmed_at
where registration_status = 'confirmed'
  and registration_confirmed_at is null;

-- New records written by the application are explicitly assigned their state;
-- the default is conservative for any legacy writer that omits the column.
alter table public.event_confirmations
  alter column registration_status set default 'payment_pending',
  alter column registration_status set not null;

alter table public.event_confirmations
  drop constraint if exists event_confirmations_registration_status_check;
alter table public.event_confirmations
  add constraint event_confirmations_registration_status_check
  check (registration_status in ('payment_pending', 'confirmed'));

-- Keep the previously applied timestamp column intact. For new rows the app
-- writes both columns; this backfill only translates rows that opted into the
-- old reminder flow and never creates a new window for historical imports.
update public.event_confirmations
set payment_priority_expires_at = payment_reminder_eligible_at + interval '24 hours'
where payment_priority_expires_at is null
  and payment_reminder_eligible_at is not null;

alter table public.event_confirmations
  drop constraint if exists event_confirmations_payment_status_check;
alter table public.event_confirmations
  add constraint event_confirmations_payment_status_check
  check (payment_status in (
    'not_required',
    'pending',
    'partial',
    'paid',
    'paid_manual',
    'pending_verification',
    'revoked'
  ));

create index if not exists event_confirmations_registration_status_idx
  on public.event_confirmations (event_id, registration_status, confirmed_at desc);
create index if not exists event_confirmations_payment_priority_idx
  on public.event_confirmations (payment_priority_expires_at)
  where payment_priority_expires_at is not null
    and registration_status = 'payment_pending';
create index if not exists event_confirmations_lead_idx
  on public.event_confirmations (lead_id)
  where lead_id is not null;

-- Link only unambiguous email/phone matches. Ambiguous or missing matches stay
-- untouched for a later admin review; no PII is copied into logs.
with candidate_matches as (
  select
    ec.id as confirmation_id,
    (array_agg(l.id order by l.id))[1] as lead_id,
    count(*) as match_count
  from public.event_confirmations ec
  join public.leads l
    on (ec.phone_normalized is not null and ec.phone_normalized = l.phone_normalized)
    or (ec.email is not null and lower(ec.email) = lower(l.email))
  where ec.lead_id is null
  group by ec.id
  having count(*) = 1
)
update public.event_confirmations ec
set lead_id = cm.lead_id
from candidate_matches cm
where ec.id = cm.confirmation_id;

-- Expand the already-applied reminder log without dropping existing rows.
alter table public.event_payment_reminder_log
  drop constraint if exists event_payment_reminder_log_kind_check;
alter table public.event_payment_reminder_log
  add constraint event_payment_reminder_log_kind_check
  check (reminder_kind in (
    'payment_24h',
    'payment_nudge_4h',
    'payment_priority_24h',
    'payment_last_day'
  ));

alter table public.event_payment_reminder_log
  add column if not exists attempt_count integer not null default 0,
  add column if not exists scheduled_for timestamptz,
  add column if not exists last_attempt_at timestamptz;

create index if not exists event_payment_reminder_log_due_idx
  on public.event_payment_reminder_log (status, scheduled_for)
  where status in ('sending', 'failed');

-- Existing QR/access artifacts are retained for audit but become unusable for
-- unpaid registrations. No rows are deleted.
alter table public.event_qr_tokens
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

update public.event_qr_tokens token
set revoked_at = coalesce(token.revoked_at, now()),
    revoked_reason = coalesce(token.revoked_reason, 'payment_pending_registration')
from public.event_confirmations ec
where token.confirmation_id = ec.id
  and ec.registration_status = 'payment_pending'
  and token.revoked_at is null;

update public.event_access access_row
set access_status = 'revoked',
    granted_reason = coalesce(access_row.granted_reason, 'payment_pending_registration')
from public.event_confirmations ec
where access_row.confirmation_id = ec.id
  and ec.registration_status = 'payment_pending'
  and access_row.access_status = 'active'
  and access_row.access_source not in ('free_rsvp', 'manual_event_admin');

-- Keep legacy journey values readable while allowing the new explicit stages.
alter table public.lead_event_journeys
  drop constraint if exists lead_event_journeys_relationship_stage_check;
alter table public.lead_event_journeys
  add constraint lead_event_journeys_relationship_stage_check
  check (relationship_stage in (
    'new', 'info_requested', 'interested', 'capturing',
    'registered', 'payment_pending', 'confirmed',
    'attended', 'no_show', 'closed'
  ));

comment on column public.event_confirmations.registration_status is
  'Estado operativo de asistencia. payment_pending = datos capturados sin pago verificado; confirmed = evento gratuito o apartado/pago verificado.';
comment on column public.event_confirmations.registration_confirmed_at is
  'Momento en que un pago o apartado verificado habilitó la confirmación y el QR.';
comment on column public.event_confirmations.payment_priority_expires_at is
  'Fin de la prioridad comercial de 24 horas. No representa inventario físico reservado.';
comment on column public.event_confirmations.lead_id is
  'Vínculo opcional al lead cuando el match de email/teléfono fue inequívoco.';
comment on column public.event_qr_tokens.revoked_at is
  'Revocación reversible/auditable del token; los tokens no se borran.';

notify pgrst, 'reload schema';
