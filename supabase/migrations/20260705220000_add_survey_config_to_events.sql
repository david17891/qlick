-- ============================================================
-- events.survey_config — JSONB para encuestas dinámicas por evento
-- ============================================================
-- Cada evento puede definir sus propias preguntas, opciones, pesos
-- de scoring y mensajes de seguimiento (follow-ups) sin tocar
-- código. La columna vive en `events` (no en tabla separada) para
-- mantener el setup simple; si en el futuro queremos reutilizar
-- templates entre eventos, se extrae a `event_survey_templates`
-- con migration aditiva (no rompe nada).
--
-- Estructura esperada (validada en runtime via Zod en commit 3):
--   {
--     "questions": [
--       {
--         "id": "q1_clarity",
--         "text": "¿Qué tan claro te quedó el contenido del evento?",
--         "type": "buttons",
--         "options": [
--           { "id": "very_clear", "title": "Muy claro", "score": 20 },
--           { "id": "clear", "title": "Claro", "score": 15 },
--           { "id": "confusing", "title": "Confuso", "score": 5 }
--         ]
--       },
--       ...
--       {
--         "id": "q_consent",
--         "text": "¿Aceptas que te contactemos por WhatsApp?",
--         "type": "buttons",
--         "options": [
--           { "id": "yes", "title": "Sí", "score": 10, "isConsent": true },
--           { "id": "no", "title": "No", "score": 0 }
--         ]
--       },
--       {
--         "id": "q_business",
--         "text": "Contanos brevemente sobre tu negocio (o 'saltar').",
--         "type": "text",
--         "isBusinessDescription": true
--       }
--     ],
--     "followUps": {
--       "mql": { "text": "...", "templateName": "conf_bienvenida", "templateLanguage": "es_MX" },
--       "hot": { "text": "...", "templateName": null },
--       "coldWarm": { "text": "...", "templateName": null }
--     }
--   }
--
-- Default `{}` significa "usar plantilla Default del sistema" (5
-- preguntas, fallback en mapper commit 3). Evento sin custom config
-- sigue funcionando sin tocar nada.
--
-- Privacidad: el JSON puede contener textos de preguntas/opciones
-- que el admin escribe (no PII de leads). RLS heredada de `events`.
-- ============================================================

alter table public.events
  add column if not exists survey_config jsonb
    not null default '{}'::jsonb;

comment on column public.events.survey_config is
  'Configuración dinámica de la encuesta del evento. Estructura: { questions: SurveyQuestion[], followUps: { mql, hot, coldWarm } }. Si vacío, el mapper usa la plantilla Default del sistema (5 preguntas). Validado en runtime via Zod (commit 3).';