# Reporte de Simulación Masiva — Laboratorio IA (Sprint v0.9.9)

> Generado: 2026-07-12T11:56:12.709Z
> Total de situaciones: **200** (10 arquetipos × 4 contextos × 5 trayectorias)
> Pass rate: **60.0%** (120/200)
> Duración del arnés: **5ms** (límite <5s)

## Resumen ejecutivo

- **Arnés**: 200 situaciones ejecutadas en modo mock determinístico (<5s).
- **Bot simulado**: heurísticas que simulan las reglas del sprint v0.9.8 (tool `add_event_guest`, detección de typos de dominio, cadencia suave).
- **Métricas evaluadas**: 5 (brevedad, acompañantes, typos, cadencia, tool invocation).
- **Semáforo general**: ver `passRate` arriba y desglose por arquetipo abajo.

## Desglose por arquetipo

| Arquetipo | Total | Pass | Fail | Semáforo |
|---|---:|---:|---:|:---:|
| apresurado | 20 | 0 | 20 | 🔴 |
| desconfiado | 20 | 20 | 0 | 🟢 |
| tecnico | 20 | 20 | 0 | 🟢 |
| fuera_de_horario | 20 | 0 | 20 | 🔴 |
| acompanantes | 20 | 20 | 0 | 🟢 |
| typo_email | 20 | 20 | 0 | 🟢 |
| cadencia_larga | 20 | 0 | 20 | 🔴 |
| asesor_humano | 20 | 0 | 20 | 🔴 |
| monosilabo | 20 | 20 | 0 | 🟢 |
| hostil | 20 | 20 | 0 | 🟢 |

## Desglose por métrica

| Métrica | Total de turns auditados | Pass |
|---|---:|---:|
| isBrief | 480 | 460 |
| guestsHandledCorrectly | 480 | 480 |
| typoIntercepted | 480 | 480 |
| cadenciaSuaveRespetada | 480 | 480 |
| toolCalledCorrectly | 480 | 420 |

## Distribución por contexto

- **super_executive+free_masterclass**: 50 situaciones
- **super_executive+paid_course**: 50 situaciones
- **socratic_autopilot_v2+lms_course**: 50 situaciones
- **fallback+no_active_event**: 50 situaciones

## Fallas detectadas

### apresurado__super_executive+free_masterclass__quick_convert

- **Arquetipo**: apresurado
- **Contexto**: super_executive+free_masterclass
- **Trayectoria**: quick_convert
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__super_executive+free_masterclass__standard_funnel

- **Arquetipo**: apresurado
- **Contexto**: super_executive+free_masterclass
- **Trayectoria**: standard_funnel
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__super_executive+free_masterclass__deep_objection

- **Arquetipo**: apresurado
- **Contexto**: super_executive+free_masterclass
- **Trayectoria**: deep_objection
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__super_executive+free_masterclass__abandonment

- **Arquetipo**: apresurado
- **Contexto**: super_executive+free_masterclass
- **Trayectoria**: abandonment
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__super_executive+free_masterclass__reactivation

- **Arquetipo**: apresurado
- **Contexto**: super_executive+free_masterclass
- **Trayectoria**: reactivation
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__super_executive+paid_course__quick_convert

- **Arquetipo**: apresurado
- **Contexto**: super_executive+paid_course
- **Trayectoria**: quick_convert
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__super_executive+paid_course__standard_funnel

- **Arquetipo**: apresurado
- **Contexto**: super_executive+paid_course
- **Trayectoria**: standard_funnel
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__super_executive+paid_course__deep_objection

- **Arquetipo**: apresurado
- **Contexto**: super_executive+paid_course
- **Trayectoria**: deep_objection
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__super_executive+paid_course__abandonment

- **Arquetipo**: apresurado
- **Contexto**: super_executive+paid_course
- **Trayectoria**: abandonment
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__super_executive+paid_course__reactivation

- **Arquetipo**: apresurado
- **Contexto**: super_executive+paid_course
- **Trayectoria**: reactivation
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__socratic_autopilot_v2+lms_course__quick_convert

- **Arquetipo**: apresurado
- **Contexto**: socratic_autopilot_v2+lms_course
- **Trayectoria**: quick_convert
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__socratic_autopilot_v2+lms_course__standard_funnel

- **Arquetipo**: apresurado
- **Contexto**: socratic_autopilot_v2+lms_course
- **Trayectoria**: standard_funnel
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__socratic_autopilot_v2+lms_course__deep_objection

- **Arquetipo**: apresurado
- **Contexto**: socratic_autopilot_v2+lms_course
- **Trayectoria**: deep_objection
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__socratic_autopilot_v2+lms_course__abandonment

- **Arquetipo**: apresurado
- **Contexto**: socratic_autopilot_v2+lms_course
- **Trayectoria**: abandonment
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__socratic_autopilot_v2+lms_course__reactivation

- **Arquetipo**: apresurado
- **Contexto**: socratic_autopilot_v2+lms_course
- **Trayectoria**: reactivation
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__fallback+no_active_event__quick_convert

- **Arquetipo**: apresurado
- **Contexto**: fallback+no_active_event
- **Trayectoria**: quick_convert
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__fallback+no_active_event__standard_funnel

- **Arquetipo**: apresurado
- **Contexto**: fallback+no_active_event
- **Trayectoria**: standard_funnel
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__fallback+no_active_event__deep_objection

- **Arquetipo**: apresurado
- **Contexto**: fallback+no_active_event
- **Trayectoria**: deep_objection
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__fallback+no_active_event__abandonment

- **Arquetipo**: apresurado
- **Contexto**: fallback+no_active_event
- **Trayectoria**: abandonment
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

### apresurado__fallback+no_active_event__reactivation

- **Arquetipo**: apresurado
- **Contexto**: fallback+no_active_event
- **Trayectoria**: reactivation
- **Fail count**: 1
- **Razones**: falló una métrica en turn[2] (expect=register_titular)

_(... y 60 más; ver JSON completo)_

## Reporte completo

El reporte completo con el detalle de cada situación está en `private-data/reports/bot_simulation_massive_200.json` (no se commitea porque `private-data/` está en `.gitignore`).

Para regenerar después de cambios en el prompt o en el bot: `node --experimental-strip-types scripts/generate-massive-report.mjs`.
