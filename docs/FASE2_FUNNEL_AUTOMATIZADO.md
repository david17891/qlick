# Fase 2 — Funnel WhatsApp Automatizado

> **Inicio:** 2026-06-30 (cierre Hito C, decisión de Fase 2)
> **Horizonte:** MVP para conferencia **10 de julio de 2026** (~7 días desde 2026-07-03). Fecha corregida por David el 2026-07-03 — el original era 6 jul.
> **Estado:** listo para arrancar, esperando luz verde de David

## Deseo (verbalizado por David 2026-06-30 ~03:22)

> "Queremos poder captar todos los leads, mediante bots con whatsapp
> combinación deep flash/pro, queremos llevar todos esos registros al
> crm, queremos que se vaya haciendo el funnel automáticamente,
> queremos que haya acciones automáticas de los bots según la etapa,
> queremos poder obtener estadísticas y datos de la campaña para
> tomar decisiones claras."

## 5 pilares → decisiones tomadas

| # | Pilar | Implementación |
|---|---|---|
| 1 | Captar leads (WhatsApp + DeepSeek) | **Flash default + Pro cuando LLM duda.** Switch dinámico por complejidad de la pregunta. |
| 2 | CRM visual para tomar decisiones | **Kanban visual** estilo HubSpot/Kommo. Drag leads entre columnas de pipeline. Decisión: "lo mejor y más efectivo para decisiones". |
| 3 | Funnel automático | Ya hay `promoteSurveyToLead` + `event_confirmations` → `event_attendees`. Falta edge cases (lead inactivo, nurturing si no responde). |
| 4 | Acciones automáticas de bots según etapa | **4 críticas para el piloto:**<br>1. Bienvenida auto al primer contacto (welcome)<br>2. Recordatorio 24h antes del evento<br>3. Recordatorio 1h antes del evento<br>4. Post-conferencia al asistir (agradecimiento + material) |
| 5 | Estadísticas orientadas a decisiones | **Dashboard decision-support** (no métricas decorativas):<br>- 3 KPI con semáforo (CPL, conversion, show-up vs target)<br>- Anomaly detection (CPL >50% promedio 4h → alerta con causa probable)<br>- 3 alertas top + botones de 1-click (pausar ads, recordatorio masivo, escalar a humano)<br>- Daily digest por email |

## Plan día por día

| Día | Owner | Tareas | Esfuerzo |
|---|---|---|---|
| **Hoy 30 jun noche** | Yo (cerrado) | Código + docs + push ✅ | ✅ |
| **Mié 1 jul** | Yo | Switch LLM Flash↔Pro + 4 cron jobs + Kanban básico | 8h |
| **Jue 2 jul** | Yo | Cron jobs testeados + dashboard decision-support v1 | 5h |
| **Vie 3 jul** | Yo + David | Pulido, tests, e2e smoke test, validar UX | 3h yo / David: empuja al socio |
| **Sáb 4 jul** | Yo + David | Buffer fixes + soft launch prep | David: 5 amigos piloto |
| **Dom 5 jul** | Yo + David | Ensayo general: ads click → lead → bot → QR → check-in | David: backup |
| **Lun 6 jul** | — | **CONFERENCIA** 🚀 | David: staff standby |

## Trade-off honesto

5 días **es apretado**. Lo crítico para que la conferencia funcione:
1. **Los 4 cron jobs** (sin recordatorios, falla conversión 24h antes → ~30% show-up perdido)
2. **Switch LLM** (mejor calidad sin cambiar infra)
3. **Check-in QR en puerta** (ya cerrado en Hito C ✅)

El Kanban visual y el dashboard decision-support son mejoras de calidad que se completan parcialmente para el 6 jul y se terminan Fase 7 con calma.

## Decisiones técnicas tomadas

- **Cron jobs:** usar Vercel Cron (configurable en `vercel.json`). Cada cron hace POST a `/api/cron/{job-name}` que ejecuta el trabajo. Si falla Vercel reintenta 1 vez.
- **Switch LLM:** `getActiveAgentProvider()` decide. Criterio: si la pregunta tiene señales fuertes (regex matchea), no llama LLM. Si llama LLM, usa Flash. Si Flash devuelve `confidence < 0.7` o `needsReview: true` después de 2 intentos, escala a Pro.
- **Kanban:** columnas del pipeline (`new`, `contacted`, `interested`, `lost`, `won`). Drag-drop usa `@dnd-kit/core`. Server action actualiza `leads.pipeline_stage`.
- **Dashboard:** ruta `/admin/decisions` con cards semáforo. Anomaly check cada 15 min (cron). Email digest vía Resend (ya configurado).

## Bloqueos que necesito destrabar antes de empezar

1. **Migración SQL en Supabase aplicada** (David corre desde panel o me pasa credenciales) — sin esto, los cron jobs no pueden leer `events.starts_at` ni `attendees.checked_in_at`.
2. **Credenciales WhatsApp reales** (después del socio verifique) — para los cron jobs que disparan templates.

Si los dos están OK para el jueves 2 jul, vamos bien. Si no, piloto interno solo con mocks.

## Próximo paso concreto (mañana 1 jul AM)

David me da luz verde → arranco con **switch LLM + cron job #1 (bienvenida)** para validar el patrón end-to-end. Si funciona, sigo con los 3 cron jobs restantes (24h, 1h, post) + Kanban visual básico.
