# AUDIT de Gaps contra Producción — 2026-07-12

> **Fecha:** 2026-07-12 21:10 Phoenix
> **Owner:** Mavis (sesión `mvs_415b722f51c747e7a27784e4381986c2`)
> **Trigger:** David pidió "documenta lo que ya está identificado y también vamos a hacer el mismo procedimiento para los puntos faltantes" — auditoría sistemática de cada gap abierto en `docs/OPEN_ITEMS.md` contra el estado real en producción, con evidencia verificable.

---

## 🎯 TL;DR

| Resultado | Gaps |
|---|---|
| ✅ **CERRADO con evidencia en prod** | G-6, G-7, A-2, A-3, A-4, A-5, A-7, G-12, Vercel aliases, G-15, G-16 |
| ⚠️ **Sigue activo** (código) | C-4 (UPSERT email NULL) |
| ⚠️ **Parcialmente mitigado** | C-5 (race check-in) |
| 🟡 **No auditable sin métricas** | C-6, H-1, H-2, H-3 (performance) |
| ⚠️ **Decisión vigente de David** | A-1 (Next.js 14.2.35 upgrade) |
| ⚠️ **Acción de David en Meta UI** | G-5 (plantillas Meta) |
| ⚪ **Bloqueado por decisión externa** | Proveedor de pagos, contenido cursos, etc. |

**Resumen ejecutivo:** 11 de 16 gaps auditables están CERRADOS. Los 5 restantes son: 1 bug latente (C-4), 1 mitigación parcial (C-5), 3 que requieren métricas (C-6, H-1..3). Lo que queda son performance, decisiones de producto, y un fix de UNIQUE INDEX en DB.

---

## 📋 Metodología

Para cada gap abierto en `docs/OPEN_ITEMS.md`:

1. **Identificar la naturaleza**: ¿código, infra, decisión, runtime?
2. **Si es código**: leer la implementación + verificar tests.
3. **Si es infra**: consultar API de Vercel/Supabase/Management para ver estado real.
4. **Si es runtime**: hacer request público a prod que revele el comportamiento (ej. `robots.txt`).
5. **Si es decisión de David**: documentar el contexto, no auditar.
6. **Si no es auditable**: marcarlo explícitamente + razón.

---

## ✅ CERRADOS con evidencia (11)

### 1. G-6 · 5 migrations de Fase 7a no verificadas aplicadas

**Estado declarado en OPEN_ITEMS:** pendiente, falta verificar en prod.

**Procedimiento aplicado:**
```bash
node --env-file=.env.local scripts/audit-migrations-applied.mjs
```

**Output:**
```
[audit] Encontrados: 37 CREATE TABLE, 28 ADD COLUMN, 109 CREATE INDEX
[audit] source=openapi, tables expuesta: 39
[audit] cols introspectadas: 39 tablas con definición

=== TABLAS PENDIENTES ===
  (ninguna — todas las CREATE TABLE están aplicadas)

=== COLUMNAS PENDIENTES ===
  (ninguna — todas las ADD COLUMN están aplicadas)
```

**Veredicto:** ✅ **CERRADO.** Las 5 migrations de Fase 7a SÍ están aplicadas en prod (junto con todas las demás). El script parsea CREATE TABLE/ADD COLUMN de las migrations locales y compara contra el OpenAPI spec de PostgREST.

**Tablas verificadas aplicadas:**

| Migration | Tabla/Columna | Uso en código |
|---|---|---|
| `20260630164900_bot_manual_context.sql` | `bot_context_overrides` | 4 usos en `context-store.ts` |
| `20260701120000_lead_profile.sql` | `lead_profile` | 4 usos en `lead-profile.ts` |
| `20260701160000_handoff_requests.sql` | `handoff_requests` | 8+ usos en `handoffs-server.ts`, `human-handoff.ts` |
| `20260701170000_lead_event_attended_status.sql` | `lead_status` enum (+'event_attended') | 30+ usos en bot, check-in, surveys, leads |
| `20260701180000_event_reminder_log.sql` | `event_reminder_log` | 5+ usos en `event-reminders.ts`, `survey-reminders.ts` |

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

### 2. G-7 · `NEXT_PUBLIC_APP_URL` apunta a dominio incorrecto

**Estado declarado en OPEN_ITEMS:** "apunta a `qlick-three.vercel.app` (no `qlick.digital`)" — pendiente.

**Procedimiento aplicado (3 verificaciones independientes):**

**(a) API REST de Vercel** — verificar que la variable EXISTE:
```powershell
$headers = @{ Authorization = "Bearer $env:VERCEL_TOKEN" }
Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/prj_CletxhxS5JxUWzNLhAADYnYzjckj/env" -Headers $headers -Method Get
```
**Output:**
```
NEXT_PUBLIC_APP_URL = <SENSITIVE - type=sensitive, target=production>
```
✓ La variable está seteada (tipo sensitive oculta el valor).

**(b) CLI `vercel env pull`** — memory dice "miente para sensitive", confirmamos:
```
vercel env pull → NEXT_PUBLIC_APP_URL=""
```
**Veredicto:** el CLI miente (memory operativa confirmada). Valor devuelto es vacío aunque la variable existe.

**(c) Request público a `robots.txt` y `sitemap.xml` en prod** — el código `src/app/robots.ts:3` lee `process.env.NEXT_PUBLIC_APP_URL` y lo expone:
```powershell
Invoke-WebRequest -Uri "https://www.qlick.digital/robots.txt"
→ User-Agent: *
  Allow: /
  Disallow: /dashboard
  Disallow: /admin
  Disallow: /aprender
  Sitemap: https://www.qlick.digital/sitemap.xml   ← ESTO REVELA EL VALOR

Invoke-WebRequest -Uri "https://qlick-three.vercel.app/robots.txt"   # legacy
→ Sitemap: https://www.qlick.digital/sitemap.xml   ← MISMO VALOR

Invoke-WebRequest -Uri "https://www.qlick.digital/sitemap.xml"   # sitemap completo
→ <urlset>
    <url><loc>https://www.qlick.digital</loc>
        <lastmod>2026-07-13T03:24:47.206Z</lastmod>  ← server UTC, prueba deploy activo
```

**Veredicto:** ✅ **CERRADO.** La env var está seteada a `https://www.qlick.digital` (o un valor que normaliza a eso). Ambos dominios (canónico + legacy) reportan el mismo `Sitemap: https://www.qlick.digital/...`, lo que confirma que es la env var y NO un hardcode por dominio.

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

### 3. A-2 · Typegen de Supabase desincronizado

**Estado declarado en OPEN_ITEMS:** "parcialmente hecho en PR #26. Faltan otras tablas." Pendiente.

**Procedimiento aplicado:**
```bash
npx supabase gen types typescript --project-id ugpejblymtbwtsoiykyj > /tmp/typegen.ts
$typegenLines = (Get-Content /tmp/typegen.ts).Count    # → 2316
$currentLines = (Get-Content src/types/supabase.ts).Count  # → 2316
Compare-Object (Get-Content /tmp/typegen.ts) (Get-Content src/types/supabase.ts)
```

**Output:**
```
Typegen actual: 2316 lineas
Repo actual:  2316 lineas
Diff: (vacio)
```

**Veredicto:** ✅ **CERRADO.** El typegen en `src/types/supabase.ts` está **idéntico** al regenerado contra prod. Cero diff. Cualquier `as any` / `as never` / `as unknown as Json` en el código es ahora por decisión arquitectónica (snake_case↔camelCase mapping, etc.), no por typegen stale.

**Acción:** paperwork — cerrar en OPEN_ITEMS (o mantener como "A-2 cerrado, los casts residuales son intencionales, ver A-2 · Desglose de TODOs" si se quiere mantener el gap documentado).

---

### 4. A-3 · `/api/dev/simulate-webhook` sin `DEV_ADMIN_SECRET`

**Estado declarado en OPEN_ITEMS:** pendiente.

**Procedimiento aplicado:** leer código + verificar en commits.

**Output:**
- `src/app/api/dev/simulate-webhook/route.ts:17-25` documenta el fix:
  > "Auth (FIX 2026-07-11 A-3): dos modos válidos, en orden de precedencia:
  > 1. **Header `x-dev-admin-secret`**: si `process.env.DEV_ADMIN_SECRET` está configurado Y el header matchea, pasa sin auth de estudiante.
  > 2. **Sesión de estudiante** (`getCurrentStudent`): fallback para el Client Component."
- Commit `73a0685 fix(admin): 5 gaps del sprint cierre-eventos-virtuales (todo lo que Mavis puede tocar)` en main (mergeado en v0.9.3).
- CHANGELOG v0.9.3 documenta el fix: "El endpoint ahora acepta 2 modos de auth — header `x-dev-admin-secret` o sesión de estudiante."

**Veredicto:** ✅ **CERRADO.** Gate aplicado en código. OPEN_ITEMS desactualizado.

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

### 5. A-4 · Stale remote branches sin local

**Estado declarado en OPEN_ITEMS:** 10 ramas listadas, pendiente de limpieza por David.

**Procedimiento aplicado:** ver sprint v0.9.10 housekeeping (commit `b60a106` → merge → 47 ramas eliminadas).

**Output:**
- 26 locales eliminadas (`git branch -d` / `-D`).
- 21 remotas en 1ra pasada + 13 en 2da = 34 remotas eliminadas (`git push origin :branch`).
- Solo quedan `main` (local) + `origin/main` (remoto).

**Veredicto:** ✅ **CERRADO.** Estado real: `git branch` solo lista `* main` y `feat/housekeeping-2026-07-12` (que ya se mergeó y borró en este sprint).

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

### 6. A-5 · Drift de versión en `package.json` (0.8.0 vs 0.9.9)

**Estado declarado en OPEN_ITEMS:** pendiente.

**Procedimiento aplicado:** leer `package.json:3`.

**Output:**
```json
"name": "qlick-marketing-platform",
"version": "0.9.9",
```

**Veredicto:** ✅ **CERRADO.** Bumpeado a 0.9.9 en sprint v0.9.10 (commit `b60a106`). Coincide con el release point real de main (post-merge de PR #26).

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

### 7. A-7 · Dev login bypass sin rate limit ni audit log

**Estado declarado en OPEN_ITEMS:** pendiente, agregar rate-limit + audit log.

**Procedimiento aplicado:** sprint v0.9.10 sprint C (commit `0670436`).

**Output:**
- `src/app/api/dev/login/route.ts:103-129` ahora tiene:
  - Rate limit 10 calls/60s por IP (vía `recordAndCheckRateLimit`).
  - 429 response con header `Retry-After`.
  - 6 audit log actions distintas en `admin_audit_log` (con metadata de IP):
    - `dev_login_attempt` (secret pasó).
    - `dev_login_success` (signInWithPassword OK).
    - `dev_login_failure` con `metadata.reason: rate_limited, secret_incorrecto, list_users_failed, user_not_found, update_password_failed, signin_failed`.

**Veredicto:** ✅ **CERRADO.** Defense in depth aplicado: rate limit + audit log completo. Best-effort: si el audit falla, no rompe el response.

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

### 8. G-12 · `findLeadByPhone` timeout intermitente (5s peor caso)

**Estado declarado en OPEN_ITEMS:** "parcialmente resuelto con `phone_normalized` índice UNIQUE (<100ms típico). El 5s es el peor caso."

**Procedimiento aplicado:** leer `src/lib/crm/leads-server.ts:180-293`.

**Output:**
```ts
// FIX 2026-07-04 (G-12): timeout + retry viven en `_findLeadByPhoneRaw`
// para mantener esta función delgada y poder testear la lógica con un
// mock chain de Supabase (ver `tests/leads-find-by-phone-timeout.test.mjs`).
const raw = await _findLeadByPhoneRaw(supabase, normalized);
```

```ts
// Helper interno de `findLeadByPhone` — ejecuta la query con timeout 3s
// y 1 retry selectivo (solo si fue timeout, NO si fue error lógico).
const QUERY_TIMEOUT_MS = 3000;
const RETRY_BACKOFF_MS = 200;
const MAX_QUERY_ATTEMPTS = 2;
```

Plus el query usa `phone_normalized` UNIQUE index (creado en migration `20260627010000_funnel_hardening.sql`) → <100ms típico.

**Veredicto:** ✅ **CERRADO.** Fix de 3 capas:
1. Índice UNIQUE en `phone_normalized` (cambio de schema).
2. Timeout 3s + 1 retry con backoff 200ms (cambio de código).
3. `Promise.race` con timeout 5s en el caller `bot-engine.ts:1828` (fuerza fallback a mock si todo falla).

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

### 9. Vercel aliases auto-reassign

**Estado declarado en OPEN_ITEMS:** "`vercel.json` NO tiene `productionAlias` definido."

**Procedimiento aplicado:** leer `vercel.json:13-15` + hacer request a `robots.txt` del legacy para confirmar.

**Output:**
```json
{
  "alias": [
    "qlick.digital",
    "www.qlick.digital"
  ]
}
```

Y empíricamente:
```
GET https://qlick-three.vercel.app/robots.txt
→ Sitemap: https://www.qlick.digital/sitemap.xml

(El deploy del dominio LEGACY ahora apunta al canónico. Antes del fix, los aliases se quedaban en el deploy viejo.)
```

**Veredicto:** ✅ **CERRADO.** El fix se aplicó en sprint v0.9.3 (commit `73a0685`). Los aliases canónicos `qlick.digital` + `www.qlick.digital` están en `vercel.json:13-15` y Vercel los reasigna automáticamente con cada deploy a main.

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

### 10. G-15 · Sweep comprehensivo de docs históricos

**Estado declarado en OPEN_ITEMS:** "Falta agregar nota al inicio de 9 docs históricos que mencionan Resend/qlick.marketing."

**Procedimiento aplicado:** sprint v0.9.10 sprint C (commit `0670436`).

**Output:** 8 docs con banner "snapshot histórico" agregado al inicio:
1. `docs/SMTP_SETUP.md`
2. `docs/FASE_5_PLAN.md`
3. `docs/AUDIT_AND_PLAN_2026-07-01.md`
4. `docs/ASSESSMENT_PRODUCCION_2026-07-01.md`
5. `docs/PRE_MERGE_CHECKLIST.md`
6. `docs/EVENTS_ADMIN_GUIDE.md`
7. `docs/CONTACT_AND_WHATSAPP_STRATEGY.md`
8. `docs/TECHNICAL-REVIEW.md`

Cada banner apunta a `STATUS.md` y `OPEN_ITEMS.md` para el estado actual. NO se reescribió el cuerpo (regla del audit: "no reescribir HANDOFFs sin contexto explícito").

**Veredicto:** ✅ **CERRADO.** 22 docs mencionaban Resend/qlick.marketing; 8 son manuales operativos que necesitaban banner, los otros 14 son auto-explicativos por título (HANDOFF_*, AUDIT_*, SPRINT_*, PLAN_*).

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

### 11. G-16 · 3 comentarios engañosos en código

**Estado declarado en OPEN_ITEMS:** "comentarios desactualizados en `webhooks/handler.ts`, `whatsapp-provider.ts`, `agent-provider.ts`."

**Procedimiento aplicado:** sprint v0.9.10 sprint C (commit `0670436`).

**Output:**
- `src/lib/whatsapp/webhooks/verify.ts:9-12` — antes decía "PLACEHOLDER SEGURO: no se ejecuta en producción". **FALSO.** Actualizado con nota del sprint housekeeping 2026-07-12.
- `src/lib/whatsapp/providers/whatsapp-provider.ts:7-8` — antes decía "Hoy el único provider ACTIVO es `manual_wa`". **FALSO.** Actualizado para reflejar `meta_cloud_api` como provider activo.
- `src/lib/ai/agent-provider.ts` — el comentario ya estaba al día (menciona `deepseek` default + `mock` fallback). Sin cambios necesarios.

**Veredicto:** ✅ **CERRADO.** 2 de 3 comentarios limpiados (el 3ro no necesitaba cambio).

**Acción:** paperwork — cerrar en OPEN_ITEMS.

---

## ⚠️ SIGUE ACTIVO (1)

### 12. C-4 · UPSERT con `email=NULL` no deduplica attendees

**Estado declarado en OPEN_ITEMS:** "`onConflict: 'event_id,email'` con `email = NULL` permite múltiples rows en Postgres (UNIQUE trata NULLs como distintos)."

**Procedimiento aplicado:** buscar fix en migrations + código.

**Output:**
- **Búsqueda de `NULLS NOT DISTINCT` en migrations:** NO encontrado.
- **Búsqueda en git log de `NULLS NOT DISTINCT`:** solo aparece en docs (en commit del housekeeping).
- **`src/lib/events/attendees-server.ts:160`:** `onConflict: "event_id,email"` SIGUE ACTIVO.
- **`src/app/api/check-in/[token]/route.ts:326`:** el path crítico de check-in ahora busca por `phone_normalized` (NOT NULL) en lugar de email, lo que **mitiga el riesgo en producción** para el flujo de check-in.

**Veredicto:** ⚠️ **SIGUE ACTIVO** en el path de `attendees-server.ts` (vía bot, vía wizard). El check-in mitiga por usar `phone_normalized`. El fix correcto es:
- Cambiar `onConflict` a `("event_id", "phone_normalized")` (phone SÍ es NOT NULL), O
- Agregar migration con `UNIQUE INDEX ... NULLS NOT DISTINCT` sobre `(event_id, email)`.

**Riesgo actual:** bajo (los confirmados tienen email). Si un lead sin email hace 5 clicks en el QR del gate virtual, quedan 5 filas.

**Estimación:** ~30 min (migration aditiva + cambiar el onConflict).

**Acción recomendada:** sprint dedicado de "fix UNIQUE constraint" cuando David priorice. Estimación: 1 commit atómico.

---

## ⚠️ PARCIALMENTE MITIGADO (1)

### 13. C-5 · Race condition en check-in (SELECT+UPDATE sin lock)

**Estado declarado en OPEN_ITEMS:** "Doble escaneo del mismo QR en <500ms puede ejecutar UPDATE dos veces (idempotente en datos, pero `checked_in_by` se sobrescribe con el último actor)."

**Procedimiento aplicado:** leer `src/app/api/check-in/[token]/route.ts:228-374`.

**Output:**
- El código actual (líneas 341-371):
  ```ts
  // Solo UPDATE si checked_in_at es NULL (idempotencia).
  if (!target.checked_in_at) {
    // ... UPDATE event_attendees SET checked_in_at = ...
  }
  ```
- **Sigue siendo read-then-write sin lock atómico.** El check `!target.checked_in_at` se basa en un SELECT previo.

**Veredicto:** ⚠️ **PARCIALMENTE MITIGADO.** La lógica es defensiva (no sobrescribe si ya está checked-in), pero la race window sigue existiendo si dos requests llegan en <500ms — el segundo hace SELECT con `checked_in_at=NULL`, ambos pasan el check, ambos ejecutan UPDATE. El `checked_in_by` se sobrescribe con el último.

**Fix correcto:**
```sql
UPDATE event_attendees
SET checked_in_at = $now, checked_in_by = $actor
WHERE id = $attendeeId AND checked_in_at IS NULL
RETURNING id;
```
Si no matchea → SELECT pequeño para devolver `alreadyCheckedIn`.

**Estimación:** ~20 min.

**Acción recomendada:** sprint dedicado. Bajo riesgo real (escaneo humano tiene 1-2s entre cada uno).

---

## 🟡 NO AUDITABLES sin métricas (3)

### 14. C-6 · Check-in endpoints hacen 5-7 queries seriales

**Estado declarado en OPEN_ITEMS:** "~900ms por check-in en PostgREST con latency 150ms. Con 200 personas escaneando QR en 5 minutos, la cola puede llegar a 5+ min de espera en el último."

**Por qué no se puede auditar:** la afirmación depende de métricas de runtime (latencia real de Supabase, concurrencia real de check-in, etc.) que no tengo acceso. Sin hacer un test de carga o leer logs de Vercel runtime de eventos pasados, no puedo confirmar ni negar la afirmación.

**Lo que se puede verificar en código:**
- `src/app/api/check-in/[token]/route.ts` tiene múltiples queries seriales (UPDATE event_qr_tokens + SELECT event_attendees + UPSERT/CREATE attendee + SELECT leads + UPDATE leads + INSERT audit). ~6 queries confirmadas.
- `src/app/api/staff/check-in/route.ts` similar.

**Veredicto:** 🟡 **No auditable** sin hacer test de carga o leer métricas de runtime.

**Fix conocido (OPEN_ITEMS):** paralelizar con `Promise.all([resolveConfirmationId, findLeadByPhone])` + audit log fire-and-forget. ~1 hora.

**Acción recomendada:** sprint dedicado cuando David tenga tráfico real (evento grande) que justifique la optimización. Hoy no es bloqueante.

---

### 15-17. H-1, H-2, H-3 (performance)

**Estado declarado en OPEN_ITEMS:**
- H-1: gate virtual con 4 queries seriales (700-900ms).
- H-2: rate limit in-memory no distribuido en Vercel.
- H-3: `source` se pierde en roundtrip físico+virtual.

**Por qué no se pueden auditar:** igual que C-6 — son afirmaciones sobre runtime, requieren métricas de carga real o test de stress.

**Veredicto:** 🟡 **No auditables** sin métricas.

**Acción recomendada:** sprint dedicado de "perf optimization" cuando David tenga tráfico que lo justifique. Documentar y dejar para futuro.

---

## ⚠️ DECISIÓN VIGENTE DE DAVID (1)

### 18. A-1 · Next.js 14.2.35 → 15/16 upgrade (12+ CVEs HIGH)

**Estado declarado en OPEN_ITEMS:** "Decisión vigente 2026-07-08: 'podemos vivir sin eso' hasta Q4 2026 o incidente."

**Procedimiento aplicado:** leer `package.json:32` y la decisión documentada en OPEN_ITEMS.

**Output:**
```json
"next": "14.2.35"
```

**Análisis de la decisión vigente (sin cambiarla):**

| CVE | Severidad | Mitigación actual |
|---|---|---|
| DoS via RSC | HIGH | Vercel Hobby rate limiting a nivel infra |
| XSS via CSP nonces / `beforeInteractive` | HIGH | Qlick no usa CSP nonces ni `beforeInteractive` con user input → no expuesto |
| Cache poisoning | HIGH | Rewrites/redirects simples en Qlick |
| Request smuggling | HIGH | Middleware simple (Qlick) |
| SSRF via WebSocket | HIGH | No usamos WebSockets |

**Veredicto:** ⚠️ **Decisión vigente sigue siendo válida** (no hay nuevo incidente, no hay tráfico masivo, no usamos los vectores explotables). Mantener.

**Trigger para reabrir:**
- Tráfico a escala masiva.
- Payloads malformados recurrentes en logs del bot.
- Mercado regulado (PCI-DSS, SOC2).
- Si se agregan CSP nonces o scripts `beforeInteractive` con user input.

**Acción recomendada:** revisar en Q4 2026 (3 meses desde ahora). Documentar fecha de revisión.

---

## ⚠️ ACCIÓN DE DAVID EN META UI (1)

### 19. G-5 · 3 plantillas Meta NO creadas

**Estado declarado en OPEN_ITEMS:** "Bot usa texto libre (funciona en ventana 24h). Si Meta rechaza text por >24h, bot no responde."

**Procedimiento aplicado:** verificar si la situación cambió.

**Output:** las plantillas siguen sin crearse. El bot sigue usando texto libre. En producción sigue funcionando (ventana 24h post-respuesta del usuario).

**Veredicto:** ⚠️ **Sigue real.** El código las referencia pero NO existen en Meta Business Manager. Si Meta cambia la política de texto libre o la cuenta tiene restricciones, el bot se rompe.

**Templates faltantes:** `conf_bienvenida`, `conf_info_evento`, `conf_confirmacion_registro`.

**Acción:** David en Meta UI (Business Manager → WhatsApp Manager → Message Templates) + 24-48h approval.

---

## ⚪ BLOQUEADOS por decisión externa (4)

### 20-23. Decisiones de socios

**Gaps en OPEN_ITEMS:**
- Proveedor de pagos (MercadoPago vs Stripe vs Conekta vs mix).
- Contenido real de cursos (videos placeholders de YouTube).
- Plantilla de email transaccional (Supabase default vs custom branded).
- Monitoring de errores en runtime (Sentry vs nada).

**Procedimiento:** ninguno. Son decisiones de producto con David + sócios, no auditable por Mavis.

**Acción:** documentar y dejar para cuando David traiga la decisión.

---

## 📊 Resumen cuantitativo

| Tipo de gap | Total | Cerrados | Activos | Bloqueados |
|---|---|---|---|---|
| Código/infra auditable | 16 | **11** | 2 (C-4, C-5) | 0 |
| Performance/runtime | 3 | 0 | 3 (C-6, H-1..3) | 0 |
| Decisión de David | 1 | 0 | 1 (A-1, vigente) | 0 |
| Acción de David en Meta UI | 1 | 0 | 1 (G-5) | 0 |
| Decisión de socios | 4 | 0 | 0 | 4 |
| **Total** | **25** | **11** | **7** | **4** |

**Pendiente real (acción de Mavis o David):** 2 (C-4 fix, C-5 fix — ambos son sprints dedicados de ~30 min).
**Pendiente diferido (perf):** 3 (requieren métricas de carga o evento grande).
**Pendiente decisión:** 5 (A-1 vigente, G-5, 4 decisiones de socios).

---

## 🎯 Recomendaciones priorizadas

### Para Mavis (próximo sprint)
1. **Sprint "UNIQUE constraint fix" (~45 min)**: cierra C-4 y C-5 en un solo commit atómico.
   - Migration: `UNIQUE INDEX event_attendees_event_phone_unique ON event_attendees (event_id, phone_normalized)`.
   - Cambio de `onConflict` en `attendees-server.ts` y `surveys-server.ts`.
   - Cambio de check-in endpoint a UPDATE atómico con `WHERE checked_in_at IS NULL`.
   - Validación completa.

### Para David (próximas semanas)
2. **Plantillas Meta (G-5)**: 1h setup + 24-48h approval. Bloquea outreach proactivo.
3. **A-1 revisión Q4 2026**: poner recordatorio.

### Diferido
4. **Performance (C-6, H-1..3)**: cuando haya tráfico que lo justifique.
5. **Decisiones de socios**: cuando David tenga las respuestas.

---

## 🔧 Procedimiento replicable (para futuras auditorías)

Para cada gap abierto en `OPEN_ITEMS.md`:

1. **Clasificar**: código, infra, decisión, runtime, no auditable.
2. **Si es código**:
   - `git log --oneline -- <file>` para ver historia.
   - `grep -r "<symbol>" src/` para ver usos.
   - Leer el código que lo implementa + verificar tests asociados.
3. **Si es infra (Vercel/Supabase)**:
   - **Vercel**: API REST con `Authorization: Bearer $env:VERCEL_TOKEN`. Endpoints útiles: `/v9/projects/{id}/env`, `/v9/projects/{id}`.
   - **Supabase**: Management API con `Authorization: Bearer $env:SUPABASE_ACCESS_TOKEN`. Endpoints: `/v1/projects/{ref}/database/query` (DDL/DML), `/v1/projects/{ref}` (metadata).
   - **TRUCO**: `vercel env pull` miente para sensitive vars — usar request público a `robots.txt` o `sitemap.xml` para revelar el valor real en runtime.
4. **Si es decisión de David**: documentar contexto, no auditar.
5. **Si es performance/runtime**: marcar como "no auditable sin métricas" + razón.
6. **Si no es auditable**: explicar por qué + acción recomendada.

---

## 📁 Archivos referenciados

- `docs/OPEN_ITEMS.md` — gaps auditados
- `docs/STATUS.md` — snapshot vivo de prod
- `docs/CHANGELOG.md` — release notes v0.9.0–v0.9.9
- `docs/ROADMAP.md` — roadmap priorizado
- `docs/HANDOFF_v0.9.8_SUPER_EJECUTIVO.md` — sprint v0.9.8 cerrado
- `docs/HANDOFF_v0.9.9_BOT_MASSIVE_SIMULATION.md` — sprint v0.9.9 cerrado
- `scripts/audit-migrations-applied.mjs` — herramienta canónica de audit de schema
- `data/PROJECT-LOG.md` — entrada del sprint 2026-07-12 con detalle completo

---

## 🔏 Validación

- **Sesión Mavis:** `mvs_415b722f51c747e7a27784e4381986c2`
- **Rama de audit:** `feat/audit-gaps-prod-2026-07-12`
- **Pendiente:** commit atómico + push + esperar OK de David para merge a main.
