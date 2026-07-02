-- Sesion 2026-07-02: limpiar tokens de check-in de pruebas anteriores
-- para que el sandbox de David (+1 555 201 7643) pueda probar limpio
-- el flow multi-evento sin que el safety net "ya registraste tu asistencia"
-- aparezca por tokens viejos.
--
-- Por que:
--   David probaba varios flows (Flash, Pro, multi-evento) con el mismo
--   phone de sandbox. Cada vez que generaba un QR se creaba (o reusaba)
--   un token en event_qr_tokens. Algunos ya estaban checked_in_at por
--   pruebas. El nuevo flow heredo un token ya checked-in que causaba
--   que la pagina /check-in/[token] mostrara "ya registraste" antes
--   de que David pudiera probar el boton Confirmar.
--
-- Idempotente: solo borra si hay registros.
--
-- Para correr: pegar en Supabase SQL Editor y Run.
-- SOLO PARA EL SANDBOX de David (+1 555 201 7643). NO correr en produccion.

DELETE FROM event_qr_tokens
WHERE attendee_phone_normalized = '+15552017643';

-- Tambien limpio leads de prueba del sandbox para que created=true
-- y el flow de welcome dispare bien.
DELETE FROM leads
WHERE phone_normalized = '+15552017643';

-- Verificacion: deberia retornar 0 rows
SELECT COUNT(*) AS remaining_test_tokens
FROM event_qr_tokens
WHERE attendee_phone_normalized = '+15552017643';
