-- ============================================================
-- event_rules — contexto del bot por evento
-- ============================================================
-- Cada evento puede tener reglas de comportamiento para el bot:
--   - personality: tono (seria, casual, con humor, supervendedor, o libre)
--   - rules: array de strings (1 por linea en UI) — reglas que el admin
--     escribe a mano o que DeepSeek pre-llena desde la description.
--
-- El bot carga este JSON y lo inyecta en el system prompt. Regla dura
-- built-in (no almacenada aqui): "Solo responder con info del contexto
-- del evento. Si no sabes, di que no tienes la info."
--
-- Schema intencionalmente flexible (jsonb, sin CHECK estricto): las
-- reglas son texto libre y la personalidad es abierta (incluye opciones
-- predefinidas + custom string). Si en el futuro queremos normalizar,
-- migramos a columnas dedicadas.
-- ============================================================

alter table public.events
  add column if not exists event_rules jsonb
    not null default '{}'::jsonb;

comment on column public.events.event_rules is
  'Reglas de comportamiento del bot por evento. Estructura: { personality: string, rules: string[] }. Inyectado al system prompt del bot en loadActiveEventContext.';