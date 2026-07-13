# HANDOFF — Sprint v0.9.5 Torre de Control Bot v16 (Torre de Control + Radar de Costos + Conversations Tab)

> **Rama base:** `main` (HEAD `0ccdabc` post-merge de PR #20)
> **Versión:** v0.9.5 (siguiente después de v0.9.4 CI verde + GitHub Secrets)
> **Fecha de cierre:** 2026-07-12 02:03 Phoenix
> **PRs mergeados:** 6 (PR #14, #16, #17, #18, #19, #20) — todos a `main` con `--merge --delete-branch`
> **Commits de cierre:** `0ccdabc` (merge PR #20) + `ea5255a` (docs) + `1b1d954` (frontend hotfix #3) + `5073496` (backend hotfix #3) sobre el cierre de los 5 PRs anteriores
> **Deploy:** Vercel auto-deploy disparado en cada merge (último: run `29186675027`, 54s)
> **Estado:** ✅ Validado local + CI verde. Listo para pilotaje real en producción con el bot corriendo.

---

## 🎯 Qué cambió

Cierra la **Torre de Control del Bot de WhatsApp** que David venía pidiendo desde la v0.9.0 (CRM Inteligente): un panel admin único donde se controla el modo del bot, las reglas de oro, los bloques de contexto, los kills-switches de costo y el buzón de conversaciones. Es el primer sprint que pone al admin en control operativo del bot sin tocar código ni redeploy.

**Sprint organizado en 3 tracks + 3 hotfixes:**

### Track 1 — Torre de Control Base (PRs base previos a v16, ya en `main`)
- **Torre de Control v15 PR #1** (`6773c89`): UI inicial con selector de modos, 6 bloques de contexto, tabla CRUD de Reglas de Oro, métricas en vivo. Base de todo el sprint.
- **Súper Ejecutivo v15 PR #2** (`484d0ea`): agente comercial proactivo con system prompt dedicado, Directiva UX Hook y escalación semántica. Activa cuando `bot_global_mode === 'super_executive'` en `system_settings`.

### Track 2 — Sprint v16 features (PRs #14, #16, #18, #20)
- **PR #1 — Conversations Tab (PR #14)**: buzón nivel 1 con orden natural humano, soft-delete transaccional, matriz de pausa global/lead, realtime Supabase. `feat(conversations)`.
- **PR #2 — Radar de Costos + Kill-Switch + Matriz (PR #16)**: tarjetas de tokens/costo DeepSeek, cupo Meta rolling 30d, kill-switch de tope diario (default 50/día en pruebas), switch maestro "Pausar Bot para Todos". `feat(bot)`.
- **PR #3 — Hotfix UI** (PR #17): scroll instantáneo al lead, badge "Nuevo" pegado al borde, nombres visibles en conversaciones, modo súper ejecutivo desbloqueado. `fix(ui)`.
- **PR #4 — Code Review** (PR #18): 4 ROJO + 6 AMARILLO cerrados. `safeFetch` helper (AbortController + 2xx + isMountedRef), allowlist en `/api/admin/system-setting` (4 keys operativas), caché 60s módulo-level en `bot-engine.ts`, rolling 24h en `bot_daily_outbound_count` (cerró bug zona horaria Phoenix UTC-7). `fix(bot)`.
- **PR #5 — Hotfix UI #2** (PR #19): 4 ajustes UI/UX. isUnread robusto en `ConversationsTab` (revisa TODA la lista, no solo el último), Guía Rápida de Reglas de Oro en `<details open>`, distinción visual de `ModeTarjeta` activo/inactivo (border emerald + badge "🟢 MODO ACTUALMENTE EN OPERACIÓN"), botón "⚡ Subir a 500" en Tope Diario para sesiones de prueba intensivas. `fix(ui)`.
- **PR #6 — Hotfix #3** (PR #20): persistencia real de `onSelectMode` en `system_settings` (antes solo cambiaba estado local) + anti-flicker de carga en la sección de Modos (skeleton mientras `statsLoading && !stats`). Crea endpoint dedicado `/api/admin/bot/mode` que la auditoría v16 R2 anticipaba. SSOT `BotGlobalMode` + type guard `isBotGlobalMode` en `system-settings-server.ts`. `fix(bot)` + `feat(bot)`.

---

## 📁 Archivos del cambio (resumen por feature)

### Nuevos (8 archivos clave)

| Path | Propósito |
|---|---|
| `src/app/api/admin/bot/mode/route.ts` | Endpoint dedicado POST/GET para `bot_global_mode` (sprint v16 hotfix #3). Patrón idéntico a `/api/admin/bot/global-pause`. Valida contra set cerrado de 3 valores. |
| `src/app/api/admin/bot/stats/route.ts` | Endpoint de métricas: mensajes 24h/7d, leads en pausa, razones de escalación, modo activo, top N reglas, radar de costos DeepSeek, cupo Meta, kill-switch, outbound count, pausa global. Consumido por `BotConfigTab` y `RadarDeCostos`. |
| `src/app/api/admin/bot/global-pause/route.ts` | Switch maestro "Pausar Bot para Todos" (M4). Precedencia sobre per-lead. |
| `src/lib/admin/system-settings-server.ts` | SSOT de acceso a `system_settings` con caché in-memory TTL 30s. Incluye `BotGlobalMode` + `isBotGlobalMode` (sprint v16 hotfix #3). |
| `src/lib/ai/ai-bot-rules-actions.ts` | Server actions para CRUD de Reglas de Oro: `createBotRuleAction`, `updateBotRuleAction`, `deleteBotRuleAction`, `toggleBotRuleAction`, `fetchActiveRulesAction`. Top N por prioridad se inyectan al prompt del bot. |
| `src/components/crm/ConversationsTab.tsx` | Buzón nivel 1 con realtime, soft-delete, matriz de pausa. Badge 🟢 "Nuevo" robusto (sprint v16 hotfix #2). |
| `src/components/admin/BotConfigTab.tsx` | Torre de Control: selector de modos (3 tarjetas), 6 bloques de contexto, CRUD de Reglas de Oro, métricas en vivo, Radar de Costos, controles de pausa/kill-switch. onSelectMode ahora persiste (sprint v16 hotfix #3). |
| `src/components/admin/RadarDeCostos.tsx` | Radar de Costos DeepSeek + cupo Meta rolling 30d. |

### Modificados (12+ archivos)

- `src/lib/ai/deepseek-provider.ts` — sistema de resolución de modo (DB → env var → default), integración con `bot_global_mode` y `bot_paused_global`.
- `src/lib/ai/bot-engine.ts` — verifica `bot_paused_global` antes de generar respuesta, aborta si activo con `bot_paused_reason = 'manual_global'`. Caché 60s módulo-level para `bot_daily_outbound_limit` (sprint v16 code review).
- `src/lib/ai/agent-prompts.ts` — 3 system prompts: Socrático v2, Socrático v1, Súper Ejecutivo.
- `src/components/crm/LeadDetailDrawer.tsx` — matriz de pausa integrada (per-lead overrides global).
- `src/components/crm/CrmOverview.tsx` — link a Torre de Control + Radar.
- `src/app/admin/page.tsx` — tab "Bot" agregado.
- `src/app/api/admin/system-setting/route.ts` — allowlist de 4 keys (R2 code review), validación runtime de tipo (R3).
- `src/components/ui/` — nuevos componentes: `Card`, `CardHeader`, `CardBody`, `Badge` (tones: success, warning, info, neutral, danger).
- `src/lib/supabase/admin.ts`, `src/lib/auth/session.ts` — guards consistentes en endpoints nuevos.
- `package.json` — sin nuevas deps externas (todo lo necesario ya estaba en stack).

### Tests (12+ archivos, +60 tests desde v0.9.4)

- `tests/system-settings-server.test.mjs` — caché TTL + invalidación + lectura/escritura.
- `tests/ai-bot-rules-actions.test.mjs` — CRUD de Reglas de Oro.
- `tests/bot-engine-pause-matrix.test.mjs` — precedencia global/lead.
- `tests/deepseek-provider.test.mjs` — resolución de modo.
- `tests/bot-stats-route.test.mjs` — endpoint de métricas.
- `tests/system-setting-allowlist.test.mjs` — R2 + R3 del code review v16.
- ... y ~7 más para cubrir refactors del code review.

**Baseline:** 1066/1066 tests pre-sprint v16 → **1173/1173 tests** post-cierre (+107 tests, todos los nuevos verdes).

---

## 🧪 Validación corrida

| Etapa | Resultado |
|---|---|
| `npm run type-check` | ✅ OK (0 errores) |
| `npm run lint` | ✅ OK (0 warnings, 0 errors) |
| `npm test` | ✅ OK **1173/1173 tests** (+107 desde v0.9.4) |
| `npm run build` | ✅ OK (3 nuevos endpoints listados: `/api/admin/bot/{mode,global-pause,stats}`) |
| Vercel deploy | ✅ Auto-deploy disparado en cada PR merge (último: run `29186675027`) |
| GitHub Actions | ✅ Tests+Type-check+Lint 54s ✅ · Vercel ✅ · Smoke E2E skipping (esperado en PR) |
| `npm run audit:voseo` | ✅ OK (todos los templates del sprint en español MX tuteo) |
| `npm run audit:links` | ✅ OK |
| `npm run check:supabase` | ✅ OK |

---

## 🚀 Lo que David puede hacer ya en producción (post-merge + deploy)

1. **Cambiar el modo del bot en vivo** sin redeploy:
   - Login admin → `/admin` → tab "Bot" → sección "Modo Global del Bot".
   - Click en Socrático v2 / Socrático v1 / Súper Ejecutivo.
   - El cambio se persiste en `system_settings.bot_global_mode` antes de que el botón vuelva a estar disponible.
   - El provider deepseek lo lee en el siguiente turno (caché 30s invalidado).
   - Si la DB falla, rollback automático del modo local + toast rojo.

2. **Pausar el bot para todos** (kill-switch de emergencia):
   - Misma pantalla → tarjeta "Pausar Bot para Todos".
   - Precedencia sobre per-lead (matriz de pausa).
   - Bot-engine aborta con `bot_paused_reason = 'manual_global'`.

3. **Ajustar el tope diario de outbound**:
   - Input numérico con 2 atajos: ⚡ Subir a 500 (pruebas intensivas) o teclear valor manualmente.
   - Default 50/día en pruebas.
   - Refleja en el siguiente turno (caché 60s en `bot-engine.ts`).

4. **Gestionar Reglas de Oro** (CRUD):
   - Crear / editar / eliminar / activar-desactivar reglas.
   - Top N por prioridad se inyectan al prompt del bot.
   - Guía Rápida plegable explica prioridad (1-100), alcance (global, `curso_<slug>`, `evento_<slug>`), descuentos (`discount_percent` + `valid_until`) con 3 ejemplos.

5. **Monitorear costos de DeepSeek en vivo**:
   - Tokens hoy (prompt + completion).
   - Costo USD hoy + proyección 30d.
   - Cupo Meta rolling 30d con barra de progreso (warning si >80%).

6. **Buzón de conversaciones en el CRM**:
   - Tab "Conversaciones" en el CRM con realtime Supabase.
   - Badge 🟢 "Nuevo" pegado al borde mientras el admin no haya abierto el chat.
   - Soft-delete transaccional, orden natural humano, matriz de pausa visible.

---

## ⚠️ Riesgo operacional + decisiones arquitectónicas clave

### Decisiones del sprint

- **D-025 matriz de pausa (M4)**: precedencia `bot_paused_global` > `leads.bot_paused`. Safety net operativo. La UI muestra ambos con badges claros.
- **Auditoría v16 R2**: separar `bot_global_mode` y `deepseek_tools_enabled` del allowlist genérico de `/api/admin/system-setting` (cambios sensibles con su propio flujo). El hotfix #3 entrega el endpoint dedicado `/api/admin/bot/mode` que R2 anticipaba. La SSOT del tipo `BotGlobalMode` + type guard `isBotGlobalMode` viven en `system-settings-server.ts` para reuso futuro.
- **Caché 30s en `readSystemSetting`**: balance entre freshness del toggle y latencia de DB. Se invalida explícitamente en `setSystemSetting`.
- **Caché 60s en `bot-engine.ts`** (code review v16): evita N+1 queries al `bot_daily_outbound_limit` bajo carga. Aceptable: 1 minuto de drift máximo al cambiar el tope.
- **Rolling 24h en `bot_daily_outbound_count`** (code review v16): cierra el bug de zona horaria para admins al oeste de UTC (David en Phoenix/Hermosillo UTC-7 subestimaba envíos de 17:00–24:00 hora local).
- **`safeFetch` helper** (code review v16): AbortController compartido + validación 2xx + guard `isMountedRef`. Elimina fugas en unmount y errores 5xx silenciosos. 8 fetches en `ConversationsTab` ahora lo usan.
- **Optimistic + rollback en `onSelectMode`** (hotfix #3): UI Zero-latency feel con consistencia transaccional. Si la DB falla, rollback del estado local.

### Riesgos vivos

- **Caché 60s en `bot-engine.ts`**: cambio de `bot_daily_outbound_limit` tarda hasta 1 minuto en aplicar el nuevo tope. Aceptable por diseño (D-025 matriz es best-effort).
- **Skeleton en sección de Modos**: se muestra también cuando `stats === null` por error de DB (sin botón "Reintentar" específico). Pendiente menor: considerar en v0.9.6.
- **Copy "Tope Diario"**: el label de la UI dice "Tope Diario (X/Y)" pero el campo es rolling 24h desde el code review v16. Pendiente menor: tooltip "Tope 24h (X/Y)".
- **Sin migraciones**: el sprint v16 NO toca schema. Todo es lógica + endpoints + caché.

---

## 🔗 PRs mergeados (lista completa)

| # | PR | Rama | Título | Merge |
|---|---|---|---|---|
| 1 | #14 | `feat/fase-16-1-conversations-tab` | feat(conversations): buzón nivel 1 con orden natural, soft-delete transaccional, matriz de pausa y realtime (v16 PR #1) | 2026-07-12 07:13 |
| 2 | #16 | `feat/fase-16-2-cost-guardrails` | feat(bot): radar de costos deepseek + kill-switch diario + matriz global/lead (v16 PR #2) | 2026-07-12 07:14 |
| 3 | #17 | `feat/fase-16-3-hotfix-ui` | fix(ui): sprint v16 hotfix — scroll instant, badge unread pegado, nombres visibles, súper ejecutivo desbloqueado | 2026-07-12 07:34 |
| 4 | #18 | `feat/fase-16-4-code-review-fixes` | fix(bot): code review sprint v16 — safeFetch + allowlist + cache + zona horaria | 2026-07-12 07:58 |
| 5 | #19 | `feat/fase-16-5-hotfix-ui-2` | fix(ui): hotfix sprint v16 #2 — isUnread robusto, guía reglas, modo claro, atajo pruebas | 2026-07-12 08:32 |
| 6 | #20 | `feat/fase-16-6-hotfix-ui-3` | fix(bot): sprint v16 hotfix #3 — persistencia real de modo + anti-flicker | 2026-07-12 09:04 |

**Total:** 6 PRs · ~30 commits atómicos · 6 ramas borradas post-merge · 0 migraciones.

---

## 📚 Documentación relacionada

- `docs/STATUS.md` — snapshot vivo (última actualización 2026-07-12 02:03 Phoenix).
- `data/PROJECT-LOG.md` — log append-only con entradas para hotfix #2 (2026-07-12 01:32) y hotfix #3 (2026-07-12 01:48).
- `docs/AGENT_SUPABASE_PROTOCOL.md` — protocolo de acceso a Supabase (incluye el patrón de endpoints dedicados con allowlist + validación runtime).
- `docs/HANDOFF_v0.9.2_CERT_EMAIL.md` — handoff anterior relevante (generación de certs batch con email Brevo).
- `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` — handoff de la base del CRM.
- `src/lib/ai/agent-prompts.ts` — los 3 system prompts (Socrático v1, Socrático v2, Súper Ejecutivo).
- `src/lib/ai/deepseek-provider.ts` — la resolución de modo (orden de prioridad DB → env var → default).

---

## 🎁 Estado de `main` post-cierre

`main` HEAD: `0ccdabc` (Merge pull request #20 from david17891/feat/fase-16-6-hotfix-ui-3)

- ✅ Bot V2 + Tool Calling operativo (sprint 2 previo, PR #8)
- ✅ Torre de Control completa con persistencia real (sprint v16, PRs #14-#20)
- ✅ CRM con conversaciones + IA agent (v0.9.0)
- ✅ Cert email batch con Brevo (v0.9.2)
- ✅ Cierre-eventos-virtuales con UPSERT attendee + promote lead (v0.9.3)
- ✅ CI verde + GitHub Secrets (v0.9.4)
- ✅ **v0.9.5 Torre de Control Bot v16 (este sprint)**

**Listo para pilotaje real en producción con el bot corriendo.** Sprint v16 cerrado.
