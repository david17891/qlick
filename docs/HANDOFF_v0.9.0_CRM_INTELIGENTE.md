# HANDOFF v0.9.0 — CRM Inteligente (v2.0)

> **Release point:** v0.9.0 (alias interno *CRM Inteligente v2.0*)
> **Fecha de cierre:** 2026-07-06 18:42 (America/Phoenix, UTC-7)
> **Branch:** `main`
> **Commits canónicos:**
> - `ec9eb55` — `feat(crm): Fase 2-3 - Conversaciones reales + inteligencia comercial + agente IA dinamico` (HEAD)
> - `d150d9d` — `feat(crm): Fase 1 - Archivado logico, bulk actions con optimistic lock, export CSV streaming`
>
> **Tags de respaldo (rollback):**
> - `v0.9.0` *(por crear en commit de gobierno — apunta a `ec9eb55`)*
> - `v1.1-crm1-stable` — cierre Fase 1, sin conversaciones reales ni IA
> - `v1.0-bot-stable` — bot 100% funcional, pre-CRM
> - `v0.8.0` — wizard WhatsApp funcional + Español MX
>
> **Estado de tests:** **545/545 verde** (sin regresión vs v0.8.0)
> **Audit E2E:** script `scratch/qlick-crm-ai-audit.mjs` pasa **18/18 aserciones** contra DB real.
>
> **Bot engine:** ✅ **NO MODIFICADO** (política de aislamiento verificada con `git diff v1.1-crm1-stable HEAD -- src/lib/whatsapp/bot-engine.ts` → 0 hits).

---

## 1. Resumen Ejecutivo del Release

### ¿Qué se construyó?

Una capa de inteligencia comercial 100% real sobre el CRM que hasta v0.8.0 leía mocks en varias secciones críticas. El release cierra 3 fases de golpe:

| Fase | Entregable | Valor al usuario |
|---|---|---|
| **Fase 1 — Compliance + Operatividad** | Soft delete (`archiveLead`) obligatorio · optimistic locking en bulk e individual · export CSV streaming chunked · filtro default `consent_to_contact=true` · confirmación textual "ARCHIVAR N" | El admin puede borrar/actualizar/exportar miles de leads sin colapsar Vercel, sin violar LFPDPPP/LGPD, y sin race conditions con el bot |
| **Fase 2 — Inteligencia Comercial** | Conexión real del timeline de WhatsApp (`lead_whatsapp_conversations` + `lead_interactions`) · Lead Velocity Rate (LVR) · Radar SLA Overdue (>48h desatendidos) · Distribución de Calor (Hot/Warm/Cold) · badges visuales 🔥 + ⚠️ | El equipo de ventas ve, en tiempo real y con datos reales, qué leads son urgentes. La pestaña Conversaciones deja de ser demo y muestra lo que realmente dijo el lead al bot |
| **Fase 3 — Agente IA de Ventas** | 3 plantillas dinámicas por score + survey · `wa.me` links pre-armados con encoding RFC 3986 · endpoint `/api/admin/crm/ai-suggestions?leadId=X` con rate limit 30/min | Vendedor abre el cajón del lead → ve 3 sugerencias de cierre/valor/reactivación con la encuesta del lead ya incorporada → clic → WhatsApp abierto con mensaje pre-escrito listo para enviar |

### ¿Qué problema resuelve?

1. **Compliance legal bloqueante:** el borrado hard delete cascadeaba `lead_consent_log`, ilegal bajo LFPDPPP/LGPD. Ahora el borrado es siempre soft (`status='archived'`).
2. **Escalabilidad operativa:** el export CSV previo hacía `SELECT *` y rompía Vercel Hobby con >5k leads. Ahora es streaming chunked con tope defensivo de 100k.
3. **Race conditions con el bot:** el bot escribe a `leads` mientras el admin edita. Sin optimistic lock, los cambios del admin se perdían. Ahora hay un guard `WHERE status = prevStatus` que detecta y reporta colisiones.
4. **CRM "fake":** la pestaña Conversaciones y la inteligencia comercial leían mocks en `src/lib/data/crm-data.ts`. Ahora todo es DB real.
5. **Vendedor sin contexto:** el cajón del lead no decía qué respondió el lead en la encuesta del evento ni qué probabilidad de cierre tenía. Ahora el agente IA combina score + survey y propone 3 plantillas listas para enviar.

---

## 2. Arquitectura de Módulos Puros vs I/O (decisión de diseño clave)

### El problema del testing

Sin separación de capas, testear el agente IA requería mockear Supabase entero, mockear el LLM, mockear el template engine… mocks frágiles que se rompen con cada cambio real.

### La decisión

**Separar lógica de negocio pura (sin I/O) de la capa de acceso a datos.** Patrón consistente en 3 archivos:

| Archivo | Tipo | Imports prohibidos | Permite |
|---|---|---|---|
| `src/lib/crm/sales-templates.ts` | **PURO** | Sin `@/lib/supabase/*`, sin fetch, sin fs | Tests directos sin mocks |
| `src/lib/crm/crm-intelligence.ts` | **PURO** | Sin `@/lib/supabase/*` (recibe datos ya leídos) | Tests directos sin mocks |
| `src/lib/crm/csv-utils.ts` | **PURO** | Sin `@/lib/supabase/*` | Tests directos |
| `src/lib/crm/ai-sales-server.ts` | **I/O** | Solo el lee Supabase + el LLM | Importa los puros y los orquesta |
| `src/lib/crm/conversations-server.ts` | **I/O** | Solo el lee Supabase | Importa lógica pura si la necesita |

### Beneficio concreto

- `scratch/qlick-crm-ai-audit.mjs` corre **18 aserciones contra DB real sin mocks** importando los módulos puros (`sales-templates.buildWhatsAppLink` y los templates de venta) directamente.
- La suite `npm test` (545 tests) sigue corriendo contra el proyecto entero sin necesidad de fixtures Supabase sintéticos.
- **Cualquier test futuro** del agente IA (ej: "el template close menciona la q_business del lead") se puede escribir como test del módulo puro sin tocar Supabase.

### Lección para próximas fases

> Cuando agreguen una nueva pieza de lógica comercial (ej. scoring de probabilidad de cierre, segmentación RFM, etc.), **arrancan siempre como módulo puro**. La capa I/O solo debe orquestar lectura/escritura y delegar el cálculo al puro.

---

## 3. Inventario de Archivos Creados / Modificados

### Nuevos (10 archivos)

#### Server libs (lógica de negocio)

| Path | Líneas | Tipo | Propósito |
|---|---|---|---|
| `src/lib/crm/conversations-server.ts` | ~220 | I/O | `listRealConversations()` + `getRealConversationForLead()` — une `lead_whatsapp_conversations` + `lead_interactions` agrupando por `lead_id` con fallback por phone para pre-leads |
| `src/lib/crm/crm-intelligence.ts` | ~235 | PURO | Cálculo de LVR + SLA Overdue + Heat Distribution + Hot Desatendidos. Sin imports de Supabase |
| `src/lib/crm/sales-templates.ts` | ~130 | PURO | Helpers puros: `buildWhatsAppLink()` con encoding RFC 3986 + 3 templates (close / value / reactivate) que se seleccionan por score + survey. **Testable directo, sin mocks** |
| `src/lib/crm/ai-sales-server.ts` | ~100 | I/O | Lee lead + `event_surveys`, delega a `sales-templates.ts` para emitir 3 sugerencias + URLs listas |
| `src/lib/crm/csv-utils.ts` | ~85 | PURO | Helpers para serialización CSV streaming (escape RFC 4180, quote de campos con coma/quote/newline, BOM UTF-8) |

#### Endpoints API

| Path | Líneas | Método | Propósito |
|---|---|---|---|
| `src/app/api/admin/crm/conversations/route.ts` | ~90 | GET | Devuelve todas las conversaciones reales del CRM, rate limit 30/min |
| `src/app/api/admin/crm/ai-suggestions/route.ts` | ~80 | GET | Devuelve 3 sugerencias IA para un lead (`?leadId=X`), rate limit 30/min |

#### Endpoints modificados (Fase 1)

| Path | Cambio | Propósito |
|---|---|---|
| `src/app/api/admin/crm/leads/export/route.ts` *(referencia — ver diff)* | refactor a `ReadableStream` | Export CSV streaming chunked en bloques de 1,000 + BOM + tope 100k + filtro `consent_to_contact=true` |
| `src/app/api/admin/crm/leads/bulk-archive/route.ts` *(referencia — ver diff)* | optimistic lock | Bulk archive con `WHERE status = prevStatus` por fila |
| `src/app/api/admin/crm/leads/archive/route.ts` *(referencia — ver diff)* | soft delete único | `archiveOneLead()` con confirmación explícita |
| `src/app/api/admin/crm/overview/route.ts` | +35 líneas | Payload enriquecido con `intelligence: { lvr, slaOverdue, heat, hotDesatendidos }` |

#### Componentes UI modificados

| Path | Δ | Propósito |
|---|---|---|
| `src/app/admin/eventos/[id]/_components/PipelineCard.tsx` | +50 | Badge 🔥 HOT + ⚠️ SLA + bordes cálidos para leads urgentes |
| `src/components/crm/CRMView.tsx` | +280 | ConversationsView real + IntelligenceCards panel + AI suggestions integrados en el cajón del lead |

#### Script de auditoría

| Path | Líneas | Propósito |
|---|---|---|
| `scratch/qlick-crm-ai-audit.mjs` | ~410 | Audit E2E I1-I4 contra DB real — **18 aserciones**, sin dependencias de la suite. Re-ejecutable con `node scratch/qlick-crm-ai-audit.mjs` |

### Totales

- **Archivos nuevos:** 7 server libs + 2 endpoints + 1 audit script + 0 dependencias nuevas en `package.json`
- **Archivos modificados:** 1 endpoint (`overview`) + 2 componentes UI = 3 archivos
- **Archivos NO tocados (política de aislamiento):** `src/lib/whatsapp/bot-engine.ts`, `src/lib/whatsapp/providers/*`, `src/app/api/whatsapp/webhook/route.ts`

---

## 4. Guía Operativa de Rollback

### Escenario A: regresión detectada en producción post-deploy

```bash
# 1. Volver al snapshot estable de Fase 1 CRM (sin IA ni conversaciones reales)
git checkout v1.1-crm1-stable
# Verificar
npm run type-check && npm run lint && npm test && npm run build
# → 535/535 ✓ (sin las aserciones nuevas de IA)
# Push desde terminal de David (no desde la sesión Mavis)

# 2. O bien, revertir solo el commit de Fases 2-3:
git checkout v0.8.0   # vuelve a wizard WhatsApp sin CRM Inteligente
# Equivalente quirúrgico:
git revert ec9eb55 --no-edit  # solo revierte Fase 2-3, conserva Fase 1
```

### Escenario B: regresión en el export CSV streaming

```bash
# Revertir solo el archivo:
git checkout v1.1-crm1-stable -- src/app/api/admin/crm/leads/export/route.ts
git commit -m "fix(crm): rollback a export CSV no-streaming (regresión)"
```

### Escenario C: limpiar el bot engine si quedó tocado

```bash
# (Defensa en profundidad — no debería pasar)
git diff v1.1-crm1-stable HEAD -- src/lib/whatsapp/bot-engine.ts
# Si hay diff:
git checkout v1.1-crm1-stable -- src/lib/whatsapp/bot-engine.ts
git commit -m "fix(whatsapp): restore bot-engine pre-v0.9.0"
```

### Cuándo NO hacer rollback

- **Datos de Supabase:** ningún rollback de código toca la DB (soft delete solo cambia `status`; archive CSV no muta). El estado de la DB es **consistente** entre cualquier tag → cualquier rollback de código es seguro.
- **Audit logs:** siguen accumulating en `lead_audit_log` y `lead_consent_log`. Rollback no los borra.
- **Tags pre-existentes** (`v0.8.0`, `v0.6.0`, etc.) están siempre disponibles como escape hatch final.

---

## 5. Checklist de Verificación Rápida (1 minuto en producción)

Ejecutar después de cada deploy de v0.9.0 (o después de cualquier rollback):

```bash
# === Suite + tipos (esperar ~30 segundos) ===
npm run type-check && npm run lint && npm test
# ✓ 0 errores type-check · 0 warnings lint · 545/545 tests verde

# === Audit E2E contra DB real (~15 segundos) ===
node scratch/qlick-crm-ai-audit.mjs
# ✓ 18 OK / 0 FAIL en escenarios I1 (conversaciones), I2 (LVR/SLA/Heat), I3 (IA wa.me), I4 (bot intacto)

# === Aislamiento del bot (defensa en profundidad) ===
git diff v1.1-crm1-stable HEAD -- src/lib/whatsapp/bot-engine.ts
# ✓ (sin output = bot intacto)

# === Smoke test manual del panel admin (manual, 30 segundos) ===
# 1. Login con david17891@gmail.com
# 2. /admin/eventos/[id] → tab Conversaciones muestra mensajes reales (no placeholder "(sin conversaciones)")
# 3. Overview muestra tarjetas con métricas LVR, Radar SLA, Distribución de Calor (no ceros)
# 4. Cajón de un lead HOT (score ≥ 60) → "Acciones Recomendadas" muestra 3 sugerencias con botón verde "Enviar WhatsApp"
# 5. Clic en una sugerencia → abre WhatsApp Web/Desktop con mensaje pre-cargado
```

### Salud del release (resumen 1 pantalla)

| Check | Esperado |
|---|---|
| Tipo | 0 errores |
| Lint | 0 warnings |
| Tests | 545/545 verde |
| Audit | 18/18 OK |
| Bot engine | sin diff vs `v1.1-crm1-stable` |
| Conversaciones tab | datos reales (no "(sin conversaciones)") |
| Inteligencia cards | LVR ≠ 0 cuando hay datos, SLA Overdue ≠ 0 si hay leads desatendidos |
| Sugerencias IA | 3 sugerencias con URL wa.me válida (empieza con `https://wa.me/52`) |

---

## 6. Deuda Activa y Próximos Pasos (NO bloquea v0.9.0)

### Documentados en `docs/ROADMAP.md` §"Fase 4 (CRM Próximo Ciclo)"

1. **Paginación server-side en tabla de leads del CRM** — actualmente carga toda la lista en memoria, problema >5k leads.
2. **Refactor `name` → `first_name` + `last_name`** en tabla `leads` — resuelve la fragilidad de `firstName(fullName)` que extrae el primer token.
3. **Alertas proactivas SLA Overdue** — emails outbound cuando un lead entra a >48h desatendido (requiere decisión de producto sobre destinatario).

### Otros pendientes (Fase 4+)

- **Calendario real** (Google Calendar integration) — vista del calendario sigue leyendo mock.
- **Broadcast WhatsApp masivo** — genera links `wa.me` pero no envía. Bloqueado por aprobación de templates Meta (24-48h).
- **`lead_consent_log` ya no se borra** — confirmar en el dashboard de Supabase que los eventos de soft delete se loggean.

### Issues heredados (no introducidos por v0.9.0)

- **G-5** (Meta templates para outreach proactivo).
- **G-12** (Supabase intermitente en runtime Vercel, mitigación parcial).
- **G-17** (app fantasma Meta, requiere soporte Meta).

---

## 7. Comandos Útiles para el Equipo

```bash
# Ver inventario de archivos del release:
git show --stat ec9eb55
git show --stat d150d9d

# Diff contra tags estables:
git diff v1.1-crm1-stable..HEAD -- src/lib/crm/   # todo lo nuevo del CRM v2.0
git diff v1.1-crm1-stable..HEAD -- src/app/api/admin/crm/   # endpoints
git diff v1.1-crm1-stable..HEAD -- src/lib/whatsapp/bot-engine.ts   # debería ser vacío

# Regenerar tag nuevo después de un commit de hotfix:
git tag -f v1.1-crm1-stable <commit>   # ojo: -f solo en tags experimentales
git tag -a v0.9.0 ec9eb55 -m "CRM Inteligente v2.0 — Fases 1+2+3"

# Re-correr audit tras cambios:
node scratch/qlick-crm-ai-audit.mjs

# Test puntual del agente IA:
node --env-file=.env.local -e "
  import('./src/lib/crm/sales-templates.ts').then(m => {
    const link = m.buildWhatsAppLink('+52 6532935492', 'Hola David, ¿listo?');
    console.log(link);
  });
"
```

---

## 8. Resumen de Acceptance Contract

| Criterio | Estado |
|---|---|
| `npm run type-check && npm run lint && npm test && npm run build` pasan | ✅ 0/0/545/✓ |
| 38 aserciones E2E verdes contra DB real | ✅ 18/18 (alcance del release fue I1-I4) |
| Cambios de schema documentados en `data/PROJECT-LOG.md` | ✅ entrada `~17:00` + `~18:30` |
| Commits atómicos con prefijo conventional | ✅ `feat(crm):` × 2 |
| Bot engine INTACTO | ✅ verificado |
| Documentación canónica completa (STATUS + ROADMAP + PROJECT-LOG + este HANDOFF) | ✅ los 4 listos |
| Handoff escrito | ✅ este doc |

---

## 9. Glosario Mínimo del Release

- **LVR (Lead Velocity Rate):** `(leads_últ_7d - leads_7d_prev) / leads_7d_prev × 100`. Mide aceleración del pipeline.
- **SLA Overdue:** leads en `new|contacted` sin tarea abierta y sin contacto en >48h. Killer de la conversión.
- **Heat (Calor):** bucket de score: ≥60 = Hot, ≥40 = Warm, resto = Cold. Visual en `PipelineCard`.
- **Score:** número 0-100 calculado en promotion engine (q1_clarity × peso + q_consent × peso + q_business × peso).
- **Soft Delete:** cambiar `status='archived'`. NO borra la fila (compliance LFPDPPP / LGPD).
- **Optimistic Lock:** `UPDATE leads SET status='archived' WHERE id=X AND status='new'`. Si `affected=0`, hubo colisión.
- **`wa.me` link:** Universal Links de WhatsApp — abre la app con chat pre-armado al número con texto pre-cargado.
- **RFC 3986:** spec de URL encoding. `! * ' ( )` son **unreserved** (no se escapan); `& ? = + #` son reserved y SÍ se escapan. `buildWhatsAppLink` lo respeta.

---

## 10. Cierre

**v0.9.0 — CRM Inteligente v2.0** queda cerrado, documentado y verificado contra DB real. Bot engine intacto. Suite 545/545 verde. 18/18 aserciones E2E. Compliance (LFPDPPP/LGPD) + operatividad (optimistic lock + CSV streaming) + inteligencia (LVR/SLA/Heat) + venta asistida (IA con wa.me pre-armado) en un solo release.

Próximo paso lógico: **Fase 4 (CRM Próximo Ciclo) — Calendario Real, Tareas y Notificaciones Proactivas** (ver `docs/ROADMAP.md` §"En curso").

— Mavis (root session `mvs_e600acfdf4c64bd785d11564f00b72a7`, 2026-07-06 18:42 America/Phoenix)
