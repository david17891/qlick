# Events Funnel — Concept (Fase 1)

> **Fecha:** 2026-06-26
> **Estado:** Conceptual. NO es implementación. Es el spec que la Fase 3
> (módulo de eventos + importador) va a seguir.
> **Requisito previo:** `MASTERCLASS_FUNNEL_FOUNDATION.md` v0.6.0 ya
> implementado (mismo patrón, lo extendemos).

---

## 1. Por qué este doc

El cliente reposicionó Qlick el 2026-06-26: la plataforma no es solo un
LMS, es un **sistema para captar prospectos, convertirlos en alumnos y
darles seguimiento**. Ese flujo empieza afuera del LMS — en eventos,
conferencias, encuestas — y termina adentro (inscripción, curso, progreso).

Este doc describe el flujo conceptual de eventos en Qlick. El patrón
base ya existe (masterclass funnel), lo que falta es **generalizarlo** a
eventos completos con:

- Múltiples canales de captación (QR general, formulario, landing, etc.)
- Confirmación de asistencia separada del registro
- Encuesta post-evento con consentimiento explícito
- Handoff a WhatsApp manual (sin API todavía)
- Cruce con leads existentes por teléfono/email normalizado
- Detección de duplicados

No implementamos nada en este doc. Es la **fuente de verdad del modelo**
para la Fase 3.

---

## 2. El flujo end-to-end (los 6 stages del cliente)

```
[1] CAPTADO     Visitante confirmó asistencia vía QR/landing/form.
       ↓
[2] ASISTIÓ     Verificación de asistencia real (check-in el día, o lista posterior).
       ↓
[3] ENCUESTADO  Recibió y respondió la encuesta post-evento.
       ↓
[4] CONSINTIÓ   Marcó consentimiento para seguimiento comercial en la encuesta.
       ↓
[5] CONTACTADO  Qlick preparó mensaje WhatsApp; el admin lo envió manualmente.
       ↓
[6] INTERESADO  Mostró interés comercial → se convierte en LEAD activo.
       ↓
[7] INSCRITO    Se inscribió a un curso (puede pagar o no).
```

Stages 1-2 son event-side (no tocan el CRM todavía). Stage 3-4 agregan
consentimiento (sin esto, **no** se mueve al CRM — principio de la
política de datos). Stages 5-7 son CRM-side.

### Mapeo al patrón masterclass (lo que ya tenemos)

| Stage del cliente              | Masterclass equivalente                          | Diferencia |
|--------------------------------|--------------------------------------------------|------------|
| [1] CAPTADO                    | `masterclass_registrations.registration_status = 'registered'` | Event tiene **dos** fuentes de "captado": el form público (igual que masterclass) Y un Excel importado (no existe en masterclass). |
| [2] ASISTIÓ                    | `attendance_status = 'attended'`                 | Igual. |
| [3] ENCUESTADO                 | (no existe)                                       | **Nuevo**: tabla `event_surveys` + flag `surveyed_at`. |
| [4] CONSINTIÓ                  | `consent_to_contact` (boolean)                    | Mismo campo, pero en event se captura de la encuesta, no del form. |
| [5] CONTACTADO                 | (no existe)                                       | **Nuevo**: campo `contacted_at` + log de mensaje preparado. |
| [6] INTERESADO                 | `commercial_status = 'interested'`                | Igual, pero el trigger es la respuesta de encuesta, no un click del admin. |
| [7] INSCRITO                   | `commercial_status = 'converted'` + `enrollment` row | Igual. |

---

## 3. Modelo de datos (4 tablas nuevas + 1 reusada)

### 3.1 `public.events` (NUEVO)

Catálogo de eventos (conferencias, webinars, meetups). Lectura pública
solo si `status='published'`. Escritura solo service role.

| Campo           | Tipo                          | Notas |
|-----------------|-------------------------------|-------|
| `id`            | uuid PK                       | |
| `slug`          | text UNIQUE NOT NULL          | base de URL pública |
| `title`         | text NOT NULL                 | ej. "Marketing + IA en UABC km43" |
| `description`   | text NULL                     | |
| `starts_at`     | timestamptz NOT NULL          | |
| `ends_at`       | timestamptz NULL              | |
| `location`      | text NULL                     | dirección física o link |
| `cover_image_url` | text NULL                   | |
| `status`        | enum (`draft`/`published`/`archived`) | default `draft` |
| `created_at`    | timestamptz NOT NULL          | |
| `updated_at`    | timestamptz NOT NULL          | trigger |

### 3.2 `public.event_confirmations` (NUEVO)

Personas que **confirmaron** asistencia al evento. **No son alumnos.**
No son leads todavía. Son prospectos en frío. Importados del Excel o
del form público.

| Campo              | Tipo                                | Notas |
|--------------------|-------------------------------------|-------|
| `id`               | uuid PK                             | |
| `event_id`         | uuid FK NOT NULL                    | ON DELETE CASCADE |
| `name`             | text NOT NULL                       | puede ser null si el Excel no tiene nombre |
| `email`            | text NULL                           | normalizado a lowercase |
| `phone_raw`        | text NULL                           | tal como vino del Excel (ej. "33 1234 5678") |
| `phone_normalized` | text NULL                           | formato canónico: `+52XXXXXXXXXX` (lo usa el cross-check) |
| `source`           | enum (`imported_excel`/`public_form`/`manual`) | cómo entró a la DB |
| `confirmed_at`     | timestamptz NOT NULL                | |
| `import_batch_id`  | uuid NULL                           | agrupa filas del mismo import (rollback fácil) |
| UNIQUE             | (`event_id`, `email`) o (`event_id`, `phone_normalized`) | evita duplicados del mismo import |

**Privacidad:** RLS deniega SELECT para `anon` y `authenticated`. Solo
service role (admin server-side). El importador y el admin panel son
los únicos que leen.

### 3.3 `public.event_attendees` (NUEVO)

Quién **realmente** asistió. Se llena el día del evento o después
(check-in manual, lista de Zoom, registro de puerta, etc.). Puede venir
del Excel que tiene la lista real de asistentes, o marcarse manual.

| Campo              | Tipo                                | Notas |
|--------------------|-------------------------------------|-------|
| `id`               | uuid PK                             | |
| `event_id`         | uuid FK NOT NULL                    | |
| `confirmation_id`  | uuid FK NULL                        | link opcional a `event_confirmations` (si tenemos el match) |
| `name`             | text NULL                           | si el check-in no lo matchea con la confirmación |
| `email`            | text NULL                           | normalizado |
| `phone_normalized` | text NULL                           | |
| `checked_in_at`    | timestamptz NOT NULL                | |
| `checked_in_by`    | text NULL                           | nombre del admin que marcó (audit) |
| `source`           | enum (`check_in`/`imported_excel`/`zoom_export`/`manual`) | |

**Detección de "asistió sin confirmar"**: si la fila de attendees no
matchea con ninguna confirmation por email/phone, igual se guarda (la
persona pudo haberse presentado sin confirmar antes). Se reporta al
admin en el panel: "X personas asistieron sin confirmación previa".

### 3.4 `public.event_surveys` (NUEVO)

Respuestas de la encuesta post-evento (Google Forms o el form que
venga). **Esta es la pieza que gatilla el consentimiento comercial.**

| Campo              | Tipo                                | Notas |
|--------------------|-------------------------------------|-------|
| `id`               | uuid PK                             | |
| `event_id`         | uuid FK NOT NULL                    | |
| `confirmation_id`  | uuid FK NULL                        | link si matcheó |
| `attendee_id`      | uuid FK NULL                        | link si matcheó |
| `respondent_email` | text NULL                           | normalizado |
| `respondent_phone` | text NULL                           | normalizado |
| `responses`        | jsonb NOT NULL                      | respuestas crudas, ej. `{"calificacion": 9, "tema_interes": "ads"}` |
| `consent_to_contact` | boolean NOT NULL                  | **el campo clave**: sin esto, no se promueve a lead |
| `commercial_interest` | text NULL                       | respuesta libre o categoría, ej. "Sí quiero info de cursos" |
| `submitted_at`     | timestamptz NOT NULL                | |
| `import_batch_id`  | uuid NULL                           | agrupa filas del mismo import |

**Cruce**: una fila de `event_surveys` puede matchear con confirmation
y/o attendee por email o phone. Si matchea con attendee, sabemos que
esa persona ASISTIÓ Y RESPONDIÓ. Si no matchea con ninguno (respondió
la encuesta sin haber confirmado ni asistido), igual se guarda — es
un lead inbound puro.

### 3.5 `public.leads` (REUSADO, no se modifica)

El CRM ya tiene `leads` con `source: 'event'` en el union type. La
integración con eventos **crea una fila en `leads`** cuando se cumplen
las condiciones de promoción. Ver §5.

---

## 4. Diagrama de transiciones de estado

```
                    ┌─────────────┐
                    │  CONFIRMADO │  event_confirmations
                    │  (import o  │  registration_status
                    │   form)     │
                    └──────┬──────┘
                           │ día del evento
                           ▼
                    ┌─────────────┐
                    │  ASISTIÓ    │  event_attendees.checked_in_at
                    │  (check-in) │
                    └──────┬──────┘
                           │ post-evento
                           ▼
                    ┌─────────────┐
                    │ ENCUESTADO  │  event_surveys.submitted_at
                    │  (Forms)    │
                    └──────┬──────┘
                           │ SI consent_to_contact = true
                           │ Y commercial_interest menciona intención
                           ▼
                    ┌─────────────┐
                    │  LEAD CREADO│  leads.status = 'new'
                    │  (CRM)      │  leads.source = 'event'
                    │             │  leads.metadata.event_id = ...
                    └──────┬──────┘
                           │ admin genera mensaje wa.me
                           ▼
                    ┌─────────────┐
                    │ CONTACTADO  │  leads.status = 'contacted'
                    │  (WhatsApp  │  + crm_tasks.wa_sent_at
                    │   manual)   │
                    └──────┬──────┘
                           │ responde con interés
                           ▼
                    ┌─────────────┐
                    │ INTERESADO  │  leads.status = 'interested'
                    └──────┬──────┘
                           │ clickea link, se inscribe
                           ▼
                    ┌─────────────┐
                    │ INSCRITO    │  leads.status = 'enrolled'
                    │             │  + enrollments + course_access
                    └─────────────┘
```

Estados terminales: `LOST` (no respondió, no interesado, etc.) o
`ARCHIVED` (después de N meses sin actividad).

---

## 5. Reglas de promoción a Lead

Una persona de `event_surveys` se promueve a `leads` **solo si se
cumplen TODAS estas condiciones**:

1. `consent_to_contact = true` (sin esto, NO se promueve, aunque haya
   interés comercial — principio de la política de datos)
2. `commercial_interest` no es vacío/null
3. Email O phone está presente (para poder hacer follow-up)

Si falta alguna, el sistema registra el prospecto en una tabla auxiliar
`event_survey_unmatched` (opcional, para reporte del admin: "tuviste
X respuestas con interés comercial pero sin consentimiento"). Esto
permite al admin ver el dato sin haberlo promovido.

**Anti-duplicados:** antes de crear el lead, se busca por email O phone
normalizado. Si ya existe un lead con ese email/phone:
- Si el lead existente es `lost`/`archived` → re-abrir como `new`
- Si el lead está activo → NO crear duplicado, solo agregar
  `metadata.event_id` al lead existente (link al evento)

---

## 6. WhatsApp manual (sin API)

**NO** integramos WhatsApp Business API todavía. El flujo es:

1. Admin abre la card del lead (CRM) → ve "📅 Vino de evento X, encuesta Y, interés Z"
2. Click "Generar mensaje WhatsApp"
3. Qlick arma un mensaje pre-llenado usando el template de la intención:
   ```
   Hola [nombre], ¿cómo estás? Soy [nombre del equipo] de Qlick.
   Te escribo porque nos conocimos en [evento]. Vi que en la
   encuesta te interesó [tema]. ¿Tenés 10 min esta semana para
   una llamada rápida donde te cuento cómo podemos ayudarte?
   ```
4. Qlick abre `wa.me/52XXXXXXXXXX?text=...` en una pestaña nueva
5. Admin abre WhatsApp Business en su teléfono, pega/manda el mensaje
6. Vuelve a Qlick → click "✓ Contactado" → `leads.status = 'contacted'`
7. Audit log: `crm_interactions` con `channel = 'whatsapp'`,
   `direction = 'outbound'`, `message_body = ...`, `sent_by = admin_email`

**Estados del botón (matching the client's spec):**

| Estado interno         | Botón muestra | Al click |
|------------------------|---------------|----------|
| `no_contactado`        | "Generar WhatsApp" | genera link wa.me |
| `mensaje_preparado`    | "Copiar mensaje" | copia al clipboard |
| `contactado`           | "Marcar respondió" | → `respondió` |
| `respondió`            | "Marcar interesado" / "no_interesado" | → `interested` / `lost` |
| `interested`           | "Inscribir" / "Programar llamada" | abre flow de inscripción o crea task |
| `not_interested`       | (terminal) | — |
| `inscrito`             | (terminal) | — |
| `lost`                 | (terminal) | — |

---

## 7. Privacidad y consentimiento (la regla inquebrantable)

Esto se alinea con `docs/ROADMAP.md → Política de datos (PII)`:

- **NO se promueve a lead** sin `consent_to_contact = true` en la encuesta
- **NO se asumen consentimientos implícitos** ("vino al evento" ≠ "acepta ser contactado comercialmente")
- **NO se suben Excels al repo** — el importador lee desde `QLICK_IMPORT_PATH` o ruta local
- **NO se loguean datos personales en consola** — usar IDs, no valores
- **Las tablas `event_confirmations`, `event_attendees`, `event_surveys` tienen RLS deny** para `anon` y `authenticated`. Solo service role (admin server-side).
- **Cross-check por teléfono/email normalizado** sin mostrar el valor al admin en logs
- **Audit log de quién importó qué batch** (`event_confirmations.import_batch_id` + `imports_log` table)
- **Borrado en cascada**: si el admin borra un evento, las confirmations/attendees/surveys se borran (cascade). Si borra un lead, se desvincula del evento pero NO borra los datos del evento (audit).

---

## 8. Decisiones pendientes (necesito que David me confirme)

Antes de la Fase 3 (implementación), necesito respuesta a:

| # | Pregunta | Default propuesto |
|---|----------|-------------------|
| D-1 | **¿Qué pasa con respuestas de encuesta SIN consentimiento?** | Se guardan en `event_survey_unmatched` (tabla auxiliar) para reportar al admin pero NO se promueven. |
| D-2 | **¿Asistió sin confirmar debe promoverse a lead?** | NO. Solo si respondió la encuesta con consentimiento. La asistencia sin encuesta queda como dato operativo (saber quién vino) sin trigger comercial. |
| D-3 | **¿Qué campos tiene la encuesta?** | Depende de Google Forms. Necesito ver el form para mapear las respuestas. Los campos mínimos que importan: `consent_to_contact` (sino/n), `commercial_interest` (texto libre o categoría), `email`, `phone`. |
| D-4 | **¿Quién es el "responsable de ventas" para leads de eventos?** | El admin actual logueado (no hay equipo de ventas formalmente aún, somos un solo admin). |
| D-5 | **¿Email de la confirmación es la misma entidad que email del lead?** | Sí, normalizado a lowercase. Si el Excel tiene "JUAN@GMAIL.COM" y la encuesta tiene "juan@gmail.com", matchean. |
| D-6 | **¿Se notifica al admin cuando entra una nueva encuesta con consentimiento?** | NO automáticamente (no hay SMTP). El admin lo ve cuando abre el panel. Si querés notificación, es Fase 4+ (email transaccional). |
| D-7 | **¿El Excel puede tener nombres de columnas en español o inglés?** | El importador necesita un "schema mapping" configurable (primera fila = headers). Si cambia el formato, se re-mapea sin tocar código. |
| D-8 | **¿Multi-evento (un mismo Excel para varios eventos)?** | NO en MVP. Un import = un evento. Si después el cliente quiere multi-evento en un solo Excel, es extensión. |

---

## 9. Roadmap a implementación (Fase 3)

1. **Schema** (1 migration nueva + typegen):
   - `2026062X000003_events_funnel.sql` con las 4 tablas + RLS
   - Regenerar `src/types/supabase.ts`
   - Crear `src/types/events.ts` con el modelo de dominio

2. **Importador seguro** (`src/lib/events/importer.ts`):
   - CLI: `node scripts/import-event.mjs --event <slug> --file <path>`
   - Lee de `QLICK_IMPORT_PATH` o `--file`
   - Normaliza phones (`+52...`)
   - Detecta duplicados
   - Rollback por `import_batch_id`
   - Reporte de cuántas filas importaron vs cuántas se saltaron por duplicado

3. **Server libs** (`src/lib/events/`):
   - `events-server.ts` — CRUD de eventos (admin)
   - `confirmations-server.ts` — listar/importar confirmaciones
   - `attendees-server.ts` — check-in manual + import
   - `surveys-server.ts` — import de surveys + matching a leads
   - `promotion.ts` — la lógica de "encuesta con consentimiento → lead"

4. **Admin panel** (`/admin/eventos`):
   - Lista de eventos
   - Detalle: confirmados, asistentes, encuestas, leads generados
   - Botón "Importar Excel" → wizard que pide ruta y mapea columnas
   - Acciones: check-in manual, ver respuestas de encuesta
   - Lead drawer: muestra de qué evento vino, respuestas de encuesta, botón WhatsApp

5. **WhatsApp manual** (`src/lib/crm/whatsapp-prepare.ts`):
   - Genera mensaje con template
   - Abre `wa.me` link
   - Audit log de cada mensaje enviado

6. **Tests**:
   - Fixture: `tests/fixtures/event-data-sintetico.json` (NO datos reales)
   - Test del importador con ese fixture
   - Test de la promoción encuesta → lead

---

## 10. Lo que NO está en este doc (fuera de scope por ahora)

- **WhatsApp Business API** — Fase 4+ (cuando el cliente decida migrar a un número dedicado)
- **Notificaciones automáticas** (email al admin cuando entra encuesta) — Fase 4+ (requiere SMTP)
- **Multi-evento en un Excel** — extensión futura
- **CRUD admin completo de eventos** desde el panel sin tocar SQL — Fase 5 (CRUD genérico)
- **Análisis de sentimiento de la encuesta** (NLP sobre respuestas libres) — fuera de scope
- **Pagos dentro del evento** (cobrar inscripción in-situ) — fuera de scope

---

## 11. Archivos que este doc referencia

- `docs/MASTERCLASS_FUNNEL_FOUNDATION.md` — el patrón que extendemos
- `docs/CRM_STRATEGY.md` — la estrategia general del CRM
- `docs/ROADMAP.md → Política de datos` — la regla inquebrantable
- `docs/ROADMAP.md → Visión estratégica` — el reencuadre del cliente
- `src/types/crm.ts` — los tipos de Lead, LeadStatus, LeadSource, etc.
- `src/lib/crm/` — el código actual del CRM (en demo mode, sin persistencia real)
