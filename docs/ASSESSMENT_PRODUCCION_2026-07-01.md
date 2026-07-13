> **📌 Snapshot histórico (sprint housekeeping 2026-07-12):** Este doc es un snapshot del estado del proyecto a la fecha de su creación (ver frontmatter o el commit al inicio del doc). El proyecto ha evolucionado — para el estado actual, ver [docs/STATUS.md](STATUS.md) y [docs/OPEN_ITEMS.md](OPEN_ITEMS.md) (resumen ejecutivo al inicio). Las menciones a Resend o qlick.marketing son del contexto histórico; el email transaccional actual usa **Brevo** (
oreply@qlick.digital).

# Assessment: Producción Real — Qlick Marketing

> **Fecha:** 2026-07-01 ~20:25
> **Owner:** Mavis (sesión `mvs_9831e64ee9d4477d8632f5b78d4bf951`)
> **Para:** David (dev lead) + Paul (socio de la agencia)
> **Status:** Working draft — David marca críticos antes de atacar

## 🎯 Resumen ejecutivo (TL;DR)

**El sistema está ~65% listo para uso real.** El otro 35% se divide en:

| Bloque | % listo | Quién lo destraba | Tiempo |
|---|---|---|---|
| **Código del bot + check-in + funnel** | 90% | (casi listo) | 1-2 días |
| **Capacidad / concurrencia** | 80% (aguanta soft launch) | David decide si escala | 1 día análisis |
| **Meta: de live a producción real** | 40% | David (Meta setup) + Paul (pago) | 3-7 días |
| **Concurrencia del bot con N usuarios** | 70% (gaps connus) | Mavis | 2-3 días |
| **Procesos operativos (runbook, escala)** | 25% | David + Paul | 1 día |

**Mi opinión:** el **6 de julio se opera en soft launch** con 30-50 leads, sin riesgo, sin necesidad de comprar nada de Meta todavía. Después del 6, antes de escalar a 100+ leads o pretender que es un SaaS, hay que cerrar el proceso de Meta (3-7 días) + hardening de concurrencia (2-3 días).

---

## 1. Estado actual del sistema

### ✅ Lo que está sólido (no tocar)

- **Bot WhatsApp** end-to-end: 5+ intents, persistencia real, handoff a humano, deepseek switch Flash↔Pro.
- **Check-in QR** en puerta: actualiza `event_qr_tokens` + `event_attendees`.
- **Funnel promotion**: check-in → `event_attended` en el CRM.
- **181/181 tests** pasando, lint, type-check, build OK.
- **Persistencia real** en Supabase (24 tablas, schema sincronizado).
- **Webhook delivery** confirmado: 9+ POSTs de Meta en una hora, handler responde 200.

### 🟡 Lo que está parcial (1-2 días cada uno)

- **Aviso de privacidad** (LFPDPPP art. 15-17): no existe publicado. Recolectan nombre, email, phone, ubicación. **Multa de hasta 5M MXN si no está.**
- **Validación de firma del webhook**: `WHATSAPP_WEBHOOK_SECRET` removido de Vercel (workaround). Handler acepta cualquier POST. Cualquiera puede gastar tokens DeepSeek ($) o crear leads basura.
- **Bot sin contexto entre turnos**: `loadConversationWindow` no carga mensajes previos correctamente. LLM responde igual a "Costo?" y "El costo".
- **Race conditions en `generateQrToken`**: 2 webhooks simultáneos del mismo lead pueden insertar 2 rows. No hay UNIQUE constraint que lo prevenga.

### 🔴 Lo que falta (crítico)

- **Dominio `qlick.marketing`**: no comprado. Bloquea Resend y da credibilidad.
- **App de Meta en producción real**: hoy está "live" pero sin business verification, sin WABA dedicado, sin número real comprado, sin templates aprobadas.
- **Runbook del 6 de julio**: no existe. Si el bot cae, no hay protocolo.
- **Backup de DB**: Supabase free tier no incluye PITR (point-in-time recovery). Si se borra algo, se pierde.

---

## 2. Capacity planning: Vercel + Supabase + concurrencia

### Vercel free tier límites (lo que tenemos hoy)

| Recurso | Free tier | Plan Pro |
|---|---|---|
| Bandwidth | 100 GB/mes | 1 TB/mes |
| Function execution time | 100 GB-hours/mes | 1,000 GB-hours/mes |
| Concurrent functions | 12 | Ilimitado (auto-scaling) |
| Max execution time per fn | 10s | 60s (configurable hasta 900s) |
| Deploys | 100/día | 6,000/día |

**Estimación para el 6 de julio** (30-50 leads, ~5 mensajes c/u):

- Total invocaciones: ~250 (5 msgs × 50 leads)
- Tiempo por invocación: ~3-5s (DB query + LLM call + Meta send)
- GB-seconds: 250 × 4s = ~1,000 GB-seconds = **0.001 GB-hours** (0.001% del free tier)
- **Conclusión: aguanta el 6 jul sin problema.**

**Pero hay un riesgo real**: 12 funciones concurrentes. Si 30 leads mandan mensaje en la misma ventana de 30 segundos, los 18 últimos hacen queue. Latencia visible (10-30s). El lead se impacienta, manda otro mensaje, race condition, posiblemente 23505.

**Recomendación**: para soft launch del 6 jul, **free tier aguanta**. Para escalar a 200+ leads o pretender que es SaaS, **migrar a Pro ($20/mes)** o aceptar latencia en picos.

### Supabase free tier límites

| Recurso | Free tier | Plan Pro ($25/mes) |
|---|---|---|
| Database | 500 MB | 8 GB |
| Storage | 1 GB | 100 GB |
| Bandwidth | 2 GB | 50 GB |
| Edge function invocations | 500K/mes | 2M/mes |
| Pause inactividad | Sí, a los 7 días sin uso | No |

**Riesgo real**: si nadie usa la app por 7 días, Supabase pausa el proyecto. El primer request post-pausa tarda ~30s en "despertar". Si David no usa el panel admin entre el 2 jul y el 6 jul, el primer request el día del evento se va a demorar.

**Recomendación**: hacer al menos 1 request a la DB el 5 jul (entrar al panel admin, ver un lead). O migrar a Pro.

### Concurrencia del bot con N usuarios

| Punto de race condition | Estado actual | Fix |
|---|---|---|
| `findLeadByPhone` + `createLeadFromWhatsApp` | ✅ Mitigado: `if (error.code === "23505")` busca el existente. | OK. |
| `generateQrToken` (mismo lead, 2 webhooks simultáneos) | ❌ **Gap**: no hay UNIQUE constraint. Se duplican rows. | Agregar UNIQUE en `(event_id, attendee_phone_normalized)` y `ON CONFLICT DO NOTHING`. ~30 min. |
| `persistConversation` con `whatsapp_message_id` | ✅ UNIQUE constraint. Re-entrega de Meta = idempotente. | OK. |
| `event_reminder_log` | ✅ UNIQUE en `(event_qr_token_id, reminder_kind)`. Idempotente. | OK. |
| `loadConversationWindow` | ❌ **Gap**: no carga mensajes previos, LLM sin contexto entre turnos. | Refactor de la query + sistema prompt. ~2 horas. |
| 12 funciones concurrentes en Vercel free | ❌ Queue con latencia visible en picos | Migrar a Pro O aceptar latencia. |

---

## 3. Proceso Meta: de "live" a producción real

David mencionó: *"actualmente está en live, pero para pasar a real y poder que comprar el número, tenemos que hacer algo como tecnical socio o algo asi..."*

### El estado actual de la app de Meta

Mirando `docs/PARTNER_META_SETUP.md` (versión 2026-07-01 13:33) + estado real en Vercel:

| Paso del proceso | Status hoy | Lo que falta |
|---|---|---|
| David agregado como Admin al Negocio de Paul | ✅ Hecho | — |
| Empresa verificada en Meta | ✅ Hecho | — |
| Página "Qlick Marketing Digital" accesible | ✅ Hecho | — |
| App de Meta for Developers creada ("Qlick_wb") | ✅ Hecho (App ID `1532987041600498`) | — |
| WABA "Qlick Marketing Digital" dedicado | ✅ Existe WABA `1670509767335938` | — |
| Número MX comprado (lada 686, Mexicali) | ❌ **Falta**. Hoy es sandbox `+1 555 201 7643` (test) | Comprar número + SMS verify |
| Método de pago agregado al WABA | ❌ Bloqueado: **Paul no ha cargado tarjeta** | Decisión: tarjeta Paul, David, o saldo prepago |
| 7 plantillas WhatsApp cargadas y aprobadas | ❌ Pendiente (post-número) | Cargar + esperar 24-48h aprobación |
| Access Token permanente generado | ❌ Temporal (24h) | Generar System User Token |
| Webhook configurado y verificado | ❌ Requiere dominio production | Después de comprar dominio |

### Lo que David llamó "técnical socio"

David probablemente se refiere a **"Tech Partner"** o **"Solution Partner"** — el programa de partners de Meta que ayuda a configurar la integración con WhatsApp Business API. Hay varios en México (360dialog, MessageBird/Bird, Twilio).

**Mi opinión sobre esto**:

1. **Un Tech Partner agrega fricción y costo** (entre $100-$500/mes + setup). Para 30 leads/mes, no tiene ROI.

2. **Lo que SÍ necesita David para producción real** (sin Tech Partner):
   - Business verification (ya está ✅)
   - Tarjeta corporativa cargada al Business Manager (Paul)
   - Comprar número MX real
   - Generar System User Token permanente
   - Cargar 7 templates a Meta
   - Esperar 24-48h aprobación de templates
   - Configurar webhook con dominio production
   - Smoke test end-to-end

3. **Tiempo realista: 3-7 días** (depende de Paul cargando la tarjeta + Meta aprobando templates).

4. **Si decide usar Tech Partner**: Twilio es el más simple para empezar. Tiene free trial con $15 de crédito, setup en 1 día. **Pero** el stack actual ya está sobre Meta Cloud API directo — migrar a Twilio implicaría refactorizar `meta-cloud-api-provider.ts` por el equivalente de Twilio. **No vale la pena para 6 jul.**

### Recomendación: NO usar Tech Partner

Para 30-100 leads/mes, Meta Cloud API directo es suficiente. Tech Partner tiene sentido a 500+ leads/mes o si David quiere delegar todo el ops a un partner (no es el caso).

---

## 4. Lo crítico a arreglar (priorizado)

David dijo: *"vamos primero a arreglar lo crítico"*. Mi lista priorizada, en orden de ataque:

### 🟥 P0 — No sale a producción sin esto (1-2 días)

1. **Aviso de privacidad LFPDPPP** (legal, multa hasta 5M MXN).
   - Template: 1-2h (Mavis puede draft, David revisa).
   - Publicar en `/privacidad` (ruta ya existe en el repo, solo falta contenido).
   - Link desde el bot en el primer mensaje + desde el form de inscripción.

2. **Validar firma del webhook** (`WHATSAPP_WEBHOOK_SECRET`).
   - Setup: 5 min (David genera secret, lo mete en Vercel + Meta).
   - Es **crítico de seguridad**: hoy cualquiera con la URL puede POST y consumir tokens DeepSeek ($) o crear leads basura.

3. **UNIQUE constraint en `event_qr_tokens`** para evitar duplicados de QR.
   - SQL: 5 min. Una constraint + ON CONFLICT en el bot.
   - Cierra una race condition real con concurrentes.

4. **Test de carga del bot antes del 6 de julio**.
   - 5-10 números de WhatsApp reales mandando mensajes simultáneos.
   - Verificar latencia, rate limits de DeepSeek, race conditions.

### 🟧 P1 — Importante pero puede esperar post-6 de julio (3-5 días)

5. **Meta production real** (número, templates, token permanente).
   - Owner: David + Paul (la tarjeta).
   - Tiempo: 3-7 días (Meta approval).

6. **Runbook del 6 de julio** (operación + escalation).
   - 1-2h. Google Doc compartido con David + Paul + 1 staff.
   - Secciones: pre-evento, durante, post-evento, escalation paths, escenarios (bot cae, QR no escanea, lead complejo, admin cae, etc.).

7. **Backups de DB** (PITR de Supabase).
   - 1h setup. Pro plan: $25/mes. Free tier: dump manual cada semana.
   - Crítico si van a usar datos reales de leads.

8. **`loadConversationWindow` fix** (contexto entre turnos).
   - 2-3h. Refactor de la query + ajuste del system prompt del agente IA.
   - Funcionalidad core del bot conversacional.

9. **Capacitación al staff** (2-3 personas).
   - 1h. Demo en vivo de `/admin/eventos/[id]`, búsqueda por nombre, check-in manual, broadcast WhatsApp.

### 🟨 P2 — Nice-to-have, post-6 de julio

- Lead scoring automático
- A/B testing de mensajes
- Encuesta post-evento automática
- Integración con Google Calendar
- Integración con Stripe para pagos
- Multi-evento
- Migración a Vercel Pro
- Tech Partner de Meta (si escala a 500+ leads/mes)

---

## 5. Recomendación operativa para el 6 de julio

Asumiendo que David **no compra el dominio ni el número Meta real antes del 6** (lo más probable dado el timeline):

### Modo soft launch — funciona, no escala

- **Asistentes**: esperan link por WhatsApp (no por email). Algunos olvidan. ~30% no-shows.
- **Staff en puerta**: usa panel admin, busca por nombre o escanea QR desde pantalla del asistente.
- **Recordatorios**: David manda manualmente via broadcast el día anterior o 2h antes (admin panel → generar broadcast → click 50 wa.me links).
- **Bot**: si llega algo complejo, redirige a WhatsApp del socio/David. Horario: lo que David defina.
- **Admin**: si cae Vercel, no hay backup. Riesgo bajo pero real.

### Quién hace qué el 6 de julio

| Cuándo | Quién | Qué |
|---|---|---|
| 5 jul AM | David | Disparar broadcast recordatorio 24h (50 wa.me links) |
| 5 jul PM | David | Verificar que Supabase no está pausado (entrar al panel) |
| 6 jul 6:00 AM | David | Disparar broadcast recordatorio 2h (50 wa.me links) |
| 6 jul 7:00 AM | David | Monitoreo de Vercel logs (página dashboard abierta) |
| 6 jul 8:00 AM | David/Socio | Staff en puerta: cell con acceso a `/admin/eventos/[id]` |
| 6 jul 9:00 AM - 12:00 PM | Staff | Check-in de asistentes (búsqueda por nombre o QR) |
| 6 jul 12:00 PM - 6:00 PM | David/Socio | Responder leads que mandan mensajes complejos (handoff) |
| 6 jul 6:00 PM+ | David | Cerrar evento, verificar check-ins, disparar encuesta post |

### Mitigación de riesgos

- **Si Vercel cae**: raro, pero degradar a "manual" (leads nuevos los registra David a mano en el admin).
- **Si el bot no responde**: mismo, manual.
- **Si el QR no escanea**: verificar manualmente por nombre.
- **Si un lead reclama**: David o socio responde por WhatsApp.
- **Si Supabase está pausado**: entrar al panel lo "despierta" en ~30s. Tener un contingency de 5 min al inicio.

---

## 6. Mi opinión final (lo que David me pidió)

### Qué atacar primero (en orden)

1. **Hoy (sábado 1 jul, 20:00-22:00)**: Aviso de privacidad + UNIQUE en event_qr_tokens + setup de WHATSAPP_WEBHOOK_SECRET.
2. **Domingo 2 jul**: Test de carga del bot. Migración a `feat/fase-7-*` o cherry-pick de `feat/fase-6-waba-setup`.
3. **Lunes 3 jul**: Runbook. Capacitación al staff. Smoke test con 3-5 números reales.
4. **Martes 4 jul**: Empezar proceso Meta con Paul (cargar tarjeta + comprar número).
5. **Miércoles 5 jul**: Templates a Meta. Backup manual de DB. Broadcast recordatorio 24h.
6. **Jueves 6 jul**: Día del evento. Soft launch con mitigaciones.

### Qué NO vale la pena antes del 6 de julio

- Tech Partner de Meta (costo y migración no justifican)
- Migrar a Vercel Pro (free tier aguanta soft launch)
- Lead scoring / A/B testing (premature optimization)
- Multi-evento (no es el caso de uso ahora)
- Integración de pagos (no es el alcance del soft launch)

### Qué sí o sí hay que hacer antes del 6

1. Aviso de privacidad LFPDPPP
2. WHATSAPP_WEBHOOK_SECRET (seguridad)
3. UNIQUE en event_qr_tokens (race condition)
4. Test de carga
5. Runbook (aunque sea 1 página)
6. Capacitación al staff (aunque sea 30 min)

---

**Documentos relacionados:**

- `docs/PARTNER_META_SETUP.md` — proceso Meta paso a paso (versión 13:33)
- `docs/HANDOFF_v0.7.1_FASE_7A_REMINDERS.md` — fase 7a (pase digital + funnel + cron)
- `docs/STATUS.md` — snapshot vivo del estado
- `data/PROJECT-LOG.md` — log append-only de cambios
- `docs/OPEN_ITEMS.md` §7 — dominio `qlick.marketing` pendiente
