-- Sprint v0.11 multi-evento: desacoplar event_attendees.id de lead.id.
--
-- Caso de uso: un prospecto (lead) puede inscribirse a múltiples
-- masterclasses a lo largo del tiempo, y registrar acompañantes en
-- cada evento. Hasta Sprint v0.10, la fila de event_attendees usaba
-- el mismo UUID que el lead (acoplamiento 1:1): el LLM
-- `add_event_guest` insertaba attendees con `id = leadId` como
-- workaround, lo que prohibía multi-registro (un lead solo podía
-- tener 1 fila de attendee en TODA la tabla, sin importar el evento).
--
-- Esta migration agrega la columna `lead_id` con FK a `leads(id)`,
-- dejando `id` libre para ser un PK independiente de la inscripción.
-- Backfill aditivo:
--   1. Si una fila tiene `id = X` y existe un lead con `id = X`
--      (workaround del sprint v0.10), copiar el id a lead_id.
--   2. Si no, intentar matchear por `phone_normalized`.
--   3. Si tampoco, queda NULL (la fila no es recoverable pero se
--      preserva — la columna es nullable).
--
-- Idempotente: usa `IF NOT EXISTS` y patrones seguros.

-- 1. Agregar columna lead_id con FK a leads.
alter table public.event_attendees
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

-- 2. Backfill: para filas existentes, copiar el id al lead_id si
-- matchea un lead (workaround v0.10). Luego intentar por teléfono.
update public.event_attendees ea
set lead_id = ea.id
where ea.lead_id is null
  and exists (select 1 from public.leads l where l.id = ea.id);

update public.event_attendees ea
set lead_id = l.id
from public.leads l
where ea.lead_id is null
  and ea.phone_normalized is not null
  and ea.phone_normalized = l.phone;

-- 3. Índice para búsquedas por lead (executors del bot, CRM, admin).
create index if not exists idx_event_attendees_lead_id
  on public.event_attendees(lead_id);

-- 4. Comentario de la columna para visibilidad en el dashboard de Supabase.
comment on column public.event_attendees.lead_id is
  'FK a leads(id). Nullable durante la transición desde el modelo 1:1 de v0.10. NULL permitido solo en filas huérfanas pre-v0.11 (sin match por id ni phone).';
