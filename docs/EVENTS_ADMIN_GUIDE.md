# Events Admin Guide — Qlick Marketing Integral

> **Manual operativo del panel de administración de eventos** (`/admin/eventos` + tab CRM del `/admin`).
> Para David y futuros admins que operan el día a día de los eventos: webinars, talleres, masterclasses.
>
> **Última revisión:** 2026-06-28 (cierre de Fase 5 — Paquete A+B+C+D+E).
> **Audiencia:** David (admin principal), socios con `ADMIN_EMAIL_ALLOWLIST`, futuros operadores.
> **Stack:** Next.js 14 + Supabase (Auth + DB + RLS) + Resend (email) + custom admin UI.

---

## Índice

1. [Acceso](#1-acceso)
2. [`/admin/eventos` — Lista de eventos](#2-admin-eventos--lista-de-eventos)
3. [`/admin/eventos/[id]` — Detalle del evento](#3-admin-eventosid--detalle-del-evento)
   - 3.1 [Tab Confirmados](#31-tab-confirmados)
   - 3.2 [Tab Asistentes](#32-tab-asistentes)
   - 3.3 [Tab Encuestas](#33-tab-encuestas)
   - 3.4 [Tab Leads promovidos](#34-tab-leads-promovidos)
   - 3.5 [Vista Pipeline (toggle)](#35-vista-pipeline-toggle)
4. [`/admin/eventos/[id]/import` — Wizard de import xlsx](#4-admin-eventosidimport--wizard-de-import-xlsx)
5. [EventDrawer — Crear / editar evento](#5-eventdrawer--crear--editar-evento)
6. [CRM Tab en `/admin` — Drawer del lead](#6-crm-tab-en-admin--drawer-del-lead)
   - 6.1 [Datos del lead + badge de evento](#61-datos-del-lead--badge-de-evento)
   - 6.2 [Cambiar etapa](#62-cambiar-etapa)
   - 6.3 [Acciones WhatsApp](#63-acciones-whatsapp)
   - 6.4 [Historial de contactos](#64-historial-de-contactos)
   - 6.5 [Notas internas](#65-notas-internas)
   - 6.6 [Tareas de seguimiento](#66-tareas-de-seguimiento)
7. [Flujo post-evento típico (workflow)](#7-flujo-post-evento-típico-workflow)
8. [WhatsApp workflow (estados + audit log)](#8-whatsapp-workflow-estados--audit-log)
9. [Estados del evento](#9-estados-del-evento)
   - [Undo archivar (toast 5s)](#undo-archivar-toast-5s)
   - [Clonar evento (Fase 5 Paquete D)](#clonar-evento-fase-5-paquete-d)
10. [Audit log (`/admin/system/audit-log`)](#10-audit-log-adminsystemaudit-log)
11. [Notificaciones por email (Resend)](#11-notificaciones-por-email-resend)
12. [Troubleshooting](#12-troubleshooting)
13. [Permisos y seguridad](#13-permisos-y-seguridad)
14. [Glosario](#14-glosario)
15. [Schema quick reference](#15-schema-quick-reference)

---

## 1. Acceso

### Auth en desarrollo (`NODE_ENV !== 'production'`)

Mientras estamos pre-producción, hay dos caminos para entrar al admin:

**Opción A — Magic link:** `/admin/login` → escribís tu email (debe estar en `ADMIN_EMAIL_ALLOWLIST` de `.env.local`) → te llega link al correo → entrás.

**Opción B — Dev login bypass (solo `NODE_ENV=development`):**

```bash
# Desde tu terminal, con dev server corriendo:
curl -X POST http://localhost:3000/api/dev/login \
  -H "Content-Type: application/json" \
  -d '{"email":"david17891@gmail.com","secret":"<DEV_ADMIN_SECRET>"}'
```

Esto setea las cookies `sb-*` y ya podés navegar a `/admin`. Útil para Playwright/automation.

> ⚠️ El endpoint `/api/dev/login` **devuelve 404 en producción** (`NODE_ENV === 'production'`). Es solo dev.

### Auth en producción (futuro)

Cuando se active Supabase Auth + middleware de admin, el flujo será:
- Google OAuth (ya implementado para alumnos en `feature/lms-real-foundation`)
- `ADMIN_EMAIL_ALLOWLIST` gate en middleware
- Posible 2FA para cuentas admin (roadmap item)

---

## 2. `/admin/eventos` — Lista de eventos

Pantalla principal del admin de eventos. Cards en grid (1 col mobile / 2 tablet / 3 desktop).

### Lo que muestra cada card

| Campo | Fuente | Ejemplo |
|---|---|---|
| Cover | Gradiente de marca (`bg-brand-gradient`) + título del evento en overlay | (siempre, sin imagen) |
| Status | `events.status` | Publicado / Borrador / Archivado |
| Slug | `events.slug` | `/taller-funnels-venta-cdmx` |
| Descripción | `events.description` (truncada a 2 líneas) | "Aprende a diseñar funnels..." |
| Fecha | `events.starts_at` (+ `ends_at` si existe) | "2 de julio de 2026" |
| Lugar | `events.location` | "Mexicali, BC" |
| **Confirmados** | COUNT de `event_confirmations` WHERE `event_id` | `42` |
| **Asistentes** | COUNT de `event_attendees` WHERE `event_id` | `28` |
| **Encuestas** | COUNT de `event_surveys` WHERE `event_id` | `15` |
| **Leads nuevos** | COUNT de `leads` joined via `lead_event_links` | `7` |

### Acciones

- **`+ Nuevo evento`** (top right) → abre `EventDrawer` en modo `create`.
- **Editar** (card button) → abre `EventDrawer` en modo `edit`.
- **Ver detalle** (card button) → navega a `/admin/eventos/[id]`.

### Empty state

Si no hay eventos: card con CTA "Crea el primer evento con el botón de arriba".

---

## 3. `/admin/eventos/[id]` — Detalle del evento

URL con UUID (no slug — si navegás con slug manual da 404 por diseño). Header card con badge de status + título + descripción + métricas de funnel + tabs.

### Métricas de funnel (header)

5 metric boxes en grid (2 cols mobile, 5 desktop):

1. **Confirmados** — `event_confirmations` count
2. **Asistentes** — `event_attendees` count
3. **Encuestas** — `event_surveys` count
4. **Leads promovidos** — leads via `lead_event_links`
5. **Tasa de conversión** — `attendees / confirmations` (ratio)

---

### 3.1 Tab Confirmados

Tabla de personas que confirmaron asistencia.

**Columnas:**
- Nombre + email + teléfono (truncados)
- Fuente (`messenger`, `whatsapp`, `form`, `manual`, etc.)
- Fecha de confirmación
- Estado de consentimiento comercial (`consent_to_contact`)

**Acciones en bulk (header de la tab):**
- **Broadcast WhatsApp** → arma `wa.me/...?text=<template>` para TODOS los confirmados (abre WhatsApp Web en nueva tab). El mensaje se personaliza con el nombre.

**Acciones por fila:**
- **Generar WhatsApp directo** → abre chat con la persona (si tiene teléfono).
- **Marcar como asistente** → linkea a un attendee (workflow: ver tab Asistentes).
- **Copiar email** (portapapeles).

**Filtros:**
- Búsqueda por nombre/email/teléfono (input arriba)
- Filtro por fuente (dropdown)

**Empty state:** "Sin confirmaciones. Importá un Excel o esperá registros públicos."

---

### 3.2 Tab Asistentes

Tabla de personas que efectivamente ASISTIERON al evento (check-in). Más delgada que Confirmados porque suele haber menos.

**Columnas:**
- Nombre + email + teléfono
- **Match status:** `matched` (ya vinculado a un confirmation) o `unmatched` (walk-in sin confirmation previa)
- Fuente (check_in, zoom, manual, etc.)
- Fecha de check-in

**Acción clave por fila (solo si `unmatched`):**
- **Matchear** → dropdown con lista de `unmatched_confirmations` del mismo evento → al matchear se crea un link `attendee ↔ confirmation`.

**¿Por qué matters el match?** Un attendee matcheado hereda el email/teléfono del confirmation → si la persona llena una encuesta después, el sistema sabe que ya existe en `leads` y no duplica.

**Empty state:** "Sin asistentes. Importá el Excel post-evento o marcalós manualmente."

---

### 3.3 Tab Encuestas

Tabla de encuestas post-evento (quien las llenó después).

**Columnas:**
- Nombre + email + teléfono
- **Consent comercial** — Sí/No (badge). Si Sí, la persona es elegible para promoción a lead.
- **Interés comercial** — texto libre ("info de curso", "precio", etc.)
- Reviewed status — ✅ Revisada (con timestamp + admin)

**Acciones por fila:**
- **Marcar revisada** → timestamp `reviewed_at` + `reviewed_by = current_admin`.
- **Des-marcar** → revierte.
- **Promover a lead** (solo si `consent = Sí`) → crea/merge en `leads` con `commercial_interest` del formulario.

**Empty state:** "Sin encuestas. Cuando alguien llene el form post-evento aparecerá acá."

---

### 3.4 Tab Leads promovidos

Lista de personas que contestaron la encuesta con `consent = Sí` y fueron promovidas a leads del CRM.

**Columnas:**
- Badge "Source: event" + nombre del evento de origen
- Nombre + email + teléfono
- Interés comercial capturado
- Botón **Ver lead en CRM** → navega a `/admin?tab=crm&leadId=<id>` y abre el drawer del lead.

**Diferencia con tab Encuestas:** acá solo los que ya están en `leads`. Encuestas tiene los respondedores (con o sin consent). El pipeline es: `survey (consent=true) → lead (en CRM)`.

**Empty state:** "Ningún lead promovido. Necesitás encuestas con consent = Sí y acción manual o auto-promoción (próximamente)."

---

### 3.5 Vista Pipeline (toggle)

Alternativa visual al detalle. Kanban de 5 columnas mostrando el funnel:

```
[ Confirmados ] → [ Asistentes ] → [ Encuestas ] → [ Leads ] → [ Convertidos ]
```

Cada columna muestra el count + cards clickeables que llevan al tab correspondiente.

Útil para visualizar de un vistazo el ratio de drop-off por etapa. **No es interactivo** — solo navegación.

---

## 4. `/admin/eventos/[id]/import` — Wizard de import xlsx

Página dedicada para subir Excels de confirmados/asistentes/encuestas al evento.

### Flujo

1. **Subís el archivo `.xlsx`** (drag & drop o file picker).
2. **Elegís el tipo de import:** `confirmation` / `attendee` / `survey` (cambia las reglas de dedup y los campos esperados).
3. **Marcás "Dry-run"** (default ON) para simular sin tocar la DB.
4. Click **Parsear (dry-run)** → muestra preview con `inserted / duplicates / invalid / warnings`.
5. Si todo se ve bien → desmarcá Dry-run → click **Importar de verdad**.

### Headers esperados

El parser es **tolerante con headers** vía sinonimos ES + EN con fuzzy match. **Pero no usa AI** — es determinista.

Si el Excel viene sucio, primero pasalo por ChatGPT/Gemini usando los prompts copy-paste ready de la card "Formato esperado" (cada tipo tiene su propio prompt).

Spec completa en `docs/IMPORT_FORMAT.md`.

### Errores comunes

| Warning | Causa | Solución |
|---|---|---|
| `header X no reconocido` | Header no está en sinonimos | Agregá sinonimo al importer o usá override manual |
| `email inválido` | Formato no es `algo@algo.algo` | Fix en Excel o descartar fila |
| `phone no normalizable` | No se puede extraer 10 dígitos MX | Fix en Excel (sin prefijo +52, sin guiones, sin espacios) |
| `consent ambiguo` | "tal vez", "ok", "sí plis" | El sistema **NO asume** — marca con `#CONSENT-AMBIGUOUS` para revisión manual |
| `sin email ni phone` | Fila sin identificador | Descartar fila |

### Idempotencia

`runEventImport` usa `importBatchId` para rollback selectivo. Re-importar el mismo archivo = duplicados detectados (no se duplican filas), cada run tiene un `batchId` único que podés usar para rollback desde SQL.

---

## 5. EventDrawer — Crear / editar evento

Panel lateral (`max-w-xl`, fullscreen mobile) con form completo.

### Campos

| Campo | Required | Notas |
|---|---|---|
| Título | ✅ | Validación inline (no vacío) |
| Slug (URL) | ✅ solo en create | Auto-generado del título si lo dejás vacío. NO editable en edit (rompería URLs públicas) |
| Descripción | ❌ | Texto libre, 3 rows |
| Fecha inicio | ✅ | `datetime-local`, validación inline |
| Fecha fin | ❌ | Debe ser > inicio si se completa |
| Ubicación | ❌ | Texto libre ("Mexicali, BC" o "https://zoom.us/...") |
| Cover image URL | ❌ | NO se usa actualmente (siempre gradiente). Campo en DB para futuro |
| Status inicial | ✅ solo en create | `draft` (default) o `published` |

### Acciones del drawer (modo edit)

Además del form:
- **Publicar** (si `draft` o `archived`) — abre modal de confirmación
- **Volver a borrador** (si `published`) — modal
- **Archivar** (si `draft` o `published`) — modal
- **Reactivar** (si `archived`) — modal

**Status:**
- `draft` → solo visible para admins
- `published` → visible en `/eventos/[slug]` (público)
- `archived` → oculto, datos conservados

---

## 6. CRM Tab en `/admin` — Drawer del lead

Drawer lateral del lead que se abre desde el pipeline kanban o desde el tab Leads promovidos.

### 6.1 Datos del lead + badge de evento

- Nombre + email + teléfono
- Fuente del lead (`event`, `messenger`, `whatsapp`, `form`, `manual`, etc.)
- Intención comercial
- Responsable (sales owner)
- Próximo seguimiento
- Valor estimado
- Consentimiento comercial

**Badge de evento:** Si el lead viene de un evento, aparece un pill arriba:
> "📅 De: Taller Funnels Venta CDMX · Interés: info de curso"

Indica el evento de origen + survey que lo promovió. Mismo source-of-truth que `lead_event_links` en DB.

### 6.2 Cambiar etapa

Dropdown con las etapas del pipeline:
- `Nuevo` → `Contactado` → `Interesado` → `Inscrito` / `Perdido`

PATCH contra `/api/admin/leads/[id]`. Estado `loading` mientras se guarda, success toast al confirmar.

### 6.3 Acciones WhatsApp

Botones rápidos que arman un template pre-armado y abren `wa.me/...`:
- **Información** — template "Hola [nombre], vi que te interesa [curso]..."
- **Inscripción** — template con CTA de inscribir
- **Pago pendiente** — template con recordatorio
- **Seguimiento** — template genérico de follow-up
- **Grupo** — link al grupo de WhatsApp
- **Soporte** — template de soporte

**Si `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` no está configurado**, los botones aparecen deshabilitados con tooltip "Configura NEXT_PUBLIC_WHATSAPP_SALES_NUMBER para habilitar los botones."

### 6.4 Historial de contactos

Cards cronológicas de cada contacto registrado (WhatsApp, email, llamada, etc.):

- **Badge dirección:** Entrante (inbound, lead te contactó) / Saliente (outbound, vos lo contactaste) / Sistema
- **Badge canal:** WhatsApp / Email / Llamada / Formulario / Sistema
- **Fecha** + **autor** (admin email)
- **Resumen** del contacto (texto libre)

**Form para registrar contacto nuevo:** dropdown Canal + dropdown Dirección + textarea Resumen → POST a `/api/admin/leads/[id]/interactions`. Si Resumen vacío → error inline con `role="alert"`.

### 6.5 Notas internas

Lista de notas del lead (internas, no se envían al lead). Form para agregar nota nueva con validación inline (no vacía).

Útil para: contexto que no querés que se vaya en un WhatsApp pero necesitás recordar ("llamó 3 veces, está muy interesada pero no puede pagar hasta junio").

### 6.6 Tareas de seguimiento

Recordatorios con `due_at` (opcional). Aparece en el Calendario CRM del `/admin` como:
- **Vencidas** (rojas) — `due_at < ahora`
- **Próximas** — `due_at >= ahora` o sin fecha

Form: Título (required, validación inline) + Descripción + Fecha de vencimiento.

Click en una tarea del Calendario → abre drawer del lead asociado.

---

## 7. Flujo post-evento típico (workflow)

Workflow recomendado para procesar un evento terminado. ~30 min de punta a punta para un evento con ~50 confirmados:

### Pre-evento (1-2 días antes)

1. **Crear el evento** (si no existe) → `/admin/eventos` → `+ Nuevo evento`.
2. **Subir confirmados** → `/admin/eventos/[id]/import` → tipo `confirmation` → Excel con RSVPs.
3. **Publicar** el evento (status = `published`) → aparece en `/eventos` público.

### Durante el evento

4. **Check-ins manuales o auto** → si tenés Excel del staff de puerta, importá como `attendee` al final.
5. **Generar WhatsApp** a confirmados para recordar ("Hola, te esperamos a las 7pm en [lugar]").

### Post-evento (mismo día o al día siguiente)

6. **Importar asistentes** → mismo wizard → tipo `attendee`. Si el staff marcó "no show" en el Excel, marcalo en la columna Asistió.
7. **Match manual** → ir a tab Asistentes → para cada `unmatched`, hacer match con el confirmation correspondiente (si la persona confirmó antes). Esto unifica los datos.
8. **Broadcast WhatsApp** a todos los confirmados → "Gracias por venir, acá va la grabación...".
9. **Importar encuestas** → tipo `survey`. Marcar manualmente las que tienen `consent = Sí` (futuro: auto-detección).
10. **Promover a leads** → tab Encuestas → para cada survey con consent, click "Promover a lead" → aparece en `/admin?tab=crm` y en el tab Leads promovidos del evento.
11. **Marcar encuestas como revisadas** → una vez que la viste, click "Marcar revisada" (timestamp + admin).
12. **Operar el CRM** → para cada lead promovido, evaluar etapa comercial, asignar owner, generar WhatsApp contextual.

### Métricas de cierre

Después del workflow, el header del evento muestra:
- **Conversión confirmados → asistentes:** X%
- **Conversión asistentes → encuestas:** X%
- **Conversión encuestas → leads:** X% (limitado por consent)

Esos ratios son los que importan para reporting a socios.

---

## 8. WhatsApp workflow (estados + audit log)

Cada lead promovido de un evento tiene un `whatsapp_status` independiente del estado comercial del pipeline.

### Estados (`lead_whatsapp_status` enum)

| Estado | Significado | Quién lo setea |
|---|---|---|
| `no_contactado` | Default. Nunca se le mandó WhatsApp. | (inicial) |
| `mensaje_preparado` | El admin armó el template pero aún no lo mandó. | Click "Generar WhatsApp" |
| `contactado` | Se le mandó el primer mensaje. | Manual (cuando confirma que lo mandó) |
| `respondió` | La persona respondió al WhatsApp. | Manual (cuando llega la respuesta) |
| `interested` | Respondió mostrando interés en comprar/inscribirse. | Manual |
| `lost` | No responde o dijo que no le interesa. | Manual |

**Nota:** actualmente el sistema NO detecta automáticamente el estado (no tenemos WhatsApp Business API integrado). Es manual — el admin cambia el dropdown cuando observa la interacción. **Próximamente**: integración con Meta Cloud API o un BSP para auto-detección.

### Audit log

Cada mensaje enviado genera un entry en `lead_whatsapp_log`:
- `lead_id`
- `channel` (`whatsapp` por ahora)
- `template_used` (qué botón se clickeó)
- `message_preview` (primeros 200 chars del mensaje)
- `sent_by` (admin email)
- `sent_at`

No almacena el contenido completo del mensaje (PII innecesaria en DB).

### Próximos pasos

- Integración con WhatsApp Business API (Meta Cloud o BSP tipo Twilio/360dialog)
- Auto-transición de estados según respuestas detectadas
- Templates branded con rich media (imágenes, botones)

---

## 9. Estados del evento

| Estado | Visibilidad pública | Acciones disponibles |
|---|---|---|
| `draft` | Solo admin | Publicar, Archivar |
| `published` | `/eventos/[slug]` público | Volver a borrador, Archivar |
| `archived` | Oculto | Reactivar (→ draft) |

**Importante:** Archivar NO borra datos. Confirmados, asistentes, encuestas y leads se conservan. Reactivar = vuelve a `draft` (no se re-publica automáticamente).

### Undo archivar (toast 5s)

Cuando archivas un evento desde el EventDrawer, aparece un **toast no-bloqueante** en la esquina inferior derecha con:
- Título: `"<título del evento>" archivado`
- Botón **Deshacer** (vuelve el evento a `draft`)
- Hint "Se cierra en 5s" + barrita de progreso animada
- Auto-dismiss en 5 segundos (cerralo antes con la ✕ si querés)

Si clickeás "Deshacer" antes de los 5 segundos, el evento vuelve a `draft` y el toast desaparece. Si dejás pasar los 5s, el toast se cierra solo y el archivado queda confirmado.

**Accesibilidad:** el toast tiene `role="status"` y `aria-live="polite"` para que screen readers lo anuncien sin interrumpir. Respeta `prefers-reduced-motion` (anula la animación de la barrita).

### Clonar evento (Fase 5 Paquete D)

En el footer del EventDrawer (modo edit), hay una fila separada con el botón **📋 Clonar evento**. Click creará una copia del evento actual con:
- Título: `"<título> (Copia)"` o `"<título> (Copia N)"` si ya hay copias
- Slug: `"<slug>-copia"` / `"<slug>-copia-N"` (único, auto-incrementa)
- Status: **`draft`** (forzado — la copia debe revisarse antes de publicar)
- Confirmados, asistentes, encuestas y leads: **NO se copian** (esos tienen FK al event_id, empiezan de cero en el clon)

Tras el OK, aparece un toast no-bloqueante **"`<título> (Copia)` clonado en borrador"** con link **Abrir clon** que te lleva al detail del nuevo evento. El clon queda en `draft` y debes editarlo/publicarlo explícitamente.

**Casos de error:**
- 409 si hay 50+ copias del mismo evento (caso patológico): borra alguna manualmente o cambia el slug manualmente.
- 409 si otro admin creó una copia al mismo tiempo (slug duplicado): reintentá.

---

## 10. Audit log (`/admin/system/audit-log`)

**Acceso:** `/admin/system/audit-log` (requiere admin).

**Qué registra:** cada acción que un admin hace sobre una entidad (crear evento, editar, cambiar status, archivar, clonar, promover survey a lead, etc.). Append-only — no se borra.

**Schema** (tabla `admin_audit_log`):
- `id` (uuid)
- `actor_email` (email del admin que hizo la acción)
- `action` (string, ej: `event_create`, `event_update`, `event_status_change`, `event_clone`)
- `entity_type` (`event`, `lead`, `survey`, `note`, `task`, `interaction`)
- `entity_id` (uuid de la entidad afectada)
- `metadata` (jsonb, contexto adicional — ej: `{changes: {...}}` para updates)
- `before` (jsonb, snapshot del estado ANTES — solo si aplica)
- `after` (jsonb, snapshot del estado DESPUÉS — solo si aplica)
- `created_at` (timestamp)

**Filtros disponibles** (URL-driven, no JS):
- `actorEmail` (email del admin)
- `entityType` (event / lead / survey / etc.)
- `action` (parcial: `event_create`, `event_status`, etc.)
- `from` / `to` (rango de fechas)

**Diff view:** cada fila con `before`/`after` muestra un expandible **"Ver diff"** que pinta los snapshots en rojo (antes) vs verde (después). Útil para entender exactamente qué cambió en un update sin tener que revisar el código.

**Casos de uso típicos:**
- "¿Quién archivó el evento X?" → filtrar por `entityType=event` + `action=event_status_change` + scroll.
- "¿Qué cambios hizo David en el último mes?" → filtrar por `actorEmail=david@qlick.mx` + `from=2026-06-01`.
- "¿Qué se modificó en este evento?" → filtrar por `entityId=<uuid>` + expandir el diff.

**Privacidad:** NO se loggea PII cruda (nombres, emails de leads/personas) en metadata. Solo IDs y métricas agregadas (ej: `surveyCount: 3`, no `respondentEmail: "..."`).

---

## 11. Notificaciones por email (Resend)

**Estado actual (post-Fase 5):** el wrapper de Resend está integrado pero **necesita setup** (ver `docs/SMTP_SETUP.md`). Sin API key, dev mode loggea en consola y todo funciona igual.

**Qué dispara emails:**
- `promoteSurveyToLead` (al promover una encuesta con consent=true) → manda email al admin.

**Configuración en `.env.local`:**
```
RESEND_API_KEY=re_xxxxx  # de resend.com/api-keys
RESEND_FROM_ADDRESS=notificaciones@qlick.mx
RESEND_REPLY_TO=david@qlick.mx
ADMIN_NOTIFICATION_EMAILS=david@qlick.mx,socio@qlick.mx
```

Si `RESEND_API_KEY` falta → dev mode (logs en consola, sin send real).
Si `RESEND_API_KEY` está pero falla el send → la operación principal (promover lead) sigue, se loggea el error.

**Template `survey-with-consent`:**
- Subject: "🎯 Nuevo lead de encuesta — <título del evento>"
- HTML inline con brand colors, link al drawer del lead.
- NO incluye nombre/email del respondente en el subject (anti-spam).

**Para activar:** seguir `docs/SMTP_SETUP.md` (signup → DNS records → API key → test). Tiempo estimado: 30 min.

---

## 12. Troubleshooting

## 10. Troubleshooting

### "Veo un evento pero el link Ver detalle da 404"

Estás navegando con slug en vez de UUID. La URL es `/admin/eventos/[UUID]` (no slug). Si necesitás soporte de slug, ver `OPEN_ITEMS.md` B-? (deuda técnica pre-existente).

### "El wizard de import dice 'No se encontraron headers reconocibles'"

Los headers del Excel no matchean ninguno conocido. Soluciones:
1. Pasá el Excel por ChatGPT/Gemini usando el prompt copy-paste de la card "Formato esperado".
2. Usá el `--map` override (formato JSON) para mapear manualmente cada header.

### "Promoví una encuesta a lead pero no aparece en el CRM"

Probable causa: el email del survey NO matchea con un lead existente Y el consent es ambiguo (no Sí). Verificá:
1. Tab Encuestas del evento → la fila tiene badge `consent: Sí`?
2. El email está bien formateado?
3. Refrescá la página del CRM (cache de 60s del Server Component).

### "Los botones de WhatsApp aparecen deshabilitados"

`NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` no está configurado en `.env.local`. Pedile a David el número o usá el dev login bypass para configurar.

### "El metric `asistieron` no cuadra con el Excel"

El cálculo es `COUNT(*) FROM event_attendees WHERE event_id = ?`. Si el Excel dice "30 asistentes" pero la métrica muestra "28", es probable que:
- 2 filas del Excel quedaron como `unmatched` y no se matchearon con confirmation (no cuentan como asistentes reales hasta matchear).
- O no se importó el Excel todavía.

### "El CSV/Excel se importa pero no veo los leads"

El import solo crea `event_*` rows. La promoción a lead es manual (click en Encuestas → consent Sí → "Promover a lead"). Próximamente: auto-promoción configurable.

---

## 11. Permisos y seguridad

### RLS (Row Level Security)

Todas las tablas de eventos tienen RLS habilitado (ver `migrations/20260627000000_events_funnel.sql`):
- `events` — lectura pública para `published`, escritura admin
- `event_confirmations` / `event_attendees` / `event_surveys` — lectura admin, escritura admin
- `lead_event_links` — lectura admin, escritura admin

### Auth de endpoints

Todos los `/api/admin/**` llaman `requireAdmin()` (server-side check, defensa en profundidad). Cookie de sesión de Supabase Auth + email en `ADMIN_EMAIL_ALLOWLIST`.

### Auditoría externa (2026-06-27)

Una auditoría independiente revisó:
- ✅ Race conditions en `promoteSurveyToLead` (UNIQUE INDEX sobre email + phone)
- ✅ PII fuera de logs (reemplazado por `emailLength`, `emailDomain`, etc.)
- ✅ RLS habilitado en todas las tablas nuevas
- ✅ `requireAdmin()` en todos los endpoints

Hallazgos abiertos (no críticos):
- `config.ts:56` mezcla secret en módulo importable (refactor mayor pendiente)
- `xlsx` tiene 5 vulnerabilidades transitive (mitigación: scope al CLI, no usado en runtime)

### Política de datos (PII)

**Regla inquebrantable:** datos personales reales (nombres, teléfonos, emails) NUNCA entran al repo, tests, fixtures, ni commits. Ver `docs/ROADMAP.md` §"Política de datos (PII)".

---

## 12. Glosario

| Término | Definición |
|---|---|
| **Confirmation** | Persona que confirmó asistencia (RSVPs) |
| **Attendee** | Persona que efectivamente asistió (check-in) |
| **Survey** | Encuesta post-evento (con o sin consent comercial) |
| **Lead** | Persona en el CRM con datos de contacto + intent comercial |
| **Walk-in** | Asistente que NO había confirmado antes (sin `confirmation` previa) |
| **Match** | Vínculo entre attendee y confirmation (mismo email/phone/nombre) |
| **Funnel** | Embudo Confirmados → Asistentes → Encuestas → Leads |
| **Conversion rate** | Ratio de una etapa del funnel a la siguiente |
| **Batch ID** | UUID único por import (permite rollback selectivo) |
| **Dry-run** | Simulación del import sin tocar la DB |
| **Magic link** | Email con link one-shot para login (alternativa a OAuth) |
| **Dev login bypass** | Endpoint `/api/dev/login` para automation (solo dev) |
| **Promoción** | Survey con consent → lead del CRM |

---

## 13. Schema quick reference

Para queries SQL ad-hoc (psql o Supabase SQL Editor):

### Tablas

- `events` — eventos (`draft`, `published`, `archived`)
- `event_confirmations` — RSVPs
- `event_attendees` — check-ins (con `match_status: matched | unmatched`)
- `event_surveys` — encuestas (con `reviewed_at` + `reviewed_by`)
- `event_survey_unmatched` — surveys sin email/phone (manual review)
- `lead_event_links` — vínculo N:M entre leads y event_* (con `link_type: confirmation|attendee|survey`)
- `leads` — leads del CRM (con `whatsapp_status` enum)
- `lead_whatsapp_log` — audit de mensajes enviados
- `lead_interactions` — historial de contactos (canal + dirección + summary)
- `lead_notes` — notas internas
- `crm_tasks` — tareas de seguimiento

### Enums clave

- `event_status`: `draft | published | archived`
- `match_status`: `matched | unmatched`
- `whatsapp_status`: `no_contactado | mensaje_preparado | contactado | respondió | interested | lost`
- `link_type`: `confirmation | attendee | survey`
- `interaction_channel`: `whatsapp | email | phone | form | system`
- `interaction_direction`: `inbound | outbound | system`

### Queries útiles

```sql
-- Total confirmados / asistentes / encuestas por evento
SELECT
  e.id,
  e.title,
  (SELECT COUNT(*) FROM event_confirmations WHERE event_id = e.id) AS confirmados,
  (SELECT COUNT(*) FROM event_attendees WHERE event_id = e.id) AS asistentes,
  (SELECT COUNT(*) FROM event_surveys WHERE event_id = e.id) AS encuestas
FROM events e
WHERE e.status = 'published'
ORDER BY e.starts_at DESC;

-- Leads promovidos de un evento específico
SELECT l.id, l.name, l.email, l.phone, l.commercial_interest
FROM leads l
JOIN lead_event_links lel ON lel.lead_id = l.id
JOIN event_surveys es ON es.id = lel.link_id AND lel.link_type = 'survey'
WHERE es.event_id = '<UUID>'
  AND l.consent_to_contact = true;

-- Rollback de un import específico (usar con cuidado)
DELETE FROM event_confirmations WHERE import_batch_id = '<BATCH_UUID>';
DELETE FROM event_attendees WHERE import_batch_id = '<BATCH_UUID>';
DELETE FROM event_surveys WHERE import_batch_id = '<BATCH_UUID>';
-- Si hubo promoción a leads, también cleanup manual de lead_event_links
```

⚠️ **Rollback queries** — usar con cuidado. Hacer backup antes.

---

## Apéndice A — Comandos útiles

```bash
# Dev server (requiere .env.local con SUPABASE_URL, etc.)
npm run dev

# Type-check
npm run type-check

# Lint
npm run lint

# Tests unitarios
npm test

# Seed demo event (idempotente)
node scripts/_get-event-id.mjs  # → muestra el ID del evento demo

# Fix typo en DB (requiere .env.local + luz verde)
node scripts/fix-taller-typo.mjs  # → preview, confirma con flag, verify

# Reset total del evento demo
node scripts/_reset-demo-event.mjs  # ⚠️ BORRA TODO del evento demo

# Dev login bypass (genera sesión admin temporal)
node tests/playwright/dev-login.mjs
```

---

## Apéndice B — Referencias cruzadas

- `docs/IMPORT_FORMAT.md` — spec del formato de Excel aceptado por el wizard
- `docs/EVENTS_FUNNEL_FOUNDATION.md` — concept spec + completion notes de Fase 3 (schema, server libs)
- `docs/EVENTS_FUNNEL_CONCEPT.md` — concept original del flujo
- `docs/CRM_STRATEGY.md` — estrategia del CRM (por qué estos estados, qué mide)
- `docs/AUDIT_REPORT.md` — auditoría externa de seguridad (cierre 2026-06-27)
- `docs/OPEN_ITEMS.md` §1 + §2 — deuda activa y features pendientes
- `docs/ROADMAP.md` §"En curso" — status Fase 4

---

**¿Encontraste algo que falta o está desactualizado?** Actualizá este doc en el mismo commit que cambia el comportamiento. Single source of truth.