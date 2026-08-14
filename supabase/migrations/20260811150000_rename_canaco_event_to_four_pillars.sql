-- Rename the published CANACO event without changing its stable id or slug.
-- The old title is kept as a guard so this migration is idempotent and cannot
-- overwrite a later business edit.
update public.events
set title = 'Los 4 Pilares de un Negocio que Vende'
where id = '4100ffe3-54c1-45c1-a3a6-515595a646ad'
  and title = 'Las 4 Patas de un Negocio que Vende';
