-- ============================================================
-- 2026-07-21 — courses.status: agregar 'proximamente'
--
-- Contexto:
-- David pidió marcar todos los cursos del LMS como "Próximamente"
-- (todavía no están listos para matrícula). El CHECK constraint actual
-- solo permite 'draft' | 'published' | 'archived', lo que rechaza el
-- nuevo valor.
--
-- Decisión de diseño:
-- - Mantenemos 'draft' | 'published' | 'archived' como estaban.
-- - Agregamos 'proximamente' como un 4to estado "publicable pero no
--   listo para compra/inscripción".
-- - Es DISTINTO de 'draft': un curso 'draft' NO se ve en el catálogo
--   público (RLS). Un curso 'proximamente' SÍ se ve, pero con CTA
--   deshabilitado y badge "Próximamente" en la UI.
--
-- Lectura pública (`courses_public_read_published`) se mantiene como
-- está: solo `status = 'published'` es público/inscribible. Los
-- `proximamente` se consultan desde la app vía service role (admin)
-- o se hacen visibles en `/cursos` con una query explícita que incluye
-- 'proximamente' (ver src/lib/lms/courses-server.ts).
--
-- Idempotente:
-- - DROP + ADD del CHECK constraint.
-- - Si la migración se corre 2 veces, el 2do DROP no rompe nada
--   (IF EXISTS + recreate).
-- ============================================================

alter table public.courses
  drop constraint if exists courses_status_check;

alter table public.courses
  add constraint courses_status_check
  check (status in ('draft', 'published', 'archived', 'proximamente'));

comment on constraint courses_status_check on public.courses is
  'Estados válidos: draft (borrador), published (público/inscribible), archived (retirado), proximamente (visible pero sin matrícula).';
