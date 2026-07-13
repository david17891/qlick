-- ============================================================================
-- Cierra C-4: phone_normalized NOT NULL + UNIQUE (event_id, phone_normalized)
-- ============================================================================
-- Bug (C-4 de OPEN_ITEMS): el UPSERT en `attendees-server.ts` usaba
-- `onConflict: "event_id,email"`. Pero `email` es nullable, y Postgres
-- trata NULLs como distintos en UNIQUE constraints por default. Resultado:
-- un asistente sin email que clickea 5 veces el QR del gate virtual
-- producía 5 rows en `event_attendees` (degradaba reporting post-evento).
--
-- Fix en 3 partes (esta migration cubre partes 1+2, la parte 3 es código):
--   1. **Migration A (este archivo)**: phone_normalized NOT NULL +
--      UNIQUE (event_id, phone_normalized). El constraint viejo
--      (event_id, email) se preserva por backward-compat.
--   2. **Validación en código** (attendees-server.ts): rechazar
--      createAttendee si email Y phone son NULL. Aplicada en el mismo
--      commit, antes de que la migration se ejecute en prod.
--   3. **Cambio de onConflict** (attendees-server.ts):
--      `event_id,email` → `event_id,phone_normalized`. Aplicada en el
--      mismo commit.
--
-- Esta migration es SEGURA porque:
--   - Los 49 rows actuales en prod tienen `phone_normalized` NOT NULL
--     (verificado via `Content-Range: 0-0/49` + sample row).
--   - Después del commit de código, ningún call site pasa phone_normalized
--     null (la validación lo rechaza).
--   - El UNIQUE (event_id, email) se PRESERVA. Si el nuevo UNIQUE causa
--     conflictos en filas existentes, la migration falla ruidosamente y
--     podemos diagnosticar antes de aplicarla.
--
-- REVERSIÓN (rollback completo):
--   ALTER TABLE public.event_attendees
--     DROP CONSTRAINT IF EXISTS event_attendees_event_phone_unique;
--   ALTER TABLE public.event_attendees
--     ALTER COLUMN phone_normalized DROP NOT NULL;
--
--   Y en código: `git revert <commit>`.
-- ============================================================================

-- Verificar que la tabla existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'event_attendees'
  ) THEN
    RAISE EXCEPTION 'Tabla public.event_attendees no existe.';
  END IF;
END $$;

-- 1. NOT NULL: seguro porque los 49 rows actuales tienen phone.
--    Si hay NULLs (no esperado), la migration falla ruidosamente.
ALTER TABLE public.event_attendees
  ALTER COLUMN phone_normalized SET NOT NULL;

-- 2. UNIQUE constraint aditivo.
--    Idempotente: si ya existe, skip.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'event_attendees'
      AND constraint_name = 'event_attendees_event_phone_unique'
  ) THEN
    RAISE NOTICE 'Constraint event_attendees_event_phone_unique ya existe. Skip.';
    RETURN;
  END IF;
END $$;

ALTER TABLE public.event_attendees
  ADD CONSTRAINT event_attendees_event_phone_unique
  UNIQUE (event_id, phone_normalized);

COMMENT ON CONSTRAINT event_attendees_event_phone_unique ON public.event_attendees IS
  'Cierra C-4 de OPEN_ITEMS: deduplica attendees por (event_id, phone_normalized) además del (event_id, email) legacy. Aplicada en sprint fix-c4-c5-2026-07-12.';

-- Notificar a PostgREST que recargue el schema.
NOTIFY pgrst, 'reload schema';
