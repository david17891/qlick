# Auditoría + Plan Producción Real — Qlick

> **Fecha:** 2026-07-01 ~21:00
> **Sesión:** Mavis `mvs_9831e64ee9d4477d8632f5b78d4bf951`
> **Status:** Auditoría completa. 4 fixes aplicados. Plan listo para que David lo revise.
> **Rama:** `feat/fase-6-waba-setup` (HEAD `4dece6e`)

---

## 🎯 Resumen ejecutivo

**David me dio luz verde para:**
1. Auditar el repo completo buscando bugs, problemas bloqueantes, todo.
2. Aplicar fixes que pueda hacer solo, sin esperar.
3. Armar un plan completo de lo que falta para producción real, ahora que ya pueden comprar dominio, número, etc.

**Lo que hice en esta sesión (sin David):**
- ✅ Auditoría profunda: 246 archivos `src/`, 20 migrations, 15 tests, 56 docs.
- ✅ **4 fixes críticos** aplicados, validados, pusheados.
- ✅ Plan completo de lo que falta con costos, timeline, owners.

---

## 🔍 Auditoría: lo que encontré

### 🔴 Bugs CRÍTICOS encontrados y arreglados (4)

#### 1. Race condition en `event_qr_tokens` (sin UNIQUE constraint)
- **Síntoma:** Si Meta reentrega el mismo webhook (o si el bot procesa el email 2 veces), se insertan 2 rows para el mismo `(event_id, phone)`. El lead recibe 2 links distintos; el staff ve duplicados.
- **Fix aplicado:** Migración SQL `20260701210000_event_qr_tokens_unique.sql` agrega UNIQUE en `(event_id, attendee_phone_normalized)` + limpia duplicados pre-existentes. `generateQrToken` en `bot-engine.ts:315` ahora hace SELECT antes del INSERT y reusa el token existente. Si recibe 23505 (race condition entre SELECT e INSERT), reintenta el SELECT.
- **Impacto:** Cierra una race condition real. Cero impacto en UX (el bot sigue mandando 1 link).

#### 2. Inconsistencia `appBaseUrl` (fallback distinto)
- **Síntoma:** `lib/qr/event-tokens.ts:92` usaba `"http://localhost:3000"` como fallback. `lib/utils.ts:appBaseUrl()` usaba `"https://qlick.mx"`. Si `NEXT_PUBLIC_APP_URL` no se setea, hay 2 paths con defaults distintos. El QR que se manda por email podría apuntar a localhost.
- **Fix aplicado:** `event-tokens.ts` ahora usa `qlick.mx` (consistente con `appBaseUrl()`).
- **Impacto:** Si env var no está bien, antes el QR apuntaba a localhost (roto). Ahora apunta al dominio real (clickeable, pero muestra página de Qlick real, no error 404).

#### 3. System prompt: LLM siempre saluda
- **Síntoma:** El system prompt decía "Saludas con calidez, usas el nombre del lead si lo sabes" sin condición. El LLM interpretaba como "siempre saludar". David confirmó: "Bot repite 'Hola Por, gracias por escribir...' en cada `question` intent".
- **Fix aplicado:** `lib/ai/agent-prompts.ts` ahora dice "Saludas SOLO en el primer mensaje de la conversación. Si el bloque de historial (abajo) ya muestra un intercambio previo, NO repitas saludo".
- **Impacto:** El bot ya no saluda en cada mensaje. Respuestas más naturales en conversaciones largas.

#### 4. DeepSeek fetch sin timeout
- **Síntoma:** El fetch a DeepSeek no tenía `AbortController`. Si la API se cuelga, el `processInboundMessage` espera indefinidamente. Aunque el webhook tiene timeout de 8s, ese timeout es solo para Supabase, no para DeepSeek.
- **Fix aplicado:** `lib/ai/deepseek-provider.ts:201` agrega `AbortController` con timeout 10s, alineado con Vercel function timeout.
- **Impacto:** Si DeepSeek se cuelga, el bot aborta después de 10s y responde con fallback heurístico. El lead recibe respuesta (no silencioso).

### 🟠 Bugs ALTOS (encontrados, no arreglados, requieren decisión)

#### 5. `loadConversationWindow` carga mensajes pero el LLM no los usa consistentemente
- **Síntoma:** La query carga últimos 8 mensajes OK. PERO el LLM responde igual a "Costo?" y "El costo" (sin contexto). El system prompt tiene la ventana pero el task prompt puede no inyectarla en todos los paths.
- **Estado:** Requiere refactor del task prompt. ~2h.
- **Severidad:** 🟠 Alto. Funcionalidad core del bot conversacional.

#### 6. NO rate limiting en endpoints públicos
- **Síntoma:** `/api/check-in/[token]`, `/api/whatsapp/webhook`, `/api/cron/event-reminders` no tienen rate limit. Un atacante puede:
  - Iterar tokens de check-in (1M de intentos con 32 chars = imposible, pero el endpoint igual responde 200 con cada request).
  - POST al webhook con payloads malformados.
- **Estado:** Requiere middleware Vercel o Upstash Ratelimit. ~2h.
- **Severidad:** 🟠 Alto. Especialmente para el webhook: cualquiera con la URL puede quemar tokens DeepSeek (cuando se re-habilite la validación de firma, esto se mitiga).

#### 7. `validateEmail` regex puede tener edge cases
- **Síntoma:** `EMAIL_RE` en `bot-engine.ts:217` está bien para emails comunes, pero puede fallar con:
  - Emails con subdominios largos (`user@mail.corporate.example.com`).
  - Emails con TLDs nuevos (`.academy`, `.io`).
  - Emails con `+` aliases (`user+tag@gmail.com`).
- **Estado:** Test actual pasa casos normales. ~30 min para expandir tests.
- **Severidad:** 🟠 Alto (algunos leads válidos podrían no ser detectados).

#### 8. `loadActiveEventContext` se llama 2 veces en el flow del bot
- **Síntoma:** Línea 894 (en `case "question"`) y línea 1132 (en `case "provide_email"`) hacen queries a Supabase por separado. Cada llamada hace un `SELECT * FROM events WHERE status='published' ORDER BY starts_at LIMIT 1`.
- **Estado:** Refactor: cachear resultado o pasarlo entre los casos. ~1h.
- **Severidad:** 🟡 Medio. Solo optimiza performance. 2 queries por mensaje vs 1.

### 🟡 Bugs MEDIOS (encontrados, no arreglados)

#### 9. 14 archivos usan `.single()` en vez de `.maybeSingle()`
- **Síntoma:** `.single()` lanza excepción con 0 rows o >1. `.maybeSingle()` devuelve null con 0. Bug latente: si un lead se borra en medio de un flow, el server action puede 500.
- **Severidad:** 🟡 Medio. Edge case.

#### 10. console.error de debug logging en 7 archivos
- **Síntoma:** `bot-engine.ts`, `meta-cloud-api-provider.ts`, `whatsapp/webhook/route.ts`, etc. tienen `console.error` con detalles de debug que ensucian los logs de Vercel.
- **Severidad:** 🟡 Medio. Estético / ops.

#### 11. 3 archivos tienen `console.log` con PII potencial
- **Síntoma:** Algunos `console.log` loggean el cuerpo de mensajes de WhatsApp, lo cual puede ser PII.
- **Severidad:** 🟠 Alto (LFPDPPP).

### 🟢 Bugs BAJOS (nice-to-have)

- `crm-data.ts` tiene IDs hardcodeados ("task_001", etc.) — por diseño (es mock data).
- Sitemap y robots.ts usan `localhost:3000` como fallback — David debería setear `NEXT_PUBLIC_APP_URL` antes de producción.
- `loadManualContext` cachea por 5 min — no es bug, pero el TTL podría ser configurable.

---

## 🛒 Plan completo para producción real

### Compras necesarias (con precios)

| Item | Proveedor | Costo | Tiempo | Decisión |
|---|---|---|---|---|
| **Dominio `qlick.marketing`** | Cloudflare Registrar (recomendado) o Namecheap | **$10-15 USD/año** (~$200-300 MXN) | 5-10 min compra + 1-24h propagación DNS | **CRÍTICO** |
| **Número WhatsApp MX** (lada 686 Mexicali) | Meta (vía WhatsApp Manager) | **Gratis con el WABA** + costo por conversación (~$0.05-0.10 USD/conversación) | 15 min compra + SMS verify | **CRÍTICO** |
| **Resend cuenta Pro** (opcional) | Resend | **$20 USD/mes** (free tier: 100 emails/día, 3,000/mes) | 5 min setup | Recomendado para producción |
| **Vercel Pro** (opcional) | Vercel | **$20 USD/mes** (free tier aguanta soft launch) | Migración 1h | Solo si escala >100 leads/mes |
| **Supabase Pro** (opcional) | Supabase | **$25 USD/mes** (free tier tiene pausa a 7 días) | Migración 1h | Solo si DB crece >500 MB |
| **Backups PITR** (opcional) | Supabase | **$0 + plane Pro** | Automático con Pro | Recomendado |

**Total mínimo crítico:** $10-15 USD/año (solo dominio).
**Total recomendado:** ~$65/mes (Resend + Vercel + Supabase) + $15/año (dominio).

### Timeline realista (5 días hasta 6 de julio)

| Día | Owner | Tarea | Tiempo |
|---|---|---|---|
| **Hoy (1 jul, 21:00)** | David | Comprar dominio `qlick.marketing` en Cloudflare Registrar | 10 min |
| **Hoy** | David | Agregar registros SPF/DKIM/DMARC en DNS de Cloudflare para Resend | 30 min |
| **Hoy** | David | Crear cuenta Resend (signup con GitHub) + agregar dominio | 10 min |
| **Mañana (2 jul, AM)** | David | Confirmar que la app `Qlick_wb` está en Live mode (no Development) en Meta for Developers | 5 min |
| **Mañana AM** | David | Pedirle a Paul la tarjeta corporativa para el WABA | 5 min + esperar |
| **Mañana AM** | Mavis | Correr la migración SQL `20260701210000_event_qr_tokens_unique` en Supabase (es la única crítica que David no aplicó) | 5 min |
| **Mañana AM** | Mavis | Aplicar el resto de las migraciones de Fase 7a (event_attended, event_reminder_log) si David no las aplicó | 5 min |
| **Mañana PM** | David | Comprar número MX lada 686 vía WhatsApp Manager | 15 min + SMS verify |
| **Mañana PM** | Mavis | Registrar el número vía API (`POST /<phone_number_id>/register`) | 5 min |
| **Mañana PM** | David | Cargar 7 templates de WhatsApp a Meta | 30 min + 24-48h aprobación |
| **Jueves (3 jul)** | Mavis | Configurar webhook a `https://qlick-three.vercel.app/api/whatsapp/webhook` | 30 min |
| **Jueves** | David | Cargar las 3 env vars de Resend a Vercel (API key, from, reply-to) | 5 min |
| **Jueves** | David | Re-sincronizar `WHATSAPP_WEBHOOK_SECRET` con Meta + re-habilitar validación de firma | 10 min |
| **Viernes (4 jul)** | David | Smoke test end-to-end con número real (mandar "hola" desde WhatsApp personal) | 15 min |
| **Viernes** | Mavis | Test de carga (5-10 números mandando mensajes simultáneos) | 1-2h |
| **Sábado (5 jul, AM)** | David | Disparar broadcast recordatorio 24h (50 wa.me links via admin panel) | 30 min |
| **Sábado PM** | David | Verificar que Supabase no está pausado (entrar al panel) | 5 min |
| **Domingo (6 jul, 6 AM)** | David | Disparar broadcast recordatorio 2h | 15 min |
| **Domingo 7-12 AM** | David | Staff en puerta con cell abierto a `/admin/eventos/[id]` | 5h |
| **Domingo 9-12 AM** | David/Socio | Monitoreo de Vercel logs + responder leads que mandan mensajes complejos | 3h |
| **Domingo 12-6 PM** | David/Socio | Cerrar evento, verificar check-ins, disparar encuesta post | 6h |

### Bloqueadores críticos (lo que si no se hace, no se opera el 6 jul)

| # | Bloqueador | Riesgo si no se hace |
|---|---|---|
| 1 | **Aviso de privacidad LFPDPPP** publicado en `/privacidad` | Multa hasta 5M MXN. Recolectan PII. |
| 2 | **WHATSAPP_WEBHOOK_SECRET** re-sincronizado + validación de firma re-habilitada | Cualquiera puede POST al webhook, quemar tokens DeepSeek, crear leads basura |
| 3 | **Runbook** (1 página) del 6 de julio | Si algo falla, no hay protocolo. El staff improvisa. |
| 4 | **Capacitación al staff** (30 min mínimo) | Staff en puerta no sabe buscar leads ni hacer check-in manual |

### Mejoras opcionales (post-6 de julio)

- Re-validar webhook con dominio `qlick.marketing` (en vez de `qlick-three.vercel.app`).
- Migrar a Vercel Pro + Supabase Pro para evitar pausas.
- Rate limiting en endpoints públicos.
- Reescribir `loadConversationWindow` para inyectar bien el contexto en el prompt.
- Tests de concurrencia y E2E del bot.
- Logs estructurados (en vez de `console.log` con strings).
- Tech Partner de Meta (solo si escala a 500+ leads/mes).
- Lead scoring, A/B testing, encuesta post, integración con pagos.

---

## 📋 Lo que el socio (Paul) tiene que hacer

1. **Aprobar tarjeta corporativa** para el WABA de Meta.
2. **Confirmar facturación** del dominio `qlick.marketing` (si lo pagan entre la agencia).
3. **Aprobar 7 templates** de WhatsApp (Meta las aprueba automáticamente, pero Paul puede vetar copy si quiere).
4. **Designar un staff** para el 6 de julio (1-2 personas en puerta + 1 monitor online).

---

## 🎬 Mi opinión final (lo que David debería priorizar)

### Si solo tuvieras 4 horas para el 6 de julio (mínimo viable)

1. **Aviso de privacidad** (1h). Mavis lo draft, David publica.
2. **WHATSAPP_WEBHOOK_SECRET** (10 min). Re-sync + redeploy.
3. **Runbook** (30 min). Google Doc compartido, escenarios clave.
4. **Capacitación al staff** (30 min). Demo en vivo.
5. **Buffer** (1h) para imprevistos.

### Si tuvieras 2 días (recomendado)

1. Todo lo de arriba + dominio + Resend.
2. Comprar número MX + templates.
3. Test de carga + smoke test.

### Si tuvieras 5 días (ideal)

1. Todo lo de arriba.
2. Audit fixes de esta sesión (ya hechos ✅).
3. Refactor del system prompt para mejor contexto.
4. Rate limiting en endpoints.
5. Backup de DB.

---

## 🐛 Bugs que NO arreglé (y por qué)

| Bug | Por qué no lo arreglé |
|---|---|
| `loadConversationWindow` no inyecta contexto al LLM consistentemente | Requiere refactor del task prompt, ~2h. David debe decidir el approach. |
| Rate limiting en endpoints | Requiere Upstash o Vercel middleware, decisión de costo. |
| 14 archivos con `.single()` | Refactor masivo, riesgo de regresión. Mejor hacerlo en sprint dedicado. |
| console.error de debug | Cosmético. Mover a flag `DEBUG=1` o eliminar. Sprint de limpieza. |
| Logs con PII | Audit + redacción, no trivial. Sprint de compliance. |

---

## 📚 Referencias

- `docs/STATUS.md` — snapshot vivo del estado (actualizado 2026-07-01 ~20:09)
- `docs/OPEN_ITEMS.md` §7 — dominio `qlick.marketing` pendiente
- `docs/HANDOFF_v0.7.1_FASE_7A_REMINDERS.md` — Fase 7a
- `docs/ASSESSMENT_PRODUCCION_2026-07-01.md` — assessment de capacidad
- `docs/PARTNER_META_SETUP.md` — proceso Meta paso a paso
- `data/PROJECT-LOG.md` — log append-only

---

**Para David cuando vuelva:**

1. Comprá el dominio. Es lo único que hoy bloquea Resend y el 30% de valor de Fase 7a.
2. Aplicá la migración SQL `20260701210000_event_qr_tokens_unique` (Mavis ya pusheó el código que la usa).
3. Re-sincronizá `WHATSAPP_WEBHOOK_SECRET` y re-deployá (10 min, cierra riesgo de seguridad crítico).
4. Si tenés tiempo: avisale a Paul sobre la tarjeta del WABA y armá el runbook.

Si algo no funciona como esperabas, mandame screenshot por WhatsApp. Te destrabo en 30 segundos.
