-- ============================================================
-- lead_status enum — agregar 'qualified' (MQL bucket)
-- ============================================================
-- Bug detectado (2026-07-06, post-merge feat/funnel-dynamic-surveys-crm,
-- session QA funnel-simulation-tester):
-- `promotion-engine.ts` (commit 7) hace `UPDATE leads SET status =
-- 'qualified'` cuando el score del lead es >= 60 (MQL). Pero el enum
-- `lead_status` (creado en migration 20260623000001) NO incluye ese
-- valor — solo tiene: new, contacted, interested, info_requested,
-- payment_pending, enrolled, active_student, lost, archived.
--
-- Resultado en producción: cada lead MQL que completa la encuesta
-- genera `22P02 invalid input value for enum lead_status: "qualified"`
-- en `applyPromotionRules`. Best-effort loggea pero no:
--   - avanza el status del lead,
--   - crea la tarea CRM (porque la condición chequea `newStatus` local
--     que nunca llega al result),
--   - registra el audit log (que sí se inserta porque depende solo
--     de `notifyAdmin`, no del resultado del UPDATE).
--
-- Esta migration agrega 'qualified' al enum, alineando el código con
-- el schema. Idempotente: `add value if not exists`.
--
-- PG note: ALTER TYPE ... ADD VALUE corre fuera de transaccion (cada
-- archivo = tx separada) — patrón consistente con la migration
-- 20260704200000_lead_scoring_and_survey_completed.sql que ya agregó
-- 'survey_completed' al mismo enum.
-- ============================================================

alter type public.lead_status add value if not exists 'qualified' after 'interested';

comment on type public.lead_status is
  'Estados del lead en el CRM. ''qualified'' = MQL del funnel post-evento (score ≥ 60). Agregado 2026-07-06 por migration 20260706020000 (bug Promotion Engine).';
