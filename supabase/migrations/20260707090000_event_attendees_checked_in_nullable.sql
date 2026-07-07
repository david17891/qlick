-- ============================================================
-- event_attendees.checked_in_at → NULLABLE sin DEFAULT
--
-- Contexto: el schema original de event_attendees declaraba
-- checked_in_at como NOT NULL con DEFAULT now(). Eso servia para
-- el flujo presencial (todo check-in implica un "estuvo ahi" en
-- el momento del INSERT).
--
-- Problema descubierto en la auditoria E2E de eventos virtuales
-- (sesion 2026-07-07): para el flow virtual, el gate "SI, VOY"
-- crea un attendee con intent_attended (source='zoom_export') ANTES
-- de que el usuario realmente entre al stream. La confirmacion
-- real llega despues, via la survey Q0 ("¿Ingresaste?"). Necesitamos
-- poder insertar attendees con checked_in_at=NULL y setearlo solo
-- cuando la survey confirma asistencia.
--
-- Fix: ALTER COLUMN checked_in_at DROP NOT NULL, DROP DEFAULT.
-- No afecta filas existentes (todas tienen checked_in_at != null).
-- ============================================================

alter table public.event_attendees
  alter column checked_in_at drop not null,
  alter column checked_in_at drop default;

comment on column public.event_attendees.checked_in_at is
  'Momento del check-in. NULL hasta que (a) el staff escanea el QR en puerta, o (b) el usuario confirma asistencia via survey Q0. Para eventos virtuales, queda NULL entre el click del gate y la confirmacion de la survey.';