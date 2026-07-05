-- ============================================================
-- events.short_code — ID corto aleatorio para el bot
--
-- 2026-07-05 (sesión David, "ya estás registrado" con nombres duplicados):
-- David creó 2 eventos con el mismo nombre. El bot WA, al validar
-- "ya estás registrado", caía en `loadActiveEventContext()` (que toma
-- el PRIMER published por start_at) y le decía que ya estaba
-- registrado en el evento equivocado.
--
-- Fix: agregamos `short_code` — 4 chars base32 (sin 0/1/O/I) aleatorio
-- único por evento. El bot lo reconoce en el cuerpo del mensaje y
-- lo usa como identificador canónico (no ambiguo) para:
--   - resolver el evento en `findEventInConversation`
--   - persistirlo en metadata del inbound/outbound
--   - mostrarlo en mensajes WA / email / admin / público
--
-- 32^4 = 1,048,576 combinaciones. La colisión natural (Birthday) se
-- vuelve probable (~50%) a ~37k eventos. A la escala de Qlick (decenas
-- de eventos/año) la colisión es ~1 vez cada ~700 eventos. El loop
-- con retry y el UNIQUE constraint la manejan silenciosamente.
--
-- Formato: A-H,J-N,P-Z,2-9 (sin O/I/0/1 para evitar confusión
-- visual). Ejemplos válidos: 7A3X, Q9K1, B4NZ, K7Q2.
-- Regex: `^[A-HJ-NP-Z2-9]{4}$`.
--
-- El trigger genera el código en INSERT si no viene provisto (defense
-- in depth: cualquier ruta que inserta — UI admin, REST, SQL —
-- garantiza invariante "toda evento tiene short_code").
--
-- Backfill: para los eventos existentes pre-migration (los ~5 de demo +
-- los reales). Loop PL/pgSQL con retry de colisión (cap 100) para
-- garantizar unicidad sin abortar el batch.
-- ============================================================

-- 1. Columna nullable (todavía) + el check constraint.
alter table public.events
  add column if not exists short_code text;

-- 2. Función generadora. Idempotente. Reusada por trigger y backfill.
--    Usa el alphabet definido igual que el cliente TS
--    (src/lib/events/short-code.ts) para garantizar paridad.
create or replace function public.generate_event_short_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars, sin 0/1/O/I
  v_code     text := '';
  v_i        int;
begin
  for v_i in 1..4 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
  end loop;
  return v_code;
end;
$$;

comment on function public.generate_event_short_code() is
  'Generador de short_code para events. 4 chars base32 sin 0/1/O/I. NO garantiza unicidad — caller debe reintentar si choca con UNIQUE constraint.';

-- 3. Backfill de eventos existentes con short_code NULL.
--    Loop con retry de colisión: hasta 100 tries por row.
--    Si choca 100 veces (imposible a esta escala pero por si acaso),
--    saltamos esa row y loggeamos. NO abortamos el batch.
do $$
declare
  v_event  record;
  v_tries  int;
  v_code   text;
  v_exists boolean;
  v_skipped int := 0;
begin
  for v_event in
    select id from public.events where short_code is null
  loop
    v_tries := 0;
    v_code := null;
    loop
      v_code := public.generate_event_short_code();
      select exists(
        select 1 from public.events where short_code = v_code and id <> v_event.id
      ) into v_exists;
      v_tries := v_tries + 1;
      exit when not v_exists or v_tries > 100;
    end loop;

    if v_exists then
      v_skipped := v_skipped + 1;
    else
      update public.events set short_code = v_code where id = v_event.id;
    end if;
  end loop;

  raise notice '[short_code] backfill: skipped % (colisiones tras 100 tries)', v_skipped;
end$$;

-- 4. UNIQUE + NOT NULL + CHECK (ahora que todos los rows tienen código).
create unique index if not exists events_short_code_unique
  on public.events (short_code);

alter table public.events
  alter column short_code set not null;

-- Check de formato (regex). Excluye 0/1/O/I explícitamente.
alter table public.events
  drop constraint if exists events_short_code_format_chk;

alter table public.events
  add constraint events_short_code_format_chk
  check (short_code ~ '^[A-HJ-NP-Z2-9]{4}$');

-- 5. Trigger BEFORE INSERT: si new.short_code es null, autogenera con
--    retry de colisión (cap 50 — al trigger también le pegaría el UNIQUE).
--    Si caller ya lo pasó, lo respetamos.
create or replace function public.events_set_short_code()
returns trigger
language plpgsql
as $$
declare
  v_tries  int := 0;
  v_exists boolean;
begin
  if new.short_code is not null then
    return new;
  end if;

  loop
    new.short_code := public.generate_event_short_code();
    select exists(
      select 1 from public.events where short_code = new.short_code
    ) into v_exists;
    v_tries := v_tries + 1;
    exit when not v_exists or v_tries > 50;
  end loop;

  return new;
end;
$$;

drop trigger if exists events_short_code_before_insert on public.events;
create trigger events_short_code_before_insert
  before insert on public.events
  for each row execute function public.events_set_short_code();

comment on column public.events.short_code is
  'ID corto aleatorio (4 chars base32 sin 0/1/O/I) UNIQUE por evento. WhatsApp-friendly. Lo usa el bot para desambiguar eventos con títulos similares. Auto-generado por trigger si no se provee.';
comment on index events_short_code_unique is
  'Garantiza unicidad del short_code. Las colisiones (extremadamente raras a esta escala, <0.05%) se resuelven con retry silencioso en INSERT.';
