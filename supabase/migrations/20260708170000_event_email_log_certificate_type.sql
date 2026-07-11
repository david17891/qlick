-- ============================================================================
-- event_email_log: extender para soportar emails de certificados (2026-07-08)
--
-- Sprint Cert Email (fase 2 del sprint Concept C).
--
-- El sprint Concept C (v0.9.1) implemento la emision del certificado HTML
-- imprimible. Este migration extiende `event_email_log` para que el batch
-- "Mandar certs a todos" (admin > check-in > CertificateBatchPanel) pueda
-- loggear cada envio de email de cert con su tipo especifico.
--
-- Cambios:
--   1. DROP + ADD CHECK constraint en `email_type` para agregar el valor
--      'certificate' (junto a 'qr_pass', 'reminder_24h', 'reminder_2h').
--   2. ADD COLUMN `event_certificate_id` (nullable, FK a event_certificates).
--      Permite JOIN directo desde event_email_log al cert especifico que
--      se envio (para retry / reenvio).
--   3. Nuevo indice compuesto (event_certificate_id, sent_at desc) para
--      queries tipo "todos los envios del cert X".
--
-- RLS: no se modifican policies (sigue siendo service-role only).
-- Backfill: no requiere (no hay filas existentes con email_type='certificate').
-- ============================================================================

-- 1. Extender CHECK constraint en email_type
alter table public.event_email_log
  drop constraint if exists event_email_log_email_type_check;

alter table public.event_email_log
  add constraint event_email_log_email_type_check
  check (email_type in ('qr_pass', 'reminder_24h', 'reminder_2h', 'certificate'));

-- 2. Columna FK opcional hacia el cert especifico
alter table public.event_email_log
  add column if not exists event_certificate_id uuid
  references public.event_certificates(id) on delete cascade;

-- 3. Indice para queries por certificado
create index if not exists event_email_log_certificate_idx
  on public.event_email_log (event_certificate_id, sent_at desc)
  where event_certificate_id is not null;

comment on column public.event_email_log.email_type is
  'qr_pass = email del pase digital que manda el bot al registrarse. '
  'reminder_24h/2h = cron automatico antes del evento. '
  'certificate = email de constancia que manda el admin al emitir certs '
  'en batch (sprint v0.9.2 — Cert Email).';

comment on column public.event_email_log.event_certificate_id is
  'FK a event_certificates. Solo poblado cuando email_type=''certificate''. '
  'Permite reenviar el email del cert especifico o auditar quien recibio '
  'que folio.';