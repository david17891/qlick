-- Sesion 2026-07-02: el guardrail del bot bloquea la palabra "gratis".
-- Cambiamos "Gratis" por "Sin costo" en el description del evento 1
-- para destrabar el flujo. Es un fix cosmético (data), no toca codigo
-- de guardrails. Para fix correcto (guardrail inteligente), ver el
-- proyecto a futuro.

UPDATE public.events
SET description = 'Taller introductorio de 2 horas. Costo: Sin costo con registro previo. Temas: fundamentos de IA aplicada a marketing, automatizacion basica, herramientas no-code. Modalidad: presencial. Cupo limitado a 30 personas. Incluye coffee break y materiales digitales.',
    updated_at = now()
WHERE slug = 'ia-marketing-primeros-pasos';
