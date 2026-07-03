# Regla de registro del bot WhatsApp → panel "Confirmados"

**Status:** regla permanente (desde 2026-07-03).

## TL;DR

**Cuando el bot de WhatsApp completa el flow de inscripción de un lead,
SIEMPRE inserta una fila en `event_confirmations`.** El panel admin
"Confirmados" lee de esa tabla — sin la fila, el admin no ve al lead
aunque tenga QR válido.

## Por qué existe esta regla

Antes de esta regla, el bot:

1. Generaba `event_qr_tokens` (el QR del asistente)
2. Enviaba email con el pase digital
3. Respondía al lead "Listo, te registramos"

…pero **nunca insertaba en `event_confirmations`**. Resultado: el QR
funcionaba, el email llegaba, el lead estaba registrado en la práctica,
pero el panel admin mostraba "0 confirmados" porque leía de otra tabla.

Esto se descubrió cuando David se registró por el bot, completó todo el
flow, y al ir al admin no apareció.

## Paths del bot que deben crear confirmation

| Path (intent) | Cuándo ocurre | Crea confirmation |
|---|---|---|
| `provide_email` | Lead termina el flow dando email | **Sí** (path primario) |
| `interactive_event_inscribir` (re-registro) | Bot detecta QR existente y re-envía | **Sí** (defense in depth) |

Ambos pasan por `createConfirmation({ ..., source: "whatsapp_bot" })` en
`src/lib/whatsapp/bot-engine.ts`.

## Idempotencia

`createConfirmation` ya es idempotente por diseño (dedup por email o
phone_normalized, ver
`src/lib/events/confirmations-server.ts:124`). Llamarlo en ambos paths
es seguro: si la fila ya existe (caso normal de re-registro), devuelve
`created: false` sin duplicar.

## Filtro del panel admin

El panel "Confirmados" en `src/app/admin/eventos/[id]/page.tsx` tiene
un dropdown de fuente con las opciones:

- `imported_excel` (carga masiva)
- `public_form` (formulario web público)
- `manual` (alta manual del admin)
- `whatsapp_bot` ← **agregado en esta regla**

El admin puede filtrar específicamente por confirmados vía bot para
ver el impacto del canal WhatsApp.

## Comportamiento si falla

La inserción en `event_confirmations` es **best-effort**:

- Si falla (Supabase caído, schema mismatch, etc.) → `errorLog` + sigue.
- El QR sigue funcionando para el usuario (entregable primario).
- El admin verá al lead como "no confirmado" pero el registro es
  recuperable (re-importar desde la fila de `event_qr_tokens` o crear
  la confirmation manualmente desde DB).

Si el `createConfirmation` falla en producción, hay que:

1. Revisar `errorLog` / Vercel logs por el error code.
2. Verificar que el `event_id` se resolvió bien
   (`loadActiveEventContext(registrationEventSlug).id` no es null).
3. Si es schema mismatch, agregar el valor faltante al tipo
   `EventConfirmationSource` y/o a la DB.

## Archivos tocados por esta regla

- `src/types/events.ts` — `EventConfirmationSource` incluye `"whatsapp_bot"`.
- `src/lib/whatsapp/bot-engine.ts` — import + 2 calls a `createConfirmation`.
- `src/app/admin/eventos/[id]/page.tsx` — opción en el filtro de fuente.

## Tests pendientes (Fase 7)

- Integration test del flow `provide_email → confirmation creada`.
- E2E con Playwright: mandar mensaje al bot → ver fila en DB → ver
  fila en panel admin.