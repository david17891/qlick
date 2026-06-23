# Supabase Real Foundation — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Rama:** `feature/supabase-leads-foundation`
**Base:** `main` @ `ca598a2` (tag `v0.3.0-supabase-bootstrap`)
**Estado:** primer vertical slice real de persistencia. **Sin proyecto Supabase creado todavía.**
Sin datos reales en disco todavía; la app sigue operando en modo demo salvo el
insert de leads, que cae a mock si Supabase no está configurado.

> Continúa la capa de [`SUPABASE_CONNECTION_BOOTSTRAP.md`](./SUPABASE_CONNECTION_BOOTSTRAP.md).
> Esta fase es **aditiva y tolerante a fallos**: si Supabase no está
> configurado, todo sigue funcionando con los mocks existentes.

---

## 1. ¿Qué es esta fase?

Es el **primer flujo real** que escribe en Supabase:

```
ContactForm (cliente)
   └─ submitLead (Server Action, src/app/actions/leads.ts)
        └─ createLead (src/lib/crm/leads-server.ts)
             └─ INSERT en public.leads (RLS activo, política de insert controlada)
```

Lo que antes era un lead demo en memoria ahora **persiste de verdad** cuando
Supabase está configurado, y cae a mock cuando no. La UI del formulario no
cambia su superficie; solo el backend decide real vs. demo.

---

## 2. Qué quedó REAL vs. MOCK

### ✅ REAL (cuando Supabase está configurado)

| Flujo | Detalle |
| ----- | ------- |
| **Insert de lead** | `ContactForm → submitLead → createLead → public.leads` con RLS. |
| **Consentimiento obligatorio** | Validado dos veces (cliente + server action + política SQL). |
| **Defensa en profundidad** | `consentToContact` check en `submitLead`, `createLead` y la política `leads_public_insert_form`. |

### 🟡 DORMIDO (construido pero inerte, seguro)

| Flujo | Detalle |
| ----- | ------- |
| **Lectura HTTP de leads** (`GET /api/admin/leads`) | Endpoint creado con `AUTH_READY = false`: devuelve 503 siempre. Sirve de andamiaje para Fase 1; **nunca** expone datos reales hoy. |

### 🔁 FALLBACK DEMO (sin Supabase configurado)

Todo el flujo anterior cae a `src/lib/crm/crm-service.ts` (mocks) con `demo: true`.
El formulario sigue mostrando "Modo demo" y el lead se registra en memoria.

### 🚫 SIGUE MOCK (sin cambios en esta fase)

- Lectura visual del CRM (`CRMView`, pipeline, conversaciones, calendario, agente IA, WhatsApp).
- Escritura del CRM (editar leads, mover pipeline, agendar).
- Todo el LMS (cursos, inscripciones, progreso, certificados).
- Pagos y facturación.
- Auth (sigue `NEXT_PUBLIC_AUTH_MODE=mock`, sesión en `localStorage`).
- Envío de email / WhatsApp reales.

---

## 3. Seguridad

- **RLS activo desde el día 1** en `public.leads` (ver migración).
- **INSERT público controlado**: la política `leads_public_insert_form` exige
  `consent_to_contact = true`, `status = 'new'`, nombre no vacío y email con
  formato. El server action fuerza estos valores antes de insertar.
- **SELECT/UPDATE/DELETE**: solo `authenticated` con `app_role` ∈ `admin`,
  `instructor` (vía JWT). El CRM admin lee server-side con service role
  (bypass de RLS) cuando se active la lectura.
- **Sin service role en cliente**: `createSupabaseAdminClient()` valida
  `typeof window` y lanza en el navegador (ver `src/lib/supabase/admin.ts`).
- **Regla "sin auth, sin datos reales expuestos"**: el endpoint
  `/api/admin/leads` está dormido (`AUTH_READY = false`) para no servir leads
  reales aunque Supabase esté configurado. Se activa en Fase 1 con middleware
  de admin.

---

## 4. Cómo activarlo (cuando exista proyecto Supabase)

1. Crear el proyecto Supabase (requiere confirmación explícita; posible costo).
2. Configurar `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`
   (ver `.env.example`).
3. Aplicar la migración:
   `supabase/migrations/20260623000001_init_leads.sql` (vía CLI/MCP o Dashboard).
4. Verificar con `npm run check:supabase` → debe reportar `configured`.
5. Enviar el formulario de contacto → el lead aparece en `public.leads`.

Para activar la **lectura** en el CRM (Fase 1, NO esta fase):
1. Implementar Supabase Auth + middleware de admin.
2. Añadir el check de sesión/rol dentro de `GET()` en
   `src/app/api/admin/leads/route.ts`.
3. Cambiar `AUTH_READY` a `true`.

---

## 5. Archivos clave de esta rama

| Archivo | Rol |
| ------- | --- |
| `supabase/migrations/20260623000001_init_leads.sql` | Schema `leads` + enums + RLS + políticas + trigger `updated_at`. |
| `src/lib/crm/leads-mapper.ts` | `LeadRow` (snake) ↔ `Lead` (camel). |
| `src/lib/crm/leads-server.ts` | `getLeads`/`getLeadById`/`createLead` async con fallback demo. Server-only. |
| `src/app/actions/leads.ts` | Server action `submitLead` (único punto de entrada público). |
| `src/app/api/admin/leads/route.ts` | Endpoint de lectura (dormido, `AUTH_READY=false`). |
| `src/components/contact/ContactForm.tsx` | Ahora llama a `submitLead`. |
| `src/lib/crm/index.ts` | Barrel; exporta `getLeadsAsync`/`getLeadByIdAsync` (renombra para no chocar con las síncronas de `crm-service`). |

---

## 6. Validación

Esta fase se valida con la suite existente (sin datos reales):

```
npm run lint
npm run type-check
npm run build
npm run audit:links
npm run check:supabase   # reporta "demo" hasta que exista proyecto
```

Todo debe quedar en verde. El build no debe sumar páginas estáticas por el
nuevo endpoint (`force-dynamic`).

---

## 7. Límites que se respetan

- No iniciar pagos. No WhatsApp API. No OpenRouter.
- No reemplazar todo el LMS. No migrar todo el CRM todavía.
- No subir secretos. No commitear `.env.local`.
- No `npm audit fix --force` (bumpa Next a 16, breaking).
- Stack fijo: Next 14.2.35 · React 18.3.1 · TS 5.5.3 · Tailwind 3.4.6.
- No crear proyecto Supabase sin confirmación explícita del usuario.
