# Copy en español mexicano

## Auditoría 2026-07-23

Se corrigieron formas de voseo argentino que podían llegar al usuario en las
plantillas de WhatsApp, prompts de agentes, pagos, eventos, encuesta y mensajes
de error. El texto de la plantilla principal ahora dice:

> Responde con un botón o escribe tu pregunta

También se corrigió el flujo de selección ambigua de eventos (`te inscribes`,
`confirmas`, `responde`).

La detección de mensajes entrantes conserva variantes como `decime` o
`anotáme` para no perder compatibilidad con lo que las personas ya escriben;
esas variantes no se generan como respuesta.

## Regresión

`tests/mexican-tuteo-copy.test.mjs` revisa las superficies de copy visibles y
las dos plantillas de WhatsApp. Debe ejecutarse con:

```bash
node --test tests/mexican-tuteo-copy.test.mjs
```

