-- Habilita la extensión pg_trgm (requerida por el índice GIN con gin_trgm_ops
-- en la migration 20260712044100_event_attendees_guests.sql).
-- pg_trgm es una extensión estándar de Postgres, sin riesgo de seguridad,
-- solo agrega operadores de similarity y trigrams. La usa el índice
-- para queries "buscar asistentes que tengan un acompañante llamado X".
create extension if not exists pg_trgm;
