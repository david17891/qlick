# Auditoría — Fase 6 Hitos A, B, C

**Fecha:** 2026-06-28
**Auditor:** Mavis (actuando como analista senior)
**Scope:** `scripts/seed-demo.mjs` + `src/app/login/**` + `src/components/ui/Tooltip.tsx` + `src/app/admin/eventos/page.tsx` + `src/app/admin/system/audit-log/page.tsx` + `src/lib/crm/audit-server.ts`

> **Estado post-fixes (2026-06-28 ~18:20):** los **4 críticos** ya están aplicados
> en el working tree de `feat/fase-6-hitos`. Esta versión del doc conserva el
> análisis original como referencia, pero marca cada fix con `[✅ FIX v0.12.0]`
> y remite al commit correspondiente.

## Resumen ejecutivo

| Severidad | Total | Aplicados | Pendientes |
|---|---|---|---|
| 🔴 Crítico | 4 | **4 ✅** | 0 |
| 🟡 Medio | 11 | **3 ✅** (M-5, M-7, M-8) | 8 |
| 🟠 Bajo | 8 | 0 | 8 (nice-to-have) |
| ✅ Bien | 8 | — | — |

**Veredicto post-fix:** los 4 bloqueantes para la demo a socios están resueltos.
Score general sube de 7.5/10 → **8.5/10**. El resto puede esperar a feedback
post-demo o priorizarse según impacto real.

### Issues críticos (todos resueltos)

1. ✅ **C-1 Audit log se acumula** — fix con `existingAuditEntries` antes del INSERT
2. ✅ **C-2 WhatsApp log no idempotente** — fix con `existingWhatsapp` antes del INSERT
3. ✅ **C-3 Búsqueda libre `q` mentía en docs** — fix con docstring honesto
4. ✅ **C-4 `entityId.slice(0, 8)` rompe con null** — fix con null check en render

---

## 🔴 Críticos — ✅ TODOS APLICADOS

### C-1. Audit log NO es idempotente — ✅ FIX v0.12.0

**Archivo:** `scripts/seed-demo.mjs:833-844`

**Problema original:** Cada ejecución del seed insertaba 25 nuevas entries en
`admin_audit_log` sin verificar si ya existían.

**Stress test confirmó (antes del fix):**
```
Antes de run 1: 75 entries
Run 1: +25 → 100
Run 2: +25 → 125
Run 3: +25 → 150
```

**Fix aplicado:** check `existingAuditEntries` antes del INSERT usando el
`seed_tag` que ya se guardaba en metadata:
```js
const { count: existingAuditEntries } = await supabase
  .from("admin_audit_log")
  .select("*", { count: "exact", head: true })
  .contains("metadata", { seed_tag: SEED_TAG_AUDIT });
if (existingAuditEntries && existingAuditEntries > 0) {
  console.log(`   ⏭️  Audit log: ${existingAuditEntries} entries del seed ya existen (skip)`);
} else {
  // ...insert 25 entries...
}
```

**Validación:** stress test post-fix debe mostrar 75 → 75 → 75 en 3 runs.

---

### C-2. Lead WhatsApp log sin idempotencia — ✅ FIX v0.12.0

**Archivo:** `scripts/seed-demo.mjs:786-793`

**Problema original:** Cuando se aplicara `20260628000000_whatsapp_followup.sql`,
el seed iba a empezar a insertar entries en `lead_whatsapp_log` sin idempotencia.

**Fix aplicado:** idéntico patrón a C-1, check `existingWhatsapp` antes del INSERT:
```js
const { count: existingWhatsapp } = await supabase
  .from("lead_whatsapp_log")
  .select("*", { count: "exact", head: true })
  .contains("metadata", { seed_tag: SEED_TAG });
if (existingWhatsapp && existingWhatsapp > 0) {
  console.log(`   ⏭️  WhatsApp log: ${existingWhatsapp} entries del seed ya existen (skip)`);
} else {
  // ...insert 20 entries...
}
```

**Severidad real:** Era preventivo. Ahora cerrado.

---

### C-3. Búsqueda libre `q` miente en docs — ✅ FIX v0.12.0

**Archivos:** `src/lib/crm/audit-server.ts:88-100` + `src/app/admin/system/audit-log/page.tsx:48, 71, 125-141, 217, 229`

**Problema original:** El JSDoc de `ListAuditLogsInput.q` decía que buscaba en
`metadata::text` pero el código no lo hacía. Doc mentirosa → confusion bug.

**Fix aplicado (opción A — honest doc):**
1. Docstring actualizado y explícito: "NO busca en `metadata` (jsonb). Si necesitás
   buscar en metadata, usá el filtro `actorEmail` + `entityType` + scroll manual."
2. Caracteres especiales `%` y `_` se escapan para evitar wildcards SQL LIKE
   no intencionados (`q.replace(/[%_]/g, "\\$&")`).
3. UI agregada: input `Búsqueda libre` en el form de filtros del audit log, con
   placeholder `"lead, david@, event_clone…"`.

**Búsqueda en metadata** queda como follow-up (opción B del original).

---

### C-4. `entityId.slice(0, 8)` rompe si entityId es null — ✅ FIX v0.12.0

**Archivo:** `src/app/admin/system/audit-log/page.tsx:290` (ahora ~línea 290)

**Problema original:** `entry.entityId.slice(0, 8)` lanzaba TypeError si era null.

**Fix aplicado:**
```diff
- {entry.entityId.slice(0, 8)}…
+ {entry.entityId ? `${entry.entityId.slice(0, 8)}…` : "—"}
```

1 línea. Riesgo de 500 en producción eliminado.

---

## 🟡 Medios (mejorables, no bloquean)

### M-1. `pickOne(arr, i)` no es random

**Archivo:** `scripts/seed-demo.mjs:301-303`

`pickOne(arr, i) → arr[i % arr.length]` siempre devuelve el mismo elemento
para el mismo `i`. Todos los leads rotan por los mismos `COURSE_INTERESTS`.
Resultado: si todos los leads tienen `i % 4 === 0`, todos estudian
"Ads en Meta, embudos".

**Fix:** Usar `crypto.randomInt` o un seeded PRNG si queremos determinismo:
```js
import { randomInt } from "node:crypto";
function pickOne(arr, seed) {
  return arr[randomInt(0, arr.length)];
}
```

**Severidad:** Cosmético — la variedad es suficiente para demo pero no es realmente random.

---

### M-2. `sort(() => 0.5 - Math.sin(evIdx))` no es random

**Archivo:** `scripts/seed-demo.mjs:432`

`Math.sin(evIdx)` es determinístico para el mismo `evIdx`. El "shuffle" siempre
produce el mismo orden. Los asistentes matcheados son siempre los mismos confirmados.

**Fix:** Igual a M-1 — usar crypto.randomInt o un PRNG.

**Severidad:** Cosmético, mismo impacto.

---

### M-3. Schema detection con tabla vacía

**Archivo:** `scripts/seed-demo.mjs:94-107, 119-129`

`detectSchema` usa `select * limit(1)` para inferir columnas. Si la tabla
está vacía pero existe, devuelve `[]` y entra al fallback hardcoded (que puede
no coincidir con columnas reales que aún no se han aplicado).

**Probabilidad:** Baja (las tablas tienen data), pero posible en fresh DB.

**Fix:** Usar `information_schema.columns` en vez de inferir desde data:
```js
const { data } = await supabase.rpc("get_table_columns", { table_name: "leads" });
```

Requiere una RPC. Más simple: probar un INSERT de prueba con `select()`.

**Severidad:** Edge case.

---

### M-4. `existingSeedLeads` se carga dos veces

**Archivo:** `scripts/seed-demo.mjs:598 y 697`

Dos queries idénticas a `leads` con filtro `tags contains [SEED_TAG_LEAD]`.
La segunda carga datos que ya tenemos.

**Fix:** Mover la query antes de ambos usos y reutilizar.

**Severidad:** Performance menor.

---

### M-5. Tooltip sin `aria-describedby` — ✅ FIX v0.12.0

**Archivo:** `src/components/ui/Tooltip.tsx`

**Problema original:** docstring mencionaba `aria-describedby` pero el código no lo implementaba.

**Fix aplicado:**
```jsx
const tooltipId = useId(); // useId garantiza id estable por instancia (SSR-safe)
// ...
<span aria-describedby={tooltipId} role="img" tabIndex={0}>?</span>
<span id={tooltipId} role="tooltip" className="...">{text}</span>
```

Además: `title` como fallback nativo + delay 200ms en focus para no spammear
screen readers + soporte para `align="end"` cuando el ícono está cerca del
borde derecho del viewport.

**Severidad:** Accesibilidad mejorada.

---

### M-6. Tooltip sin viewport collision detection — ⏳ Pendiente

**Archivo:** `src/components/ui/Tooltip.tsx`

Sigue pendiente. Se agregó la prop `align="end"` como workaround manual para
el caso típico del borde derecho, pero la detección automática de viewport
queda como follow-up (requiere Floating UI o similar).

**Severidad:** Visual en mobile.

---

### M-7. Conversion global distorsionada — ✅ FIX v0.12.0

**Archivo:** `src/app/admin/eventos/page.tsx:33-65`

**Problema original:** Conversion usaba totales globales, inflada hacia abajo
por eventos próximos sin leads promovidos.

**Fix aplicado:** conversion se calcula solo sobre eventos PASADOS:
```js
const pastEventSummaries = summaries.filter(
  (s) => s.event.startsAt && new Date(s.event.startsAt) < now,
);
const pastConfirmations = pastEventSummaries.reduce(...);
const pastLeadsPromoted = pastEventSummaries.reduce(...);
const globalConversion = pastConfirmations > 0
  ? Math.round((pastLeadsPromoted / pastConfirmations) * 100)
  : null;
```

Si no hay eventos pasados, la stat muestra `—` en vez de `0%`.

**Severidad:** UX corregida.

---

### M-8. MagicLinkForm state se pierde al cambiar modo — ✅ FIX v0.12.0

**Archivo:** `src/app/login/StudentLoginCard.tsx`

**Problema original:** toggle entre "google" y "magic" desmontaba MagicLinkForm
y se perdía el state `sent`.

**Fix aplicado:** el `StudentLoginCard` siempre monta ambos forms (con
`hidden={mode !== ...}` para visibilidad). El state interno del MagicLinkForm
(email, sent) se preserva entre toggles.

**Severidad:** UX mejorada.

---

### M-9. Audit log sin truncation en DiffView — ⏳ Pendiente

**Archivo:** `src/app/admin/system/audit-log/page.tsx`

Sigue pendiente. Con audit entries típicas (5-10 keys en metadata) no se nota,
pero entries con payloads grandes pueden inflar la fila.

**Severidad:** UX.

---

### M-10. Búsqueda libre con caracteres especiales

**Archivo:** `src/lib/crm/audit-server.ts:149-165`

El escape `\ % _` se pasa a `.or()` de Supabase, pero el formato de Supabase
postgrest puede interpretar wildcards diferentes. Si alguien busca `"50%"`,
el `%` se interpreta como wildcard SQL LIKE y puede dar resultados inesperados.

**Fix:** Usar `eq` en vez de `ilike` cuando el input no tiene wildcards, o
sanitizar más agresivamente.

**Severidad:** Edge case de búsqueda.

---

### M-11. `events.upsert` sobrescribe cambios manuales

**Archivo:** `scripts/seed-demo.mjs:371-374`

```js
.upsert(eventRows, { onConflict: "slug", ignoreDuplicates: false })
```

`ignoreDuplicates: false` significa que si David modificó el título de un
evento del seed, al re-correr se sobrescribe. Puede ser deseado o no.

**Fix:** Si se quiere preservar cambios manuales, usar `ignoreDuplicates: true`
o agregar lógica de "merge". Para un seed, sobrescribir es probablemente lo
deseado, pero documentarlo.

**Severidad:** Documentación.

---

## 🟠 Bajos (nice-to-have)

### L-1. Console.log con emojis

El script usa emojis para feedback (`✓`, `⚠️`, `🧹`, etc.). Consistente con el
resto del codebase pero puede romperse en terminales que no soportan Unicode.

**Severidad:** Cosmético.

---

### L-2. Sin timeout en queries del seed

Si la DB está lenta, el script puede colgar indefinidamente. No hay timeout
configurado en el cliente Supabase.

**Severidad:** Edge case operacional.

---

### L-3. Audit log sin index en `metadata->>seed_tag`

Para buscar entradas del seed, hacemos `.contains("metadata", { seed_tag: ... })`
que es un scan completo. Con 1000+ audit entries se vuelve lento.

**Fix:** Agregar índice GIN en `metadata` o un índice específico en
`(metadata->>'seed_tag')`.

**Severidad:** Performance, solo cuando crece la tabla.

---

### L-4. `emailFromName` no maneja caracteres especiales múltiples

**Archivo:** `scripts/seed-demo.mjs:309-316`

```js
const slug = name
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, ".");
```

Para "José María" produce `jose.maria` (correcto). Pero "María José" produce
`maria.jose` que colisiona con otro lead. No hay sufijo de disambiguation.

**Fix:** Incluir el índice `i` en el slug (ya está: `.${i}`) pero también
considerar iniciales para casos como dos leads con mismo nombre.

**Severidad:** Solo si nombres coinciden.

---

### L-5. Schema detection hace 3 queries adicionales

`detectSchema` hace 3 queries (`leads`, `lead_whatsapp_log`, `admin_audit_log`).
Cada `seed-demo.mjs` corre gasta 3 queries extra antes del seed principal.

**Severidad:** Performance menor.

---

### L-6. Sin `loading.tsx` para `/admin/eventos`

Si `getAdminEvents()` tarda (muchos eventos), no hay loading state visible.
El usuario ve un flash de "Cargando..." o nada.

**Severidad:** UX.

---

### L-7. Tooltip aparece instantáneamente en focus de teclado

**Archivo:** `src/components/ui/Tooltip.tsx:50`

`group-focus-within:visible` muestra el tooltip inmediatamente al hacer Tab.
Algunos usuarios con screen readers encuentran esto molesto.

**Fix:** Agregar un pequeño delay (`transition-delay`) o trigger solo con hover,
no con focus.

**Severidad:** Accesibilidad menor.

---

### L-8. Cleanup sin transacciones

Si el cleanup falla a mitad de camino (ej. borra leads pero no sus links),
queda data inconsistente. No hay rollback.

**Fix:** Usar transacciones de Postgres (`supabase.rpc("cleanup_seed_data")`).
Requiere una RPC que ejecute las queries en una transacción.

**Severidad:** Operacional, solo en errores parciales.

---

## ✅ Aspectos bien logrados

1. **Privacy-first en seed**: emails usan dominios sintéticos, teléfonos formato
   plausible pero inventados, nombres ficticios. Documentado en el header.

2. **Idempotencia parcial del seed**: confirmations, attendees, surveys, leads
   son idempotentes correctamente (select-then-insert robusto).

3. **Detección dinámica de schema**: el seed se adapta a 3 migrations no
   aplicadas. Ningún error fatal.

4. **Login UI accessible first paint**: el primer render es OAuth prominente,
   fallback magic link colapsado. Cumple la regla "1 click default".

5. **Stats globales con tooltips**: cada stat tiene contexto. Mejora
   significativamente la comprensión vs números solos.

6. **URL-driven filters en audit log**: preservables, shareables, no JS.
   Patrón consistente con `/admin/eventos/[id]`.

7. **`logAdminAction` best-effort**: si falla el audit, no rompe la operación
   principal. Documentado y correcto.

8. **Service role separation**: `seed-demo.mjs` usa `SUPABASE_SECRET_KEY`
   explícitamente, no la anon key. Defensive.

---

## Priorización de fixes

### Must fix antes de demo a socios — ✅ TODOS APLICADOS

1. ✅ **C-4** — `entityId.slice(0, 8)` rompe con null (1 línea)
2. ✅ **C-1** — Audit log idempotencia (5 líneas)
3. ✅ **C-3** — Doc honesto de `q` + UI agregada (~30 líneas)
4. ✅ **M-7** — Conversion rate solo sobre eventos pasados (5 líneas)

**Total estimado original: ~30 minutos** — confirmado, todos aplicados en este sprint.

### Should fix esta semana — 3 de 4 aplicados

5. ✅ **C-2** — WhatsApp log idempotencia (preventivo)
6. ✅ **M-5** — `aria-describedby` en Tooltip (accesibilidad)
7. ✅ **M-8** — Estado cross-mode en StudentLoginCard
8. ⏳ **M-9** — Truncation en DiffView (UX, no bloquea demo)

### Nice to have después de deploy

- M-1, M-2 (real randomness con crypto.randomInt)
- M-6 (viewport collision detection para Tooltip)
- M-10 (búsqueda libre con wildcards explícitos)
- M-11 (decisión sobre `events.upsert` y cambios manuales)
- L-* (cosmetic)

---

## Recomendación final (post-fix)

El código está en buen estado para una demo a socios. Los 4 issues críticos
que bloqueaban la presentación están todos resueltos, junto con 3 fixes de
accesibilidad/UX. El resto (8 medios + 8 bajos) puede esperar a feedback
post-demo.

### Score

| Antes | Después |
|---|---|
| 7.5/10 | **8.5/10** |

**Cierre:** 4 críticos + M-5 + M-7 + M-8 aplicados = 7 fixes / 23 issues totales
del audit. Eficacia ~30%. Suficiente para desbloquear la demo, pero queda
backlog explícito para siguientes iteraciones (M-1, M-2, M-6, M-9, M-10, M-11, L-*).