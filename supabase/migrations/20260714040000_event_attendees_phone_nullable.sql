-- ============================================================================
-- Reabre event_attendees.phone_normalized a NULL — para que la ruta
-- `survey_attended` (sprint cierre-eventos-virtuales, 2026-07-11) pueda
-- crear attendees para confirmados email-only.
-- ============================================================================
-- Contexto (David, sesión 2026-07-13 20:18):
--   - C-4 (sprint 2026-07-12) agregó `phone_normalized NOT NULL` + UNIQUE
--     (event_id, phone_normalized) para cerrar el bug del UPSERT que duplicaba
--     filas cuando email era NULL. Justificación: los 49 rows existentes
--     tenían phone, así que era seguro.
--   - El día ANTERIOR (2026-07-11), la ruta survey_attended (migration
--     `20260711100000_event_attendee_source_survey_attended.sql`) se diseñó
--     para que un confirmado email-only que responda "Sí, ingresé" en la Q0
--     de la encuesta post-evento sea marcado como attendee via
--     UPSERT en `event_attendees`. El INSERT NO le pasa phone (vino de un
--     email-only confirmed).
--   - Las dos partes se contradicen: NOT NULL bloquea el INSERT de
--     survey_attended con error 23502 (not_null_violation). El código en
--     `surveys-server.ts:400` solo maneja 23505 (unique), por lo que el
--     upsert falla silenciosamente y el lead se promueve a event_attended
--     pero el row de event_attendees NUNCA se crea.
--
-- Síntoma observable:
--   "Submit survey funciona (lead se crea, se promueve), pero el confirmado
--    no aparece como attendee, no puede recibir certificado, y el funnel
--    post-evento no lo cuenta."
--
-- Fix:
--   DROP NOT NULL en phone_normalized. Las dos UNIQUE constraints siguen
--   activas y deduplican correctamente:
--     - UNIQUE (event_id, phone_normalized) — attendees CON phone se
--       dedupean por phone (mismo comportamiento que C-4).
--     - UNIQUE (event_id, email) — attendees SIN phone (solo email) se
--       dedupean por email (constraint legacy preservado).
--   Postgres trata NULLs como distintos en UNIQUE constraints, así que
--   múltiples rows con phone=NULL para el mismo evento NO chocan entre sí
--   — pero sí choca si tienen el mismo email (el otro UNIQUE).
--
-- Seguridad de la migration:
--   - Idempotente: si phone ya es nullable, no-op.
--   - Sin pérdida de datos: los 49+ rows existentes mantienen su phone.
--   - Backward-compat: la UNIQUE (event_id, phone_normalized) sigue
--     previniendo duplicados por phone como quería C-4.
--   - El código (`attendees-server.ts:127-141`) sigue rechazando
--     createAttendee si email Y phone son NULL — defense in depth.
--
-- REVERSIÓN (rollback):
--   ALTER TABLE public.event_attendees
--     ALTER COLUMN phone_normalized SET NOT NULL;
--   (esto fallaría si hay rows con phone IS NULL — esperado si hay
--    nuevos survey_attended inserts).
-- ============================================================================

DO $$
BEGIN
  -- 1. DROP NOT NULL (idempotente: si ya es nullable, ALTER es no-op).
  ALTER TABLE public.event_attendees
    ALTER COLUMN phone_normalized DROP NOT NULL;

  RAISE NOTICE 'phone_normalized ahora acepta NULL (survey_attended path habilitado).';
END $$;

-- 2. Comentario explicativo del cambio de política.
COMMENT ON COLUMN public.event_attendees.phone_normalized IS
  'Phone del attendee. NOT NULL fue revertido en 2026-07-13 (migration 20260714040000) para permitir la ruta survey_attended email-only. Dedup sigue funcionando: UNIQUE (event_id, phone_normalized) cuando hay phone, UNIQUE (event_id, email) cuando es email-only.';

-- 3. Notificar a PostgREST para que recargue el schema.
NOTIFY pgrst, 'reload schema';
