-- ============================================================
-- issue_event_certificate() — RPC idempotente para emitir certs
--
-- Sprint Concept C 2026-07-08.
--
-- Por que RPC y no `upsert` desde JS:
--   - upsert() necesita ON CONFLICT en UNIQUE concreta. Aqui tenemos 2
--     UNIQUE: (folio) y (event_id, attendee_id). El "insert-if-not-exists"
--     correcto para idempotencia es por (event_id, attendee_id) — un cert
--     por attendee por evento. Pero si solo existe UNIQUE por folio,
--     upsert por event+attendee requiere UNIQUE compuesta, que no podemos
--     pasar como `onConflict` en Supabase JS sin ambiguedad.
--   - La race entre SELECT + INSERT (dos requests paralelos para el mismo
--     attendee) deja escapar UNIQUE violations que solo Postgres puede
--     resolver atomicamente. PL/pgSQL con EXCEPTION handler es la forma
--     canonica.
--
-- Comportamiento:
--   - Si ya existe cert para (event_id, attendee_id): NO inserta, devuelve
--     el row existente con `was_inserted=false`. Idempotente.
--   - Si NO existe: intenta INSERT. Si hay UNIQUE violation por race con
--     otra tx, re-SELECT y devuelve el row ganador.
--
-- Permisos: solo service_role. RLS de la tabla sigue protegiendo acceso
-- desde anon/authenticated.
-- ============================================================

create or replace function public.issue_event_certificate(
  p_event_id uuid,
  p_attendee_id uuid,
  p_folio text,
  p_template_variant text,
  p_metadata jsonb,
  p_admin_user_id uuid default null
)
returns table (
  folio text,
  event_id uuid,
  attendee_id uuid,
  issued_at timestamptz,
  template_variant text,
  metadata jsonb,
  was_inserted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.event_certificates%rowtype;
  inserted boolean := false;
  re_check_row public.event_certificates%rowtype;
begin
  -- 1. Checar si ya existe cert para (event, attendee).
  select * into result_row
    from public.event_certificates
    where event_id = p_event_id
      and attendee_id = p_attendee_id
    limit 1;

  if found then
    -- Ya existe. Devolver tal cual.
    folio := result_row.folio;
    event_id := result_row.event_id;
    attendee_id := result_row.attendee_id;
    issued_at := result_row.issued_at;
    template_variant := result_row.template_variant;
    metadata := result_row.metadata;
    was_inserted := false;
    return next;
    return;
  end if;

  -- 2. No existe. Intentar INSERT.
  begin
    insert into public.event_certificates (
      folio, event_id, attendee_id, template_variant, metadata, issued_by_admin_id
    ) values (
      p_folio, p_event_id, p_attendee_id, p_template_variant, p_metadata, p_admin_user_id
    )
    returning * into result_row;
    inserted := true;
  exception when unique_violation then
    -- 3. Race: otra tx inserto entre el SELECT y este INSERT.
    -- Re-SELECT el ganador (el UNIQUE puede ser por folio o por event+attendee).
    select * into re_check_row
      from public.event_certificates
      where event_id = p_event_id
        and attendee_id = p_attendee_id
      limit 1;
    if found then
      result_row := re_check_row;
      inserted := false;
    else
      -- Si tampoco lo encontramos, es una unique violation por folio, no por
      -- event+attendee. Bubble up el error para que el caller regenere folio.
      raise;
    end if;
  end;

  folio := result_row.folio;
  event_id := result_row.event_id;
  attendee_id := result_row.attendee_id;
  issued_at := result_row.issued_at;
  template_variant := result_row.template_variant;
  metadata := result_row.metadata;
  was_inserted := inserted;
  return next;
end;
$$;

-- Permisos: solo service_role (admin client server-side).
revoke all on function public.issue_event_certificate(uuid, uuid, text, text, jsonb, uuid) from public;
grant execute on function public.issue_event_certificate(uuid, uuid, text, text, jsonb, uuid) to service_role;

comment on function public.issue_event_certificate is
  'Emite (o devuelve existente) un certificado para (event_id, attendee_id). Idempotente y race-safe. Sprint Concept C 2026-07-08.';
