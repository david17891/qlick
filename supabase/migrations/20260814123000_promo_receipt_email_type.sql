-- Comprobante propio de Qlick para la promoción CANACO.
-- Aditiva: conserva todos los registros y tipos existentes.

alter table public.event_email_log
  drop constraint if exists event_email_log_email_type_check;

alter table public.event_email_log
  add constraint event_email_log_email_type_check
  check (email_type in ('qr_pass', 'promo_receipt', 'reminder_24h', 'reminder_2h', 'certificate'));

comment on column public.event_email_log.email_type is
  'qr_pass = pase; promo_receipt = comprobante Qlick de promoción; '
  'reminder_24h/reminder_2h = recordatorios; certificate = certificado.';

notify pgrst, 'reload schema';
