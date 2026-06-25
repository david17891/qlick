# Masterclass Funnel Foundation (v0.6.0)

> **Fecha:** 2026-06-25
> **Estado:** Implementado en rama `feature/masterclass-funnel-foundation`. No mergeado a `main`.
> **Tag objetivo:** `v0.6.0-masterclass-funnel-foundation` (cuando se apruebe merge).

---

## Objetivo

Crear una masterclass/clase gratuita, publicarla, registrar personas
interesadas, convertirlas en leads reales y dar seguimiento desde el panel
admin. Primer paso de un funnel de adquisición sostenible para Qlick.

## Promesa de producto (visitante)

> "Entra a una landing → ve los detalles → se registra en 30 segundos → recibe
> confirmación por email → si asiste, el equipo de ventas le da seguimiento
> personalizado desde el panel admin."

## Flujo end-to-end

```
Visitante                          Landing pública                       Server Action (público)             Supabase (admin role)
   │                                    │                                       │                                    │
   │  GET /masterclass/clase-gratuita-marketing-digital                       │                                    │
   ├───────────────────────────────────►│                                       │                                    │
   │                                    │  server component                      │                                    │
   │                                    │  carga Masterclass publicada          │                                    │
   │                                    ├──────────────────────────────────────►│  SELECT masterclasses              │
   │                                    │◄─────────────────────────────────────┤  WHERE status='published'         │
   │                                    │                                       │                                    │
   │  render: título + form             │                                       │                                    │
   │◄──────────────────────────────────┤                                       │                                    │
   │                                    │                                       │                                    │
   │  POST submitMasterclassRegistration (server action)                       │                                    │
   ├───────────────────────────────────►├──────────────────────────────────────►│  1. buscar/crear lead              │
   │                                    │                                       ├───────────────────────────────────►│
   │                                    │                                       │  2. INSERT registration            │
   │                                    │                                       ├───────────────────────────────────►│
   │                                    │                                       │◄──────────────────────────────────┤
   │  render: confirmación              │                                       │                                    │
   │◄──────────────────────────────────┤                                       │                                    │

Admin                                                                                            Admin masterclass panel
   │                                                                                                     │
   │  GET /admin/masterclass                                                                             │
   ├──────────────────────────────────────────────────────────────────────────────────────────────────────►
   │                                                                                                     │
   │  GET /admin/masterclass/[id]                                                                        │
   ├──────────────────────────────────────────────────────────────────────────────────────────────────────►
   │                                                                                                     │
   │  Click "✓ Asistió" / "💡 Interesado" / "🎉 Convertido"                                              │
   ├──────────────────────────────────────────────────────────────────────────────────────────────────►
   │  adminUpdateRegistrationAction (server action protegido con requireAdmin)                            │
   │                                                                                                     │
   │                                                                                                  UPDATE registration
   │                                                                                                  SET attendance_status=...
```

## Tablas (Supabase)

### `public.masterclasses`

Catálogo público. Lectura pública solo para `status='published'`. Escritura
solo vía service role.

| Campo              | Tipo                  | Notas                                        |
|--------------------|-----------------------|----------------------------------------------|
| id                 | uuid PK               | gen_random_uuid()                            |
| slug               | text UNIQUE NOT NULL  | base de la URL pública                       |
| title              | text NOT NULL         |                                              |
| subtitle           | text NULL             | eslogan corto                                |
| description        | text NULL             | descripción larga                            |
| instructor_name    | text NULL             |                                              |
| starts_at          | timestamptz NULL      | cuándo inicia                                |
| duration_minutes   | integer NULL          |                                              |
| modality           | enum (online/in_person/hybrid) | default 'online'                     |
| location           | text NULL             | link de Zoom/Meet (online) o dirección       |
| cover_image_url    | text NULL             |                                              |
| status             | enum (draft/published/archived) | default 'draft'                     |
| cta_label          | text NOT NULL         | default 'Registrarme'                        |
| created_at         | timestamptz NOT NULL  | default now()                                |
| updated_at         | timestamptz NOT NULL  | trigger via set_updated_at()                 |

### `public.masterclass_registrations`

Registro de personas interesadas. **SIN acceso público directo** (RLS deny
para anon/authenticated). El registro siempre pasa por server action con
service role.

| Campo                | Tipo                  | Notas                                       |
|----------------------|-----------------------|---------------------------------------------|
| id                   | uuid PK               |                                             |
| masterclass_id       | uuid FK NOT NULL      | ON DELETE CASCADE                           |
| lead_id              | uuid FK NULL          | ON DELETE SET NULL — link opcional al lead  |
| name                 | text NOT NULL         |                                             |
| email                | text NOT NULL         |                                             |
| phone                | text NULL             |                                             |
| registration_status  | enum (registered/cancelled/no_show/attended) | default 'registered'    |
| attendance_status    | enum (pending/attended/no_show)             | default 'pending'        |
| commercial_status    | enum (new/interested/not_interested/converted/lost) | default 'new' |
| source               | text NOT NULL         | default 'masterclass'                       |
| utm_source           | text NULL             |                                             |
| utm_campaign         | text NULL             |                                             |
| consent_to_contact   | boolean NOT NULL      | default false — la política del server action exige true |
| registered_at        | timestamptz NOT NULL  | default now()                               |
| attended_at          | timestamptz NULL      | se rellena al marcar asistencia             |
| notes                | text NULL             |                                             |

## Reglas de seguridad

- **RLS activa** en ambas tablas.
- **masterclasses**:
  - SELECT público (`anon`, `authenticated`): `WHERE status = 'published'`.
  - INSERT/UPDATE/DELETE: solo service role (admin server-side).
- **masterclass_registrations**:
  - **SIN políticas públicas** → RLS default-deny para `anon` y `authenticated`.
  - El registro SIEMPRE pasa por un server action público con service role.
- **No se expone la `service_role` key al cliente**. Solo se usa server-side.
- **Consentimiento obligatorio**: el server action exige `consentToContact: true`
  antes de insertar (defensa en profundidad).
- **anon SELECT bloqueado**: aunque alguien sepa el endpoint, no puede listar
  registrations directo (probado vía RLS).

## Variables de entorno

No requiere vars nuevas. Usa las mismas que v0.5.1:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (service role)
- `SUPABASE_PROJECT_REF`

## Qué es real

- **Catálogo público de masterclasses** (lectura desde Supabase en realMode).
- **Registro de personas** (inserta lead real + masterclass_registration).
- **Vista admin** de masterclasses y registrados.
- **Acciones admin** sobre registrations: marcar asistencia, interés, conversión, cancelar.
- **Vinculación automática lead ↔ registration** (busca por email o crea lead).

## Qué sigue demo (no migrar ahora)

- **Notificaciones por email** post-registro (no hay SMTP configurado).
- **Replays / grabaciones** post-masterclass (la columna `attended_at` solo registra; el video no se sube).
- **Embudo de emails automatizado** (welcome, recordatorio 24h antes, post-asistencia).
- **Conversión a alumno** del LMS (no hay LMS real todavía — sigue siendo el de v0.4 con mock data).
- **Integración con WhatsApp Business API** (manual link via wa.me está OK; envío automático está en Fase 4).
- **CRUD completo desde admin** de masterclasses (hoy solo lectura; la creación de nuevas masterclasses se hace vía Supabase Dashboard/CLI).

## Checklist de prueba (manual)

### Landing pública
- [ ] Abrir `http://localhost:3000/masterclass/clase-gratuita-marketing-digital` → debe cargar con título, descripción y form.
- [ ] Banner "Modo demo" visible si Supabase NO está configurado.
- [ ] Submit del form → muestra confirmación.

### Persistencia
- [ ] Tras submit, ejecutar en Supabase SQL Editor:
      `SELECT count(*) FROM public.masterclass_registrations;`
- [ ] El count debe aumentar.
- [ ] `SELECT count(*) FROM public.leads;` también debe aumentar (o mantenerse si el email ya existía).

### Admin
- [ ] Login admin → ir a `/admin/masterclass` → debe listar la masterclass publicada.
- [ ] Click en "Ver detalle" → debe mostrar los registrados.
- [ ] Marcar "✓ Asistió" en un registro → el registro se actualiza.
- [ ] Marcar "💡 Interesado" → el registro se actualiza.

### RLS (no se puede romper desde el cliente)
- [ ] Abrir DevTools en una página pública → no se debe ver la `service_role` key.
- [ ] Intentar `fetch('https://<proyecto>.supabase.co/rest/v1/masterclass_registrations')` desde la consola del navegador → debe devolver 401/403 (RLS deny).

### Privacidad
- [ ] El form pide consentimiento con link a `/privacidad`.
- [ ] `consent_to_contact: true` se persiste en el registration.
- [ ] `consent_to_contact: true` se persiste en el lead vinculado.

## Próximos pasos (Fase 1 + Masterclass Funnel)

1. **David** aplica la migración `20260625130000_masterclass_funnel.sql` al proyecto Supabase.
2. **David** regenera el typegen: `npx supabase gen types typescript --linked > src/types/supabase.ts`.
3. **Verificación manual** del checklist de arriba con la BD real.
4. **Merge** de `feature/masterclass-funnel-foundation` a `main` después de validar.
5. **Próxima iteración**: CRUD admin de masterclasses (crear/editar/borrar desde el panel sin tocar SQL).

## Archivos del feature

```
supabase/migrations/20260625130000_masterclass_funnel.sql   # nueva migración
src/types/masterclass.ts                                    # tipos del dominio
src/types/supabase.ts                                       # + PLACEHOLDER (será regenerado)
src/lib/masterclasses/
  ├── index.ts                                              # fachada pública
  ├── masterclass-mapper.ts                                 # row → dominio
  ├── masterclasses-server.ts                               # lecturas
  └── registrations-server.ts                               # CRUD
src/app/
  ├── masterclass/[slug]/
  │   ├── page.tsx                                          # Server Component
  │   └── MasterclassView.tsx                               # Client Component (form)
  ├── admin/masterclass/
  │   ├── page.tsx                                          # lista
  │   └── [id]/
  │       ├── page.tsx                                      # detalle + registrados
  │       └── RegistrationActions.tsx                       # Client Component (botones)
  └── actions/
      ├── masterclass.ts                                    # Server Action público
      └── admin-masterclass.ts                              # Server Action admin
src/components/admin/AdminView.tsx                          # + link "🎓 Masterclasses →"
docs/
  ├── MASTERCLASS_FUNNEL_FOUNDATION.md                      # este doc
  ├── DECISIONS.md                                          # + D-019
  ├── ROADMAP.md                                            # + sección v0.6.0
  └── CRM_MODE_STATUS.md                                    # + masterclasses en tabla
```

## No se tocó

- Pagos (Fase 2)
- WhatsApp Business API (Fase 4)
- OpenRouter / LLM real (Fase 4)
- LMS real (Fase 1, separado)
- Radar web (Backlog)
- Conversaciones / Calendario / Agente IA (siguen demo — Fase 4)