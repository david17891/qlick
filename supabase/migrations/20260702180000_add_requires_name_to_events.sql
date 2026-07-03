-- ============================================================================
-- Agregar requires_name a events (sesion 2026-07-02, Commit A)
--
-- Algunos eventos requieren que el bot pida el nombre completo del lead
-- ANTES del email (e.g. eventos con certificado, donde el nombre va
-- impreso en el diploma). Para eventos sin certificado, solo basta
-- con el email + telefono que WhatsApp ya nos da.
--
-- Este flag controla el flow del bot en `interactive_event_inscribir`:
--   - requires_name = false: pide email directo (comportamiento actual).
--   - requires_name = true:  pide nombre primero, luego email.
--
-- El evento 1 (IA y Marketing: Primeros Pasos) es el primer evento
-- con certificado, asi que le activamos el flag. Los otros 2 eventos
-- siguen en false (sin certificado por ahora).
--
-- FIX P0-3 (auditoria 2026-07-02) lo mencionamos como concern: hoy
-- NO estamos pidiendo nombre en el flow de inscripcion, lo que esta
-- bien para eventos gratis pero mal para eventos con certificado.
-- Esta migration + el flujo secuencial del bot-engine.ts cierran el
-- gap.
-- ============================================================================

alter table public.events
  add column requires_name boolean not null default false;

comment on column public.events.requires_name is
  'Si true, el bot pide nombre completo antes del email durante el '
  'flow de inscripcion. Usar para eventos con certificado donde el '
  'nombre va impreso.';

-- Seed: evento 1 (IA y Marketing) es el primer evento con certificado.
-- Eventos 2 (Ads en Meta) y 3 (Funnels GDL) siguen sin certificado.
update public.events
  set requires_name = true
  where slug = 'ia-marketing-primeros-pasos';