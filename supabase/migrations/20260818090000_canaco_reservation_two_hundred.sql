/* CANACO: unifica el apartado de cierre y el apartado normal en $200 MXN.
 *
 * Es una migración de datos aditiva: no elimina pagos, confirmaciones, QR ni
 * órdenes existentes. Solo actualiza el evento publicado de CANACO y su
 * contexto comercial para que la página, el checkout y el bot compartan la
 * misma fuente de verdad.
 */
with target as (
  select
    id,
    event_rules,
    coalesce(event_rules -> 'rules', '[]'::jsonb) as rules
  from public.events
  where slug = 'desarrollo-estructura-curso-canaco'
), rewritten as (
  select
    id,
    jsonb_set(
      jsonb_set(
        jsonb_set(event_rules, '{reservation_enabled}', 'true'::jsonb, true),
        '{reservation_amount_mxn}',
        '200'::jsonb,
        true
      ),
      '{balance_amount_mxn}',
      '800'::jsonb,
      true
    ) as event_rules,
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(
            case
              when value = 'El curso cuesta $1,000 MXN. Para apartar tu lugar se pagan $500 MXN y el saldo de $500 MXN se liquida el día del evento.'
                then 'El curso cuesta $1,000 MXN. Para apartar tu lugar se pagan $200 MXN y el saldo de $800 MXN se liquida el día del evento.'
              else value
            end
          ) order by ord
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements_text(rules) with ordinality as item(value, ord)
    ) as rules
  from target
)
update public.events as event
set
  event_rules = jsonb_set(rewritten.event_rules, '{rules}', rewritten.rules, true),
  description = replace(
    event.description,
    'Apartado: $500 MXN y liquida los $500 MXN restantes el día del evento.',
    'Apartado: $200 MXN y liquida los $800 MXN restantes el día del evento.'
  ),
  updated_at = now()
from rewritten
where event.id = rewritten.id;
