# Activación gradual de `BOT_GLOBAL_RULES_ENABLED`

Sprint: activación controlada de `ai_bot_rules` en el bot real de
WhatsApp. Fecha: 2026-07-25.

> **TL;DR:** la fila `system_settings.bot_global_rules_enabled` está
> en `false` (o no existe) por default. Para activar la inyección de
> Reglas de Oro al prompt, setear `value: true`. El cambio tarda
> <30s en verse (caché 10s del helper + 30s del loader). Rollback en
> <30s con solo poner `value: false`. Ver
> `docs/PLAN_ROLLBACK_BOT_GLOBAL_RULES.md` para los 3 escenarios de
> rollback.

## Filosofía

La regla canónica es **FAIL-CLOSED**: si el feature flag no se puede
leer (DB caída, fila inexistente, valor inválido), el bot se comporta
como antes del sprint — sin reglas inyectadas, sin telemetría, sin
escrituras en `usage_count`. Esto vale para el caso por default y
también para cualquier fallo en runtime.

Las 4 fases del rollout están pensadas para detectar efectos
colaterales tempranamente sin necesidad de monitorear el 100% de las
conversaciones.

## Fase 0 — Preparación (sin tocar nada en runtime)

**Quién:** David.
**Qué:**
- Revisar la lista de reglas activas en `/admin/bot` → Torre de
  Control. Eliminar o archivar las que NO quieras que el LLM vea
  en producción.
- Verificar que las reglas activas tienen:
  - `is_active = true`.
  - `expires_at IS NULL OR expires_at > now()`.
  - `instruction` clara, sin placeholders ("lorem ipsum", "test", etc.).
  - `priority` sensata (1-100; mayor = más importante).
- Confirmar que `bot_max_active_rules` está en un número razonable
  (default 8, suficiente para la mayoría de casos).
- Definir 1-2 métricas de éxito:
  - % de respuestas del LLM que citan la regla (heurística: regex
    match del output contra `instruction`).
  - Tasa de conversión post-inyección vs pre-inyección.
  - Latencia promedio (debe mantenerse <+10% vs sin reglas).

**Salida:** lista de reglas curada, métricas definidas.

**No requiere tocar el flag.**

## Fase 1 — Shadow (sin envío real, solo telemetría)

**Quién:** David + Mavis.
**Qué:**
- Activar el flag SOLO para el simulador (`/admin/bot` → Torre de
  Control), NO en el flujo real del webhook. Esto se logra
  modificando temporalmente la rama del `bot-engine.ts` que decide
  si el flujo es real o simulado — o, más simple, agregando un
  override por env var (`BOT_GLOBAL_RULES_SHADOW_ONLY=true`) en
  `.env.local` de dev/preview. (Nota: este override NO está
  implementado en este sprint; si lo quieres, es un sprint de 30min.)
- Disparar simulaciones masivas con `tests/bot-comprehensive-matrix.test.mjs`
  o equivalente. Verificar que el prompt renderea el bloque de reglas
  y que el LLM las respeta.
- Revisar manualmente 10-20 respuestas generadas: ¿el LLM aplicó la
  regla o la ignoró? ¿Se contradice con las reglas locales del evento?

**Salida:** confianza en que el bloque se renderea correctamente y
las reglas se respetan.

**No afecta a leads reales.**

## Fase 2 — Canary (1 evento, leads reales, monitoreo manual)

**Quién:** David.
**Qué:**
- Crear 2-3 reglas NUEVAS específicas para UN evento (no globales
  todavía). Scope: `event:<id_del_evento_canary>`.
  - Ejemplo: "Para este evento, NO ofrezcas descuento del 30%".
  - Ejemplo: "Para este evento, menciona que el material se entrega
    digital al finalizar".
- Activar el flag en `system_settings`:
  ```sql
  INSERT INTO public.system_settings (key, value, updated_by)
  VALUES ('bot_global_rules_enabled', 'true'::jsonb, 'david')
  ON CONFLICT (key) DO UPDATE
  SET value = 'true'::jsonb, updated_at = now(), updated_by = 'david';
  ```
  O vía la UI admin (Torre de Control).
- Monitorear durante 24-72h:
  - Ver `usage_count` de las reglas nuevas en `/admin/bot` (debe
    incrementarse en cada turno donde el LLM las ve).
  - Revisar 5-10 conversaciones del evento canary. ¿El LLM aplicó
    las reglas? ¿Mejoró la calidad de las respuestas?
  - Verificar latencia (no debe subir más de 200ms).
  - Verificar costo de DeepSeek (no debe subir más de 10%).

**Go/no-go:**
- ✅ **Go a Fase 3** si: usage_count incrementa, las reglas se aplican,
  no hay regresión en calidad/latencia/costo.
- ⚠️ **Mantener en Fase 2** si: resultados mixtos, ajustar reglas y
  repetir.
- ❌ **Rollback soft** (Opción A en `PLAN_ROLLBACK`) si: hay regresión
  clara. Diagnosticar qué regla causa el problema y archivar/ajustar
  antes de re-activar.

## Fase 3 — General (todos los eventos, reglas globales + de evento)

**Quién:** David.
**Qué:**
- Activar las reglas GLOBALES (no solo de evento). Empezar con las
  más obvias y de bajo riesgo:
  - "NUNCA confirmes pagos".
  - "NUNCA ofrezcas descuentos no autorizados".
  - "Tono: cálido, mexicano, tuteo. Sin emojis excesivos (max 1)".
  - "Máximo 2-3 oraciones por mensaje en WhatsApp".
- El flag ya está activo de la Fase 2. Solo agregar reglas globales
  al `ai_bot_rules` con `scope='global'`.
- Monitorear durante 3-7 días:
  - Métricas de Fase 2 + nuevas:
    - % de respuestas que respetan las reglas globales.
    - Drift de tono: ¿se está volviendo más formal/automático?
    - Quejas de leads (si las hay).

**Go/no-go:**
- ✅ **Go a Fase 4** si: las reglas globales se respetan de forma
  consistente y no hay degradación de UX.
- ⚠️ **Ajustar** si: hay reglas que el LLM ignora o contradice.
  Considerar subir `priority` o reescribir la `instruction` para que
  sea más específica.
- ❌ **Rollback soft** si: hay regresión seria. Las reglas globales
  son más riesgosas que las de evento porque aplican a TODOS los
  leads.

## Fase 4 — Producción completa (sin intervención)

**Quién:** David.
**Qué:**
- Confirmar que el flag está activo.
- Confirmar que las reglas activas en `ai_bot_rules` son las
  deseadas (auditoría de la lista en `/admin/bot`).
- El sistema corre solo. La única intervención futura es:
  - Agregar/quitar reglas vía UI admin (sin tocar código).
  - Monitorear `usage_count` y métricas de calidad.
  - Si alguna regla se vuelve obsoleta: `is_active=false` o
    `expires_at=now() - interval '1 day'`.

## Comandos útiles

### Ver el estado actual del flag
```sql
SELECT key, value, updated_at, updated_by
FROM public.system_settings
WHERE key = 'bot_global_rules_enabled';
```

### Ver las reglas activas ordenadas por prioridad
```sql
SELECT id, scope, priority, substring(instruction, 1, 80) as instruction_preview,
       is_active, expires_at, usage_count, created_by
FROM public.ai_bot_rules
WHERE is_active = true
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY priority DESC, usage_count DESC
LIMIT 20;
```

### Top 10 reglas más usadas (últimos N días)
```sql
SELECT id, scope, priority, usage_count,
       substring(instruction, 1, 60) as instruction_preview
FROM public.ai_bot_rules
ORDER BY usage_count DESC
LIMIT 10;
```

### Reglas que NUNCA se usaron (candidatas a archivar)
```sql
SELECT id, scope, priority, created_by, created_at
FROM public.ai_bot_rules
WHERE usage_count = 0
  AND is_active = true
  AND created_at < now() - interval '7 days';
```

## Criterios universales de rollback (en cualquier fase)

Si en cualquier momento se observa CUALQUIERA de estos síntomas, hacer
rollback soft inmediato (`value=false`):

1. **Latencia sube >500ms** vs baseline pre-inyección.
2. **Costo DeepSeek sube >30%** vs baseline pre-inyección.
3. **Tasa de alucinaciones sube** (el guardrail `validateAgentReply`
   bloquea más respuestas de lo normal).
4. **Queja de un lead real** porque la respuesta es rara, ofensiva o
   rompe el flujo.
5. **El LLM ignora una regla crítica** (ej. confirma un pago, ofrece
   un descuento no autorizado).

Después del rollback, abrir issue con la causa y NO re-activar hasta
que se reproduzca el problema en un test y se resuelva.
