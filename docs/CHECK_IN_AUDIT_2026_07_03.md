# Auditoría check-in + plan scanner staff — 2026-07-03

**Trigger:** David pidió diseñar la validación de entrada con QR y nos
fuimos una sesión antes a hacer "doble auditoría profunda" para entender
qué huecos hay antes de meter mano.

**Estado actual:**
- [x] P1 cerrado (3 fixes commit + push en `origin/main`)
- [x] Commit B (scanner staff con link temporal firmado) — IMPLEMENTADO y pusheado
- [ ] Pendiente: David testea en Vercel con un evento real

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

### 4.2 Schema (✅ implementado en `038f1c5`)

**Tabla nueva `event_staff_links`:**

```sql
create table public.event_staff_links (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  token           text not null unique,  -- crypto random URL-safe 32 chars
  -- Ventana de validez (configurable por el admin).
  valid_from      timestamptz not null default now(),
  valid_until     timestamptz not null,
  -- Metadata.
  created_by      text not null,
  created_at      timestamptz not null default now(),
  label           text,
  -- Métrica operacional.
  last_used_at    timestamptz,
  use_count       integer not null default 0,
  -- Revocación.
  revoked_at      timestamptz,
  revoked_by      text,
  revoke_reason   text,
  constraint event_staff_links_valid_range check (valid_until > valid_from)
);
```

Migración aplicada: `20260703020832_event_staff_links.sql`.

**Endpoints públicos (sin auth, autorización via token):**
- ✅ `GET /api/staff/scan/[token]` — valida el link, redirige 302 a la
  página del scanner, o 404/410 con HTML explicando el motivo.
- ✅ `POST /api/staff/check-in` — recibe `{ token, qr_token, staff_email?,
  staff_displayName? }`, valida staff link + qr_token, validación
  cross-event (409 si el QR es de OTRO evento), registra check-in con
  actor = staff, walk-in attendees, lead promotion, audit log completo,
  bump `use_count` + `last_used_at`.

**Server actions admin (con auth):**
- ✅ `createStaffLinkAction` (audit log + revalidatePath)
- ✅ `listStaffLinksAction` (con URLs pre-calculadas)
- ✅ `revokeStaffLinkAction` (idempotente + audit log)

### 4.3 UI del scanner (✅ implementado en `038f1c5`)

**Ruta:** `/admin/eventos/[id]/staff/scan?token=...`

**Layout:**
1. ✅ Header "Scanner de staff"
2. ✅ Identidad opcional del operador (email + displayName, cacheada en
   localStorage con clave `qlick.staff.identity`).
3. ✅ Botón "Iniciar cámara" + camera view (html5-qrcode, facingMode
   environment, fps 10).
4. ✅ Fallback: input manual de token (cuando la cámara no anda).
5. ✅ Feedback inmediato: ✓ nombre / ✗ motivo.
6. ✅ Lista de últimos 5 check-ins (cache cliente).

**UI admin (`StaffLinksPanel` dentro del CheckInTab):**
1. ✅ Form crear (label opcional + validUntil editable con datetime-local).
2. ✅ Lista de links activos con countdown "Vence en Xh Ym" (useEffect
   tick cada 60s).
3. ✅ Botón "Copiar URL" con fallback Safari iOS (`window.prompt`).
4. ✅ Botón "Revocar" con razón opcional.
5. ✅ Links revocados en sección collapsed.

**Flujo del staff (test manual pendiente):**
1. David genera el link en el admin → copia URL.
2. Se la manda al staff por WhatsApp/SMS/email.
3. Staff abre el link → valida → ve la página del scanner.
4. Tipea su nombre (opcional) → guarda en localStorage.
5. Inicia cámara → apunta al QR.
6. Sistema valida + registra + muestra feedback.
7. Listo para el siguiente.

### 4.4 Estimación de scope (✅ implementado)

| Pieza | LOC estimado | LOC real | Tiempo |
|---|---|---|---|
| Migration `event_staff_links` | ~30 | ~85 | 30 min |
| Lib helpers (`links.ts` + `qr-token.ts`) | ~80 | ~310 | 1h |
| Server actions (`_staff-link-actions.ts` + helpers) | ~150 | ~165 | 1h |
| UI admin (`StaffLinksPanel.tsx`) | ~200 | ~280 | 1.5h |
| Endpoint público `/api/staff/scan/[token]` (redirect) | ~50 | ~110 | 30 min |
| Endpoint `/api/staff/check-in` | ~100 | ~285 | 2h |
| Página scanner (`/admin/eventos/[id]/staff/scan`) | ~400 | ~485 | 3h |
| Tests | ~200 | ~225 | 1h |
| **TOTAL** | **~1180 LOC** | **~1945 LOC** | **~10.5h trabajo** |

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

- **Implementado y pusheado:** scanner del staff con link temporal
  firmado (Commit B). David puede testearlo en Vercel con un evento real.
- **Pendiente de test E2E:** el flujo end-to-end (David genera link →
  manda a staff → staff escanea QR → attendee aparece como `checked_in`
  en el admin). Los unit tests están; falta el smoke test en Vercel.
- **No urgente (P2 documentado):** 5 nice-to-haves sin urgencia.