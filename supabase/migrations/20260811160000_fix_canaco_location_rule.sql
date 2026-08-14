-- La descripción publicada del evento CANACO ya contiene la sede exacta.
-- Reemplazamos únicamente las reglas históricas que la contradicen; no
-- tocamos conversaciones, pagos, leads ni confirmaciones.
update public.events as e
set event_rules = jsonb_set(
  coalesce(e.event_rules, '{}'::jsonb),
  '{rules}',
  (
    select jsonb_agg(
      to_jsonb(
        case
          when rule like 'Si preguntan por dirección exacta%'
            then 'Si preguntan por la sede, informa: CANACO, Av. Álvaro Obregón 14-15, San Luis Río Colorado, Sonora.'
          when rule like 'Cuando alguien pida información%'
            and rule like '%dirección exacta está por confirmar%'
            then replace(
              rule,
              'aclara que la dirección exacta está por confirmar',
              'menciona que la sede es CANACO, Av. Álvaro Obregón 14-15, San Luis Río Colorado, Sonora'
            )
          else rule
        end
      )
    )
    from jsonb_array_elements_text(coalesce(e.event_rules->'rules', '[]'::jsonb)) as item(rule)
  )
)
where e.id = '4100ffe3-54c1-45c1-a3a6-515595a646ad'::uuid;
