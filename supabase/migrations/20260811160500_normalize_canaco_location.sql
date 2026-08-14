-- Mantiene la sede estructurada alineada con la descripción publicada para
-- que panel, checkout y WhatsApp compartan la misma fuente factual.
update public.events
set location = 'CANACO, Av. Álvaro Obregón 14-15, San Luis Río Colorado, Sonora'
where id = '4100ffe3-54c1-45c1-a3a6-515595a646ad'::uuid
  and location = 'CANACO';
