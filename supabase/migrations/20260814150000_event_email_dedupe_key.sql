-- Clave lógica para deduplicar entregas transaccionales por orden, estado y
-- destinatario. Es aditiva y nullable para conservar todos los logs históricos.
alter table public.event_email_log
  add column if not exists dedupe_key text;

create index if not exists event_email_log_dedupe_key_idx
  on public.event_email_log (dedupe_key, sent_at desc)
  where dedupe_key is not null;

comment on column public.event_email_log.dedupe_key is
  'Clave lógica de idempotencia de una entrega; nullable para logs históricos.';
