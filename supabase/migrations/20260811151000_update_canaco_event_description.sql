-- Keep the public event description aligned with its renamed title. Only the
-- exact legacy heading is replaced; the rest of the business copy is kept.
update public.events
set description = replace(
  description,
  'LAS 4 PATAS DE UN NEGOCIO QUE VENDE',
  'LOS 4 PILARES DE UN NEGOCIO QUE VENDE'
)
where id = '4100ffe3-54c1-45c1-a3a6-515595a646ad'
  and description like '%LAS 4 PATAS DE UN NEGOCIO QUE VENDE%';
