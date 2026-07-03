# Auditoría check-in + plan scanner staff — 2026-07-03

**Trigger:** David pidió diseñar la validación de entrada con QR y nos
fuimos una sesión antes a hacer "doble auditoría profunda" para entender
qué huecos hay antes de meter mano.

**Estado actual:**
- [x] P1 cerrado (3 fixes commit + push en `origin/main`)
- [ ] Commit B (scanner staff con link temporal firmado) — próximo, espera luz verde

---

## 1. Lo que ya está sólido (no se toca)

| Pieza | Ubicación |
|---|---|
| Token generation (24 bytes → 192 bits entropía, base64url) | `src/lib/qr/event-tokens.ts`, `src/lib/whatsapp/bot-engine.ts:476` |
| Idempotencia via UNIQUE `(event_id, attendee_phone_normalized)` | `supabase/migrations/20260701210000_event_qr_tokens_unique.sql` |
| Race recovery (SELECT antes de INSERT + 23505 catch) | `src/lib/whatsapp/bot-engine.ts:537-580` |
| Cleanup cron (tokens >30d sin usar, diario 3 AM UTC) | `src/lib/cron/cleanup-qr-tokens.ts` + `/api/cron/cleanup-qr-tokens` |
| Recordatorios cron (24h + 2h, idempotente) | `src/lib/cron/event-reminders.ts` + `/api/cron/event-reminders` |
| Email QR pass template (con fecha + hora) | `src/lib/email/templates/event-qr-pass.ts` |
| QR como URL pública (no data URL inline → Gmail/Outlook friendly) | `src/app/api/event-qr/[token]/route.ts` |
| Privacy del endpoint público (no devuelve phone/email) | `src/app/api/check-in/[token]/route.ts` (FIX 2026-07-03) |
| Vista del pase mobile-first con fecha+hora | `src/app/check-in/[token]/` (FIX 2026-07-03) |

---

## 2. P1 cerrado (3 fixes en esta sesión)

### Fix 1: Walk-in attendees se crean al vuelo

**Commit:** `09b3cac` — `fix(check-in): walk-in attendees se crean al vuelo`

**Problema:** El POST `/api/check-in/[token]` solo hacía UPDATE si
encontraba attendee previo por `(event_id, phone_normalized)`. Si NO
encontraba (caso walk-in: asistente que nunca confirmó pero llega con
su QR), `event_qr_tokens` quedaba con `checked_in_at` pero
`event_attendees` quedaba NULL. El funnel post-evento (encuesta,
promotion a lead) no podía encontrar al asistente.

**Solución:** Si el SELECT no devuelve attendees, INSERT al vuelo con
`source='check_in'` y `confirmation_id=null`. Si choca por
`UNIQUE(event_id, email)` (caso raro de mismo email con phone
distinto), ignorar el 23505 y seguir. El check-in en
`event_qr_tokens` ya quedó registrado, no se pierde.

**También:** se quitó el filtro `.is("checked_in_at", null)` del SELECT
porque si ya hubo check-in previo del mismo `(event_id, phone)`, ese
attendee ya está. Lo dejamos como está, no duplicamos.

---

### Fix 2: Email visibility (event_email_log + endpoint admin)

**Commit:** `33c3b72` — `feat(email): event_email_log + endpoint admin`

**Problema:** Los emails del bot (QR pass) y del cron (reminders) solo
se loggeaban en consola. Cuando fallaban en Brevo, el admin no tenía
forma de ver QUÉ falló. David testeó y reportó "no me llegó correo,
mismo caso por ahora".

**Solución:**

1. **Migration nueva `20260703015521_event_email_log`:**
   - Columnas: `email_type` (`qr_pass` | `reminder_24h` | `reminder_2h`),
     `event_id`, `event_qr_token_id`, `recipient`, `attendee_name`,
     `subject`, `ok`, `error`, `provider_message_id`, `sent_at`
   - Índice parcial `(event_id, ok, sent_at) WHERE ok=false` para
     queries rápidas de fallos
   - RLS default-deny (solo service role)
   - **Limitación conocida:** `ok=TRUE` solo significa que Brevo aceptó
     el send, NO garantiza entrega al inbox. Para delivered/bounce/spam
     hay que integrar webhooks Brevo (mejora futura, no P1)

2. **Helper `logEventEmail()`** (`src/lib/email/log.ts`):
   - Best-effort — si falla el INSERT, loggea warning y sigue
   - Server-only (service role required)

3. **Call sites actualizados:**
   - `event-qr-pass.ts` y `event-reminder.ts` aceptan `extra: { eventId, eventQrTokenId }`
   - `bot-engine.ts` (2 sites) y `event-reminders.ts` (cron) pasan los extras

4. **Endpoint admin nuevo:** `GET /api/admin/emails/recent`
   - Query params: `eventId?`, `sinceDays?` (1-90, default 7),
     `failedOnly?` (default false), `limit?` (1-200, default 50)
   - Protegido por middleware `/api/admin/*` + `requireAdmin()`
   - Devuelve `entries[]` + `total` + `failed` + filtros aplicados

**Limitación:** `event_qr_token_id` queda NULL en los logs de QR pass
porque `generateQrToken()` no devuelve el `id` (PK) del row, solo el
string del token. Lo dejamos así — agregar otro SELECT solo para ese
log es scope creep. El `event_id` ya alcanza para filtrar.

**No se tocó:**
- Human-handoff y promotion emails siguen solo en consola (raros, no
  necesitan dashboard)
- Brevo webhooks (delivered, bounce, spam) — sería el siguiente nivel
  de observabilidad pero requiere config en Brevo + endpoint público.
  **Documentado como mejora futura** (sección 4.3)

---

### Fix 3: Audit attribution tipado (preparado para scanner)

**Commit:** `3252e40` — `refactor(check-in): tipar CheckInActor`

**Problema:** El endpoint público usaba strings hardcodeados (`"self"` /
`"self@qlick.checkin"`) para `checked_in_by` y `actor_email` del audit
log. Cuando se implemente el scanner del staff, ese endpoint tendrá que
pasar un actor real (email del operador), no `"self"`.

**Solución:**
- Type `CheckInActor { kind: 'self' | 'staff' | 'system', email, displayName? }`
- Type `CheckInActorKind` enum
- Constante `PUBLIC_ACTOR` con `kind: 'self'` (autorización via token,
  no hay usuario detrás)
- 4 lugares donde estaba hardcodeado ahora usan `PUBLIC_ACTOR`
- Audit metadata agrega `actorKind` para distinguir `self` vs `staff`

**Lo que NO se hace (scope):**
- Crear endpoint staff-side con actor dinámico (eso es Commit B)
- Mover `CheckInActor` a `lib/check-in/actor.ts` (no vale la pena hasta
  que haya 2+ call sites)

---

## 3. P2 — Nice-to-haves documentados (no hacer ahora)

### 3.1 Rate limiting en `/api/check-in/[token]`

El endpoint es público y acepta GET N veces. 192 bits de entropía en el
token hacen el ataque impráctico, pero defense in depth pediría rate
limit per IP (10/min). **No hacer hasta que alguien abuse.**

### 3.2 Validación de token en `/api/event-qr/[token].png`

El endpoint devuelve un QR de CUALQUIER string de 16+ chars. Aunque
sea un token inválido, genera un QR que apunta a `/check-in/[token-inválido]`
que mostrará 404. Solo desperdicia recursos, no es bug.

**Si se quiere:** validar contra DB primero (1 SELECT extra por QR pedido).
**Costo:** una query por cada view del QR (bot WhatsApp, email, dashboard).
Probablemente vale la pena dejarlo como está — los QRs se cachean en
browser/email client.

### 3.3 `formatTime` con timezone distinta a `formatDate`

`CheckInClient.tsx` usa `formatTime(iso)` con
`timeZone: 'America/Mexico_City'` y `formatDate(iso)` con
`timeZone: 'UTC'`. Diferencia intencional: formatDate prioriza hydration
safety (UTC estable); formatTime prioriza "lo que el admin configuró"
(hora local CDMX).

**Edge case conocido:** eventos a las 23:00+ CDMX muestran fecha UTC del
día siguiente (raro, aceptable). **Si se quiere:** cambiar `formatDate`
global a `America/Mexico_City` también. Affects 38 lugares. **Scope creep.**

### 3.4 Transaccionalidad del POST `/api/check-in/[token]`

3 writes separados (`event_qr_tokens`, `event_attendees`, `leads`) sin
transacción. Si el segundo falla, el primero queda. En la práctica es
tolerable (todos son UPDATEs idempotentes y la fuente de verdad es
`event_qr_tokens`), pero es frágil.

**Si se quiere:** usar RPC de Postgres para atomicidad, o un queue con
retry. **No urgente.**

### 3.5 `appBaseUrl` y `event-tokens` pueden divergir

`event-tokens.ts:96` fallback a `https://qlick.mx`, pero `appBaseUrl()`
también puede ser `https://qlick.mx` o `https://qlick.digital` según
env var. Si cambia `NEXT_PUBLIC_APP_URL` después de generados los
tokens, los QRs viejos apuntan a un dominio y los nuevos a otro.

**Si se quiere:** bloquear el dominio en la DB al generar el token.
**Edge case poco probable** (no hemos cambiado el dominio en meses).

---

## 4. Commit B — Scanner del staff (plan detallado)

### 4.1 Decisiones de diseño (David aprobó 2026-07-03)

**Auth: Link temporal firmado, no login admin.**
> "yo genero y cualquier persona puede usarlo por N tiempo, porque el
> staff puede ser una persona de una institución, a veces la persona
> en las conferencias va solo, a veces no"

Razones:
- El staff no necesita credenciales (puede ser alguien externo de la
  institución que cede el espacio)
- David (admin) genera el link, lo manda por WhatsApp/SMS/email al staff
- El staff abre el link en su celular y escanea — sin tipear passwords
- El link expira (N horas configurables) y es de un solo evento

**Scope del scanner: Atado al evento, no universal.**
- Staff abre `/admin/eventos/[id]/staff/scan` (ruta nueva)
- Solo escanea QRs de ESE evento
- Si escanea un QR de otro evento (por error), ve error claro "Este QR
  no pertenece a este evento"

**Stack del QR decoder: html5-qrcode.**
- Zero-config: maneja camera stream + decoding
- UI incluida (no hay que armar CSS)
- Fallback a upload de imagen si la cámara no anda
- ~30KB minificado, MIT license
- Alternativas evaluadas: jsQR (más liviano pero sin UI), ZXing-js
  (más robusto pero ~200KB)

### 4.2 Schema

**Tabla nueva `event_staff_links`:**

```sql
create table public.event_staff_links (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  token           text not null unique,  -- crypto random URL-safe 32 chars
  -- VENTANA DE VALIDEZ (no quemamos N horas; dejamos que el admin elija):
  valid_from      timestamptz not null default now(),
  valid_until     timestamptz not null,  -- ej: starts_at + 4h
  -- METADATA:
  created_by      text not null,  -- email del admin que lo generó
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,  -- última vez que se abrió el scanner
  use_count       integer not null default 0,  -- cuántos check-ins se hicieron
  -- REVOCACIÓN (por si se filtra el link):
  revoked_at      timestamptz,
  revoked_by      text,
  revoke_reason   text
);

create index event_staff_links_token_idx on public.event_staff_links (token);
create index event_staff_links_event_idx on public.event_staff_links (event_id);
alter table public.event_staff_links enable row level security;
-- Default-deny. Staff scanner accede via endpoint server-side (service role).
```

**Endpoint público:** `GET /api/staff/scan/[token]`
- Lee `event_staff_links` por token
- Valida `valid_from <= now < valid_until` y `revoked_at IS NULL`
- Si pasa, redirige a `/admin/eventos/[event_id]/staff/scan?token=...`
- Si falla: 404 (token inválido) o 410 (expirado/revocado)

**Endpoint server-side (admin):**
- `POST /api/admin/events/[id]/staff-links` — crear link (action o endpoint)
- `GET /api/admin/events/[id]/staff-links` — listar links activos + revocados
- `POST /api/admin/events/[id]/staff-links/[linkId]/revoke` — revocar

**Endpoint scanner (interno, llamado por la UI del staff):**
- `POST /api/staff/check-in` — recibe `{ token, qr_token }` y registra check-in
  - Auth: validar `token` contra `event_staff_links` (igual que el GET)
  - Check-in: misma lógica que `POST /api/check-in/[token]`
    PERO con `actor = { kind: 'staff', email: staff_email, displayName: ... }`
  - **El staff_email puede ser opcional** (no hay login). El displayName
    puede ser un input que el staff tipea al abrir el scanner por primera
    vez (cached en localStorage). O simplemente registrar `staff@event`
    como email genérico + dejar `actor.displayName = "Staff externo"`.

### 4.3 UI del scanner

**Ruta:** `/admin/eventos/[id]/staff/scan` (página pública pero con
link firmado — no requiere login del staff)

**Layout:**
1. Header: nombre del evento + countdown "Válido por X horas Y min"
2. Camera view (html5-qrcode): ocupa la mitad superior
3. Fallback: input para tipear el token manualmente (por si la cámara
   no anda o el QR está dañado)
4. Lista de check-ins recientes (últimos 5): nombre + hora — feedback
   visual de que el sistema está funcionando
5. Stats rápidas: X checkeados / Y confirmados / Z% show-up

**Flujo del staff:**
1. Abre el link en su celular
2. Ve "Soy staff de [Evento]" — opcionalmente tipea su nombre
3. Apunta la cámara al QR del asistente
4. El sistema:
   - Decodifica el QR → extrae el token del URL
   - Valida que sea del evento correcto (path check)
   - POST `/api/staff/check-in` → registra
   - Muestra feedback: ✅ "Juan Pérez — check-in OK" o ❌ "Token inválido"
5. Listo para el siguiente

### 4.4 Estimación de scope

| Pieza | LOC estimado | Tiempo |
|---|---|---|
| Migration `event_staff_links` | ~30 | 30 min |
| Server actions: crear/listar/revocar links | ~150 | 1.5h |
| UI admin para generar/revocar links | ~200 | 2h |
| Endpoint público `/api/staff/scan/[token]` (redirect) | ~50 | 30 min |
| Página scanner (`/admin/eventos/[id]/staff/scan`) | ~400 | 4h |
| Endpoint `/api/staff/check-in` | ~100 | 1h |
| Integrar `CheckInActor { kind: 'staff' }` | ~50 | 30 min |
| Tests (unit + smoke E2E) | ~200 | 2h |
| **TOTAL** | **~1180 LOC** | **~12h trabajo** |

### 4.5 Decisiones pendientes (preguntar a David antes de empezar)

1. **Default de `valid_until`:**
   - Opción A: `event.starts_at + 4h` (cubre el evento + 1h de margen)
   - Opción B: `event.ends_at + 2h` (más conservador)
   - Opción C: Configurable por el admin al crear el link
   - **Recomendación:** C. Default A, pero editable.

2. **`staff_email` y `displayName`:**
   - Opción A: Input al abrir el scanner por primera vez, cacheado en
     localStorage del dispositivo
   - Opción B: Genérico `staff@event` + displayName "Staff externo"
   - **Recomendación:** A. Da mejor audit trail.

3. **Múltiples scanners simultáneos:**
   - Si David genera 2 links para el mismo evento (staff A y staff B),
   - ¿se pueden usar al mismo tiempo? **Sí**, no hay razón para no.
   - El `use_count` de cada link se incrementa independientemente.

4. **Rate limiting del scanner:**
   - 1 check-in cada 2 segundos por link (anti-spam)?
   - **Recomendación:** No. Si el staff quiere checkear 50 personas
     en 5 minutos, no hay razón para frenarlo. Si alguien tiene el
     link y abusa, lo revocamos.

### 4.6 Mejoras futuras (después de Commit B)

- Brevo webhooks (delivered, bounce, spam) para `event_email_log`
- Notificación al admin cuando un staff abre el scanner por primera
  vez (auditoría de quién estuvo en puerta)
- QR scan desde pantalla (no solo cámara trasera) — html5-qrcode ya lo
  soporta, solo hay que cambiar el `cameraFacing` constraint
- Modo "offline" del scanner (cache local + sync cuando vuelve online)

---

## 5. Resumen ejecutivo

- **Hoy:** el flujo de check-in funciona end-to-end excepto el paso
  final: el staff no tiene UI para escanear QRs. Tiene que tipear el
  nombre en un input de búsqueda (manual).
- **Cerrado en esta sesión:** walk-in attendees, email visibility,
  audit attribution tipado.
- **Documentado:** 5 nice-to-haves (P2) sin urgencia.
- **Próximo paso (Commit B):** scanner del staff con link temporal
  firmado, html5-qrcode, scope atado al evento. ~12h de trabajo, ~1180 LOC.