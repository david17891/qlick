# CRM Mode Status — Real vs Demo

> **Versión:** v0.6.0
> **Fecha:** 2026-06-25
> **Estado:** Cierre de la "CRM Truth Layer" (v0.5.1) + Masterclass Funnel Foundation (v0.6.0, en rama).

Este documento describe el modo de operación actual de cada sección del CRM
admin. La regla es:

- **Real**: lee/escribe en Supabase. Lo que ves son datos persistidos.
- **Demo**: usa mocks hardcoded en `src/lib/data/crm-data.ts`. Lo que ves es
  ficticio y las acciones no persisten.
- **Parcial/Demo**: parte real (config / banner) y parte mock (datos).

El **detector** de modo es `isSupabaseConfigured()` en
`src/lib/supabase/config.ts`. Regresa `true` solo si las env vars públicas de
Supabase están presentes y bien formadas.

---

## Mapa de secciones

| Sección           | Estado        | Lee de                      | Escribe a              | Notas                                                                 |
|-------------------|---------------|-----------------------------|------------------------|-----------------------------------------------------------------------|
| **Leads**         | ✅ Real       | `public.leads` (Supabase)   | `public.leads`         | Vía API `/api/admin/leads` + `src/lib/crm/leads-server.ts`.           |
| **Pipeline**      | ✅ Real       | Derivado de leads reales    | (lectura)              | Mismo flujo que Leads; el kanban se calcula sobre los leads reales.   |
| **Resumen (Overview)** | ✅ Real   | `public.leads` (Supabase)   | (lectura)              | Vía API `/api/admin/crm/overview` + server `getLeads()`.               |
| **Notas por lead**     | ✅ Real   | `public.crm_notes`          | `public.crm_notes`     | Vía `/api/admin/leads/[id]/notes`.                                    |
| **Tareas por lead**    | ✅ Real   | `public.crm_tasks`          | `public.crm_tasks`     | Vía `/api/admin/leads/[id]/tasks`.                                    |
| **Interacciones por lead** | ✅ Real | `public.lead_interactions` | `public.lead_interactions` | Vía `/api/admin/leads/[id]` (PATCH dispara interaction automática). |
| **Audit log**          | ✅ Real   | `public.admin_audit_log`    | `public.admin_audit_log` | Best-effort, vía `src/lib/crm/audit-server.ts`.                    |
| **Masterclasses (catálogo público)** | ✅ Real (v0.6.0) | `public.masterclasses` | `public.masterclasses` | Lectura pública solo `status='published'`. Admin vía service role. |
| **Masterclass registrations** | ✅ Real (v0.6.0) | `public.masterclass_registrations` | `public.masterclass_registrations` | RLS deny para anon. Server action público con service role crea el reg + lead. |
| **Conversaciones**     | 🟡 Demo   | `src/lib/data/crm-data.ts`  | (no persiste)          | Feature planeada para Fase 4 (WhatsApp Business API real).            |
| **Calendario / Citas** | 🟡 Demo   | `src/lib/data/crm-data.ts`  | (no persiste)          | Feature planeada para Fase 4 (Google Calendar integration).          |
| **Agente IA**          | 🟡 Demo   | `src/lib/data/crm-data.ts`  | (no persiste)          | Feature planeada para Fase 4 (OpenRouter + guardrails producción).    |
| **WhatsApp providers** | 🟡 Parcial/Demo | Banner: real · Providers: `crm-data.ts` | (no persiste) | Banner refleja config; los providers siguen siendo stubs.        |
| **Sales Owners**       | 🟡 Demo   | `src/lib/data/crm-data.ts`  | (no persiste)          | Asignación a leads sigue siendo ficticia.                            |

---

## Fuera de alcance (no migrar ahora)

Estas features están explícitamente fuera del scope de la "Truth Layer" y
deben quedar como demo hasta sus fases correspondientes del roadmap:

- **Pagos reales** (Mercado Pago / Stripe) — Fase 2
- **WhatsApp Business API** (Cloud API / BSP) — Fase 4
- **OpenRouter / LLM real** para el agente IA — Fase 4
- **LMS completo** (cursos / módulos / lecciones con inscripción real) —
  Fase 1 (separado del CRM)
- **Radar web** — Backlog

---

## Cómo se decide el modo

```
isSupabaseConfigured() ──┐
                          │
                          ▼
              ┌─────────────────────┐
              │ true → realMode     │ → fetch /api/admin/leads (real)
              │ false → modo demo   │ → getLeads() mock
              └─────────────────────┘
```

`isSupabaseConfigured()` valida:
1. `NEXT_PUBLIC_SUPABASE_URL` con formato `https://*.supabase.co`.
2. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o alias legacy
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) con pinta de JWT o prefijo `sb_publishable_…`.

Ambas vars se leen con **acceso literal** (`process.env.NEXT_PUBLIC_FOO`) para
que Next.js las inline en el bundle del cliente. Acceso dinámico (vía
`readEnv(key)`) sí funciona en server pero queda `undefined` en el navegador,
lo que causaba el bug de "modo demo falso" fixeado en v0.5.1.

---

## Verificación

### Comandos

```bash
npm run lint            # 0 warnings/errors
npm run type-check      # 0 errors
npm run build           # build de producción
npm run audit:links     # sin anchors vacíos ni forms sin backend
npm run check:supabase  # env vars OK
```

### En el panel

1. Banner amarillo "CRM en modo demo" → `isSupabaseConfigured() === false`
2. Banner verde "CRM en modo real · Leads leídos desde Supabase" → modo real activo
3. "15 de 15 leads" en la lista → viene del mock; "1 de 1 leads" → viene de Supabase
4. Resumen con totales que coinciden con la lista → overview real

### En la base de datos

```sql
-- Verificar que el panel refleja la BD real:
SELECT 'leads' AS tabla, count(*) FROM public.leads
UNION ALL SELECT 'crm_notes', count(*) FROM public.crm_notes
UNION ALL SELECT 'crm_tasks', count(*) FROM public.crm_tasks
UNION ALL SELECT 'lead_interactions', count(*) FROM public.lead_interactions
UNION ALL SELECT 'admin_audit_log', count(*) FROM public.admin_audit_log;
```

---

## Próximos pasos (Fase 1 + Fase 4)

1. **Fase 1 — Auth y DB real** (en curso):
   - [x] Leads reales
   - [x] Notas / tareas / interacciones por lead
   - [x] Audit log
   - [ ] Reemplazar `lib/data/*` por queries a Supabase (catálogo, dashboard)
   - [ ] Reemplazar `mock-auth` por Supabase Auth para alumnos
   - [ ] Activar registro de nuevos alumnos
2. **Fase 4 — Conversaciones, calendario, agente IA, WhatsApp real**
3. **Backlog**: sales owners reales, programa de afiliados, etc.

---

*Documento vivo. Actualizar cuando se migre una sección de demo → real.*
