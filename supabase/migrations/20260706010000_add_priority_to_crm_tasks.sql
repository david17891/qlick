-- ============================================================
-- crm_tasks.priority — columna para soporte de Promotion Engine
-- ============================================================
-- Bug detectado (2026-07-06, post-merge feat/funnel-dynamic-surveys-crm):
-- `promotion-engine.ts` (commit 7) inserta filas en `crm_tasks` con
-- el campo `priority` ('high' | 'medium' | 'low'), pero la tabla
-- original `crm_tasks` (migration 20260624000001) NO tiene esa columna.
-- Cuando el primer lead completa la encuesta y se ejecuta
-- `applyPromotionRules`, el INSERT falla con PGRST204 ("column not found")
-- y la promoción del lead se rompe silenciosamente (best-effort loggea
-- pero el status no avanza y el admin no recibe la alerta).
--
-- Esta migration agrega la columna `priority` con check constraint
-- para alinear el código con el schema.
--
-- Backfill: filas existentes quedan con `priority = NULL` (nullable).
-- El Promotion Engine se vuelve a invocar cuando llega una nueva encuesta
-- y crea filas nuevas con `priority` correcta.
--
-- Idempotente: `if not exists` + `add column`.
-- ============================================================

alter table public.crm_tasks
  add column if not exists priority text
    check (priority is null or priority in ('high', 'medium', 'low'));

create index if not exists crm_tasks_priority_idx
  on public.crm_tasks (priority)
  where priority is not null;

comment on column public.crm_tasks.priority is
  'Prioridad calculada por el Promotion Engine al cierre de la encuesta post-evento. high = MQL (score ≥ 60), medium = Hot (40-59), low = Warm (20-39). NULL en tareas manuales del CRM.';
