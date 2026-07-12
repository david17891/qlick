-- =============================================================================
-- SPRINT v16 (PR #1) — BUZÓN DE CONVERSACIONES NIVEL 1 + INFRA DE COSTOS
-- =============================================================================
-- Cierra el canónico v16 tras la revisión cruzada (David + Antigravity + Mavis).
-- Integra R1/R2/R3/M4/M5/X1/X2/X4 (semáforo de feedback v16).
--
-- Cambios DDL:
--   1. leads.archived_conversations_at  timestamptz NULL  (sello de archivado).
--   2. leads.last_read_at              timestamptz NULL  (último leído por admin).
--   3. bot_pause_reason + 'manual_global'  (enum extend, M4 matriz de pausa).
--   4. public.bot_usage_daily          (date, model) PK  (acumular tokens DeepSeek
--                                              sin saturar system_settings, M5).
--   5. soft_delete_conversation_tx()    PL/pgSQL RPC atómico (R2: 3 UPDATEs en TX).
--   6. ALTER PUBLICATION supabase_realtime ADD TABLE  (X4: push vs polling).
--
-- Idempotente: usa IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object.
-- =============================================================================

-- 1. leads.archived_conversations_at (R2/R3)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS archived_conversations_at timestamptz NULL;
COMMENT ON COLUMN public.leads.archived_conversations_at IS
  'Sello de archivado del buzón. listRealConversations() filtra mensajes con created_at <= este valor para que NO reaparezcan fantasmas al refrescar.';

-- 2. leads.last_read_at (M3 monotonic + indicador 🟢)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz NULL;
COMMENT ON COLUMN public.leads.last_read_at IS
  'Último timestamp en que el admin abrió esta conversación. El badge 🟢 aparece si last_inbound_at > last_read_at. UPDATE usa GREATEST() para monotonicidad.';

-- 3. enum bot_pause_reason: añadir 'manual_global' (M4)
ALTER TYPE public.bot_pause_reason ADD VALUE IF NOT EXISTS 'manual_global';
-- NOTA: COMMENT ON VALUE solo soporta Postgres 16+. La DB actual no lo
-- acepta, así que documentamos el valor en el código de bot-engine.ts.

-- 4. public.bot_usage_daily (M5)
CREATE TABLE IF NOT EXISTS public.bot_usage_daily (
  date date NOT NULL,
  model text NOT NULL,
  prompt_tokens bigint NOT NULL DEFAULT 0,
  completion_tokens bigint NOT NULL DEFAULT 0,
  call_count integer NOT NULL DEFAULT 0,
  estimated_cost_cents numeric(10,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_usage_daily_pkey PRIMARY KEY (date, model),
  CONSTRAINT bot_usage_daily_model_check CHECK (model IN ('deepseek-chat', 'deepseek-reasoner'))
);
COMMENT ON TABLE public.bot_usage_daily IS
  'Acumulador diario de tokens y costo estimado de DeepSeek V4 (Flash=deepseek-chat, Pro=deepseek-reasoner). UPSERT por (date, model). PR #2 de v16 lo escribe desde deepseek-provider.ts.';

CREATE INDEX IF NOT EXISTS bot_usage_daily_date_idx
  ON public.bot_usage_daily (date DESC);

-- 5. RPC atómica: soft_delete_conversation_tx (R2)
CREATE OR REPLACE FUNCTION public.soft_delete_conversation_tx(
  p_lead_id uuid,
  p_actor_email text,
  p_reason text DEFAULT NULL
) RETURNS TABLE(
  deleted_count integer,
  archived_at timestamptz
) AS $$
DECLARE
  v_phone text;
  v_now timestamptz := now();
  v_count integer := 0;
BEGIN
  -- 5.1. Resolver phone_normalized del lead.
  SELECT phone INTO v_phone
  FROM public.leads
  WHERE id = p_lead_id;

  IF v_phone IS NULL THEN
    v_phone := '';
  END IF;

  -- 5.2. Soft-delete de TODAS las filas de lead_whatsapp_conversations
  --      asociadas al lead (por lead_id O por phone_normalized, captura
  --      mensajes pre-lead que vivían con lead_id NULL).
  UPDATE public.lead_whatsapp_conversations
  SET deleted_at = v_now,
      deleted_by_email = p_actor_email,
      delete_reason = p_reason
  WHERE deleted_at IS NULL
    AND (lead_id = p_lead_id OR phone_normalized = v_phone);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 5.3. Soft-delete de TODAS las interacciones del lead.
  UPDATE public.lead_interactions
  SET deleted_at = v_now
  WHERE deleted_at IS NULL
    AND lead_id = p_lead_id;
  -- No sobrescribimos v_count; es informativo.

  -- 5.4. Sello de archivado en el lead.
  UPDATE public.leads
  SET archived_conversations_at = v_now
  WHERE id = p_lead_id;

  RETURN QUERY SELECT v_count, v_now;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

COMMENT ON FUNCTION public.soft_delete_conversation_tx(uuid, text, text) IS
  'RPC transaccional (R2): soft-delete de conversaciones de WhatsApp + interacciones internas + sello archived_conversations_at en el lead, todo en 1 sola TX. Reemplaza softDeleteConversation() server-side. (Sprint v16)';

-- 6. Realtime (X4): añadir la tabla al canal de Supabase Realtime.
--    Si la publicación no existe, no la creamos (es owned por Supabase).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_whatsapp_conversations;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
  WHEN OTHERS THEN
    -- Si la tabla ya estaba en la publicación, no-op.
    IF sqlerrm NOT LIKE '%already exists%' THEN
      RAISE;
    END IF;
END $$;

-- 7. NOTIFY pgrst para invalidar schema cache (patrón de migrations recientes).
NOTIFY pgrst, 'reload schema';
