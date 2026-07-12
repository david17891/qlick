-- Sprint v0.9.8 Mejora 1: soporte de multi-registro de acompañantes
-- en event_attendees (sprint v0.9.7 ya mergeó el prompt anti-alucinación
-- en buildSuperExecutivePrompt; este sprint agrega la persistencia real
-- de los acompañantes que el LLM ahora SÍ puede registrar).
--
-- Caso de uso: un lead dice "quiero registrar también a mi socio Carlos".
-- El LLM llama a add_event_guest(parent_lead_id, "Carlos", "carlos@x.com").
-- El executor hace UPSERT/append en event_attendees.guests para que el
-- admin pueda ver al titular Y al acompañante en la tabla de asistentes.
--
-- Diseño: JSONB array en la MISMA fila del titular. Cada guest tiene:
--   - id: UUID (generado server-side) para identificación única.
--   - name: nombre completo.
--   - email: opcional.
--   - added_at: timestamp de cuándo se agregó.
--
-- El titular sigue siendo la fila principal de event_attendees (con su
-- confirmation_id, name, email, phone_normalized, etc.). Los
-- acompañantes se almacenan en el JSONB guests de ESA fila.
--
-- Idempotencia: si el LLM llama 2 veces con el mismo (event_id, name),
-- el executor hace upsert por nombre (no duplica el guest en el array).
--
-- RLS: la fila de event_attendees ya tiene RLS (sprint v0.6.0). El JSONB
-- guests hereda la misma policy. No se requieren cambios a RLS.

alter table public.event_attendees
  add column if not exists guests jsonb not null default '[]'::jsonb;

-- Constraint de shape: el array debe tener objetos con id, name, email?, added_at.
-- NO usamos CHECK constraint estricto (JSONB schemas pueden cambiar) pero
-- validamos en runtime en el executor.
-- Estructura esperada de cada elemento:
--   { "id": "uuid", "name": "text", "email": "text|null", "added_at": "iso8601" }

comment on column public.event_attendees.guests is
  'Sprint v0.9.8: array JSONB de acompañantes del titular. Cada elemento: {id, name, email?, added_at}. El LLM (Súper Ejecutivo) llama a add_event_guest para registrar un acompañante en el mismo chat.';

-- Índice GIN sobre guests.name para queries del admin del tipo
-- "buscar asistentes que tengan un acompañante llamado X".
create index if not exists event_attendees_guests_name_gin_idx
  on public.event_attendees
  using gin ((guests::text) gin_trgm_ops)
  where guests::text <> '[]';
-- NOTA: requiere extension pg_trgm. Si no está habilitada en el proyecto,
-- comentar la línea de arriba y dejar el índice para un sprint futuro.
-- En prod se verifica con: SELECT * FROM pg_extension WHERE extname='pg_trgm';
