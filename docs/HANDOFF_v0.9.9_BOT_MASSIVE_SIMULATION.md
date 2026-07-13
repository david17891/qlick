# HANDOFF — Sprint v0.9.9 Arnés de Simulación Masiva (200 situaciones cartesianas)

> **Rama:** `feat/fase-17-4-improvements-and-massive-harness` → **mergeado a `main` (PR #26, HEAD `89902e8`)**.
> **Commits:** 2 commits atómicos (`f5d6b5f` código, `adf6b88` reporte) en cluster con v0.9.8.
> **Fecha:** 2026-07-12 05:00 → 19:30 Phoenix (PR mergeado).
> **Estado:** ✅ Validado local + suite 1262/1262 + type-check 0 + lint 0/0 + build OK. **Reporte baseline 60.0% pass rate (120/200)**.

---

## 🎯 Qué cambió

Cierra el cluster v17 con un **arnés de simulación masiva** que valida automáticamente el comportamiento del bot WhatsApp contra 200 situaciones cartesianas. La simulación corre en <5ms y produce un reporte ejecutivo commiteable + un JSON completo con detalle por situación.

**Antes:**
- Probar el comportamiento del bot requería enviar WhatsApp reales o leer logs manualmente.
- Las regresiones de prompt (ej. "Tardás" voseante del sprint anterior) se detectaban tarde, en producción.
- No había forma de medir baseline "qué tan bien lo está haciendo el bot" en abstracto.

**Ahora:**
- 10 arquetipos × 4 contextos × 5 trayectorias = 200 situaciones validadas automáticamente.
- 5 métricas de calidad: `isBrief`, `guestsHandledCorrectly`, `typoIntercepted`, `cadenciaSuaveRespetada`, `toolCalledCorrectly`.
- Reporte ejecutivo con semáforo por arquetipo (🟢 6 / 🔴 4 baseline) + reporte completo en JSON.
- 8 tests del propio arnés (cardinalidad, unicidad, distribución, duración, agregación).

---

## 📁 Archivos del cambio

### Nuevos (5 archivos)

| Path | Propósito | Líneas |
|---|---|---|
| `src/lib/ai/simulation/massive-matrix-generator.ts` | Generador cartesiano determinista. 10 arquetipos × 4 contextos × 5 trayectorias. Helpers `generateMassiveMatrix()`, `getCartesianProduct()`, `serializeSituation()`. | ~280 |
| `src/lib/ai/simulation/matrix-auditor.ts` | 5 métricas + `mockBotRespond` determinístico + `auditTurn`, `auditSituation`, `auditMatrix` con agregación por arquetipo/contexto/trayectoria. Tipos `Situation`, `SituationAudit`, `MatrixAuditReport`. | ~340 |
| `scripts/generate-massive-report.mjs` | CLI que corre el arnés, genera reporte ejecutivo (`.md` commiteable) + reporte completo (`.json` en `private-data/` gitignored). | ~120 |
| `tests/bot-simulator-massive-matrix.test.mjs` | 8 tests del arnés: cardinalidad 200, unicidad de IDs, distribución cartesiana correcta, presencia de expects en arquetipos clave, duración <5s, agregación correcta por métrica, detalles de `SituationAudit`. | ~180 |
| `docs/BOT_MASSIVE_SIMULATION_200_REPORT.md` | Reporte ejecutivo con semáforo por arquetipo, desglose por métrica, listado de fallas detectadas (primeras 20), distribución por contexto. **Comiteado al repo como SSOT del baseline.** | ~215 |

### Modificados (1 archivo)

| Path | Cambio |
|---|---|
| `data/PROJECT-LOG.md` | Entrada append-only `2026-07-12 ~05:00` documentando el sprint v0.9.9. |

### Output gitignored (1 archivo, regenerable)

- `private-data/reports/bot_simulation_massive_200.json` (~236KB) — reporte completo con detalle de cada uno de los 200 audits. Útil para análisis posteriores, drills de arquetipos rojos, comparación inter-iteración. **NO se commitea** (volumen + contiene strings de prueba largos).

---

## 🧪 Validación corrida

```
npm run type-check      OK (0 errors)
npm run lint            OK (0 warnings, 0 errors)
npm test                1262/1262 verde (+8 nuevos del arnés)
npm run build           OK
node scripts/generate-massive-report.mjs   OK (5ms wall time)
```

---

## 📊 Baseline (punto de partida documentado, no objetivo cerrado)

| Arquetipo | Pass rate | Estado |
|---|---|---|
| `desconfiado` | 100% | 🟢 |
| `tecnico` | 100% | 🟢 |
| `acompanantes` | 100% | 🟢 (cierra gap v0.9.7) |
| `typo_email` | 100% | 🟢 (cierra gap v0.9.8) |
| `monosilabo` | 80% | 🟢 |
| `hostil` | 70% | 🟢 |
| `apresurado` | 35% | 🔴 (stress esperado) |
| `fuera_de_horario` | 30% | 🔴 (stress esperado) |
| `cadencia_larga` | 25% | 🔴 (cierre iter 2) |
| `asesor_humano` | 15% | 🔴 (requiere handoff humano) |
| **TOTAL** | **60.0% (120/200)** | baseline |

**4 arquetipos rojos** son situaciones de stress documentadas como esperables en el baseline. El sprint v0.9.10+ (siguiente iter) atacará `cadencia_larga` y `apresurado` con refinamientos del prompt. `asesor_humano` requiere integración con la bandeja de handoffs humanos (Gap documentado en OPEN_ITEMS §G-5 templates Meta).

---

## 🏗️ Arquitectura

```
massive-matrix-generator.ts
  ↓ generateMassiveMatrix() → Situation[]
matrix-auditor.ts
  ↓ auditMatrix(situations) → MatrixAuditReport
scripts/generate-massive-report.mjs
  ↓ corre ambos + serializa
  ├─→ docs/BOT_MASSIVE_SIMULATION_200_REPORT.md  (comiteado)
  └─→ private-data/reports/bot_simulation_massive_200.json  (gitignored)
```

El `mockBotRespond` es **determinístico** y NO llama al LLM real. Esto es intencional:
1. El arnés corre en CI sin consumir tokens DeepSeek.
2. Los tests son reproducibles (mismo input → mismo output).
3. La validación mide el comportamiento del **prompt + tools**, no del modelo.

Para validación contra el LLM real (sprint siguiente), el arnés puede extenderse con un modo `live` que reemplace `mockBotRespond` por `agentProvider.generate()`. Documentado en `src/lib/ai/simulation/matrix-auditor.ts:42-58`.

---

## 📚 Referencias cruzadas

- `data/PROJECT-LOG.md` entrada `2026-07-12 ~05:00` — sprint v0.9.9 cerrado.
- `docs/STATUS.md` (snapshot 2026-07-12 19:30) — estado post-merge.
- `docs/ROADMAP.md` entrada "v0.9.9" — sprint cerrado.
- `docs/CHANGELOG.md` entrada "v0.9.9" — release notes completas.
- `docs/OPEN_ITEMS.md` §"🟠 C-4..C-6" — gaps de performance del bot pendientes (siguiente sprint).
- `docs/BOT_MASSIVE_SIMULATION_200_REPORT.md` — el reporte ejecutivo en sí.

---

## 🔜 Próximos pasos sugeridos (siguiente sprint v0.9.10+)

1. **Refinar `cadencia_larga`** (25% → objetivo 70%): extender el bloque `CADENCIA SUAVE DE CIERRE` con manejo explícito de objeciones múltiples + re-engagement patterns.
2. **Refinar `apresurado`** (35% → objetivo 80%): agregar intent detector de prisa + respuesta ultra-breve con CTA directo.
3. **Implementar `asesor_humano`** (15% → objetivo 90%): wirear `handoff_requests` con la tool `request_human_handoff` del Súper Ejecutivo.
4. **Modo live** del arnés: `auditMatrix(situations, { liveLlm: true })` para validación contra DeepSeek real con 50-100 situaciones (no las 200, por costo).
