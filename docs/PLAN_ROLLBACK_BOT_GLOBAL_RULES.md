# Plan de rollback — `BOT_GLOBAL_RULES_ENABLED`

Sprint: activación controlada de `ai_bot_rules` en el bot real de WhatsApp.
Fecha: 2026-07-25.
Owner: David.
Autor del código: Mavis.

## Resumen ejecutivo

El feature flag `bot_global_rules_enabled` es la única "puerta" entre el
código nuevo (inyección de Reglas de Oro Globales al prompt) y el bot real.
Mientras esté en `false`, el bot se comporta EXACTAMENTE como antes del
sprint. Cualquiera de las 3 opciones de abajo apaga la inyección en <30s.

## Opción A — Rollback soft (recomendado, instantáneo)

**Tiempo:** <30s. **Reversible:** sí (solo re-toggle el flag).

Si el comportamiento del bot se degrada con reglas activas
(respuestas raras, mayor latencia, costo elevado, alucinaciones
nuevas) pero el código base sigue sano:

1. Apagar el flag en `system_settings`:

   ```sql
   -- Vía SQL Editor de Supabase:
   UPDATE public.system_settings
   SET value = 'false'::jsonb,
       updated_at = now(),
       updated_by = 'david-rollback'
   WHERE key = 'bot_global_rules_enabled';
   ```

   O vía Server Action del admin (UI /admin/bot → Torre de Control).

2. Esperar 30s (caché 10s del helper + 30s del loader). El bot vuelve
   a NO inyectar reglas.

3. Verificar con el simulador (`/admin/bot`) que el prompt ya no tiene
   el bloque "Reglas de Oro Globales".

4. (Opcional) Diagnosticar: ver `usage_count` y notas de las reglas
   activas en `/admin/bot` para identificar cuál causa el problema.

5. Corregir la regla problemática (editar instrucción, bajar prioridad,
   desactivar, o expirar) y re-togglear el flag.

**No requiere redeploy.**

## Opción B — Rollback hard (revert del código)

**Tiempo:** 5-10 min (revert + redeploy Vercel). **Reversible:** sí
(forward del mismo código).

Si el código nuevo tiene un bug crítico (p.ej. el LLM entra en loop, o
el provider crashea, o el webhook de WhatsApp rebota mensajes) y el
rollback soft no es suficiente:

1. Identificar el commit de merge del sprint:
   `git log --oneline --grep="ai_bot_rules"` (el mensaje debe incluir
   "activar ai_bot_rules" o "ai-bot-rules-injector").

2. Revert local + push:
   ```bash
   git revert <merge-commit-sha> --no-edit
   git push origin main   # o la rama de integración
   ```

3. Vercel redeploya automáticamente al detectar el push. Esperar
   ~2-5 min para que el deploy quede en verde.

4. Verificar que el bot responde como antes (smoke test con un lead
   sintético, ver `docs/HOW-TO-RUN.md` → "smoke test del bot").

5. (Importante) la fila `bot_global_rules_enabled` puede quedar en
   `true` en la DB; al hacer revert, el código viejo NO la lee, así
   que no hay efecto. En el próximo forward, el flag sigue vigente.

**Sí requiere redeploy.**

## Opción C — Rollback de emergencia (pánico)

**Tiempo:** <1 min. **Reversible:** sí.

Si el bot está REBOTANDO mensajes o ENVIANDO respuestas dañinas a leads
reales y no hay tiempo para investigar:

1. Pausar el bot globalmente (mata la conversación en seco):
   ```sql
   UPDATE public.system_settings
   SET value = 'true'::jsonb,   -- pausa global
       updated_at = now(),
       updated_by = 'david-emergency'
   WHERE key = 'bot_paused_global';
   ```

   Esto apaga TODO el bot (no solo la inyección de reglas). El
   `bot-engine.ts` consulta `KEY_BOT_PAUSED_GLOBAL` antes de generar
   respuesta y aborta con copy de "pausa administrativa".

2. Mientras el bot está pausado, diagnosticar:
   - Ver logs de Vercel (última hora) buscando `errorLog` del bot.
   - Ver `lead_whatsapp_conversations` para los últimos mensajes.
   - Ver `bot_usage_daily` para detectar pico de costo.
   - Ver `ai_bot_rules` con `usage_count > 0` para identificar qué
     regla se invocó.

3. Resolver (rollback soft o hard según diagnóstico).

4. Reactivar el bot:
   ```sql
   UPDATE public.system_settings
   SET value = 'false'::jsonb,
       updated_at = now()
   WHERE key = 'bot_paused_global';
   ```

**No requiere redeploy.**

## Cuándo usar cada opción

| Señal                                              | Opción   |
| -------------------------------------------------- | -------- |
| Comportamiento extraño con reglas activas          | A (soft) |
| Bug crítico en el código nuevo (loop, crash)       | B (hard) |
| Bot rebotando/enviando daño a leads reales         | C (emerg)|
| Quiero pausar temporalmente para investigar        | C (emerg)|
| Quiero desactivar una regla específica             | A (soft) + editar la regla (is_active=false o expires_at=past) |

## Defensa en profundidad (qué pasa si NADA funciona)

Si los 3 rollbacks de arriba fallan (extremadamente raro), el
`bot-engine.ts` tiene un safety net adicional: el rate limit per-phone
(`recordAndCheckRateLimit`). Si un lead está rebotando mensajes, el
bot deja de llamar al LLM y devuelve fallback "Perdón, tengo mucha
demanda ahora mismo. ¿Me das un momento?". Esto no resuelve el
problema raíz pero detiene la hemorragia de mensajes.

## Auditoría post-rollback

Independiente de la opción usada, después de un rollback:

1. Documentar el incidente en `data/PROJECT-LOG.md` con timestamp,
   qué opción se usó, qué síntoma se observó, y la causa raíz.

2. Si la causa fue una regla específica: archivarla (no borrarla) en
   una tabla `ai_bot_rules_archive` (futuro sprint) o poner
   `is_active=false` con un `metadata.archived_reason`.

3. Si la causa fue el código: abrir issue con el stack trace, el
   resultado del LLM, y la respuesta esperada.

4. Antes de re-activar: verificar que el bug está resuelto (idealmente
   con un test de regresión que reproduzca el escenario).

## Lo que el rollback NO toca

- Las reglas existentes en `ai_bot_rules` (se preservan intactas).
- La tabla `system_settings.bot_global_rules_enabled` (solo cambia
  su valor, no la fila).
- Los `usage_count` acumulados (son append-only).
- Los mensajes ya enviados a los leads (no se borra nada del historial).
- La migración `20260711140000_bot_control_tower_v15.sql` (no se
  revierte — la tabla ya estaba en producción antes del sprint).
