# CRM Mode Status — Real vs Demo

> **Versión:** v0.9.0 (refresh post-release)
> **Fecha:** 2026-07-07
> **Estado:** v0.9.0 "CRM Inteligente v2.0" cerrado el 2026-07-06 (commit `ec9eb55`). Conversaciones, Agente IA e Inteligencia comercial migrados a Real en Fases 2 + 3. Calendario y Sales Owners siguen en Demo (Fase 4).

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
| **Tareas por lead**    | ✅ Real   | `public.crm_tasks`          | `public.crm_tasks`     | Vía `/api/admin/leads/[id]/tasks` (Fase 4 próxima: UI inline en drawer).|
| **Interacciones por lead** | ✅ Real | `public.lead_interactions` | `public.lead_interactions` | Vía `/api/admin/leads/[id]` (PATCH dispara interaction automática). |
| **Audit log**          | ✅ Real   | `public.admin_audit_log`    | `public.admin_audit_log` | Best-effort, vía `src/lib/crm/audit-server.ts`.                    |
| **Inteligencia comercial** | ✅ Real (v0.9.0) | LVR / Heat / SLA Overdue desde `public.leads` | (lectura) | Vía `/api/admin/crm/overview` (`crm-intelligence.ts`). Render en `CRMView` con badges 🔥 + ⚠️. |
| **Conversaciones (WhatsApp)** | ✅ Real (v0.9.0) | `public.lead_whatsapp_conversations` + `lead_interactions` (fallback por phone) | `public.lead_whatsapp_conversations` | `conversations-server.ts`. Soft-delete via `conversations-soft-delete.sql` (2026-07-06). UI en `CRMView.tsx`. |
| **Agente IA (plantillas de venta)** | ✅ Real (v0.9.0) | `public.leads` + `event_surveys` (input) | (no persiste — solo genera texto) | `ai-sales-server.ts` + 3 plantillas dinámicas (`close`/`value`/`reactivate`) en `sales-templates.ts`. Endpoint `/api/admin/crm/ai-suggestions?leadId=X` con rate limit 30/min. |
| **WhatsApp providers** | ✅ Real (parcial) | Config: env vars (`WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`). Stubs Legacy: `meta-cloud-api-provider.ts` funcional, `bsp-provider.ts` stub. | `provider = meta-cloud-api` activo | Banner `getWhatsAppConfigStatus()` lee de Supabase + env. Bot real conectado (Fase 6). |
| **Masterclasses (catálogo público)** | ✅ Real (v0.6.0) | `public.masterclasses` | `public.masterclasses` | Lectura pública solo `status='published'`. Admin vía service role. |
| **Masterclass registrations** | ✅ Real (v0.6.0) | `public.masterclass_registrations` | `public.masterclass_registrations` | RLS deny para anon. Server action público con service role crea el reg + lead. |
| **Calendario / Citas** | 🟡 Demo   | `src/lib/data/crm-data.ts`  | (no persiste)          | Feature planeada para Fase 4 (Google Calendar integration).          |
| **Sales Owners**       | 🟡 Demo   | `src/lib/data/crm-data.ts`  | (no persiste)          | Asignación a leads sigue siendo ficticia.                            |

---

## Fuera de alcance (no migrar ahora)

Estas features están explícitamente fuera del scope de la "Truth Layer" y
deben quedar como demo hasta sus fases correspondientes del roadmap:

- **Pagos reales** (Mercado Pago / Conekta) — Fase 2 (Stripe Checkout ya en
  producción vía `pagos-stripe-real`, commit `2158f97`).
- **OpenRouter / LLM real como proveedor** — Fase 4 (hoy se usa DeepSeek).
- **LMS completo** (cursos / módulos / lecciones con inscripción real) — ya
  migrado a Real en v0.9.0 LMS Foundation (entrega separada del CRM, ver
  `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` para el corte técnico).
- **Radar web** — Backlog.

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

## Próximos pasos (Fase 4)

1. **Fase 4 — Calendario Real + Tareas + Notificaciones Proactivas**
   (rama planificada: `feat/crm-fase-4-calendario-tareas`):
   - [ ] Calendario Real (Google Calendar integration)
   - [ ] UI inline de tareas CRM en drawer del lead
   - [ ] Paginación server-side leads (>5,000)
   - [ ] Split `first_name` / `last_name` en `leads`
   - [ ] Alertas SLA via Brevo/Slack
2. **Backlog**: Sales Owners reales, programa de afiliados, Radar web, etc.

---

*Documento vivo. Actualizar cuando se migre una sección de demo → real.*
