-- ============================================================
-- v0.9.0 — Enrollment source attribution
--
-- Agrega columna `source` a `public.enrollments` para trackear
-- el origen del enrollment (QR, referido, campaña, orgánico).
-- ============================================================

alter table public.enrollments
  add column if not exists source text;

comment on column public.enrollments.source is
  'Origen del enrollment. Valores típicos: "qr" (vino por QR/link con ?ref=qr), "organic" (catálogo), "referral" (link de referido), "campaign" (campaña Meta/Google). NULL = no tracked.';
