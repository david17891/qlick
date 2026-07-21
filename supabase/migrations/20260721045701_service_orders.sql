-- ============================================================
-- 2026-07-21 — Sistema de pedidos de servicios (FASE 8B)
--
-- 6 tablas para gestionar el ciclo completo de un pedido de
-- servicio digital, desde el catálogo público hasta la entrega,
-- notas internas, timeline automático y documentos adjuntos.
--
-- Decisiones de diseño (alineadas con FASE 8 spec):
--
-- 1. Cada servicio es un producto independiente (NO variante de
--    un producto genérico). El catálogo se modela como
--    services + service_variants (1:N). Cada variant tiene su
--    propio precio y tiempo de entrega.
--
-- 2. Pedidos = service_orders. Cada pedido snapshot-ea los datos
--    del cliente (customer_name, customer_email, customer_phone)
--    para que la historia NO se rompa si el lead del CRM se borra
--    o se actualiza. lead_id es un FK opcional (ON DELETE SET NULL).
--
-- 3. Estados del pedido: pending_contact → contacted → confirmed
--    → in_progress → delivered → closed. Más cancelled (terminal).
--    Cada transición auto-loggea un evento en service_order_events.
--
-- 4. service_order_events = timeline append-only. Eventos de todo
--    tipo: cambios de estado, notas, emails enviados, WhatsApp,
--    pagos recibidos, documentos subidos, contacto con cliente.
--    actor_id + actor_type distinguen admin vs system vs customer.
--
-- 5. service_order_notes = notas internas. is_pinned para fijar
--    importantes. note_type para categorizar (general, blocker,
--    client_request, follow_up).
--
-- 6. service_order_documents = archivos. Cubre comprobantes de
--    pago, certificados, briefs, deliverables, contratos. URLs en
--    Supabase Storage (futuro) o externos. file_type como enum
--    flexible (text) para crecer sin migración.
--
-- 7. RLS:
--    - services + service_variants: lectura pública SOLO activos.
--    - service_orders + events + notes + documents: service-role
--      only. Todo el CRUD pasa por /api/admin/orders/* con admin
--      auth (ADMIN_EMAIL_ALLOWLIST).
--
-- 8. Extensibilidad desde día 1: cada tabla tiene timestamps
--    (created_at, updated_at) y mantiene payloads JSONB donde
--    aporta (events.payload, documents.description).
--
-- Idempotente: if not exists en tablas, drop+create en policies,
-- insert con on conflict do update para el seed.
-- ============================================================

-- ===========================================================
-- Tabla `public.services` — catálogo de servicios
-- ===========================================================
create table if not exists public.services (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  category            text not null default 'digital',  -- 'digital' | 'recurrent' | 'event' | 'course'
  display_name        text not null,
  short_description   text,
  long_description    text,
  icon                text,                              -- nombre de icono lucide (ej. 'Globe', 'Megaphone')
  default_price_mxn   numeric(10,2),
  default_currency    text not null default 'MXN',
  requires_scheduling boolean not null default false,
  requires_documents  boolean not null default false,
  deliverable_type    text,                              -- 'web_link' | 'pdf' | 'video' | 'in_person' | 'live_session'
  is_active           boolean not null default true,
  display_order       integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists services_is_active_order_idx
  on public.services (is_active, display_order);
create index if not exists services_category_idx
  on public.services (category);

comment on table public.services is
  'Catálogo público de servicios que ofrece Qlick (Esencial/Profesional, Auditoría 1a1, Kickstart Meta Ads, etc.). Lectura pública solo para activos. Escritura solo via service role.';

alter table public.services enable row level security;

drop policy if exists "services_public_read_active" on public.services;
create policy "services_public_read_active"
  on public.services for select
  to anon, authenticated
  using (is_active = true);

-- ===========================================================
-- Tabla `public.service_variants` — packages/precios por servicio
-- ===========================================================
create table if not exists public.service_variants (
  id                  uuid primary key default gen_random_uuid(),
  service_id          uuid not null references public.services(id) on delete cascade,
  slug                text not null,
  label               text not null,
  description         text,
  price_mxn           numeric(10,2) not null,
  delivery_days_min   integer,
  delivery_days_max   integer,
  is_active           boolean not null default true,
  display_order       integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (service_id, slug)
);

create index if not exists service_variants_service_id_idx
  on public.service_variants (service_id);
create index if not exists service_variants_service_active_idx
  on public.service_variants (service_id, is_active, display_order);

comment on table public.service_variants is
  'Variantes/paquetes de cada servicio. Ej: Sitio Web tiene Esencial/Profesional, Auditoría 1a1 tiene Zoom/Presencial. Lectura pública solo si la variante y el service padre están activos.';

alter table public.service_variants enable row level security;

drop policy if exists "service_variants_public_read" on public.service_variants;
create policy "service_variants_public_read"
  on public.service_variants for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.services s
      where s.id = service_variants.service_id
        and s.is_active = true
    )
  );

-- ===========================================================
-- Tabla `public.service_orders` — pedidos de servicio
-- ===========================================================
create table if not exists public.service_orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text unique not null,  -- 'QO-2026-0001' para tracking humano
  lead_id             uuid references public.leads(id) on delete set null,
  service_id          uuid not null references public.services(id) on delete restrict,
  variant_id          uuid not null references public.service_variants(id) on delete restrict,
  -- Snapshot del cliente (no se borra si el lead se actualiza/se elimina)
  customer_name       text not null,
  customer_email      text not null,
  customer_phone      text,
  customer_notes      text,
  -- Pago
  amount_mxn          numeric(10,2) not null,
  currency            text not null default 'MXN',
  status              text not null default 'pending_contact',  -- 'pending_contact'|'contacted'|'confirmed'|'in_progress'|'delivered'|'closed'|'cancelled'
  payment_mode        text not null default 'pending',          -- 'pending'|'test'|'stripe'|'manual'|'free'
  payment_reference   text,                                     -- stripe_session_id, etc.
  -- Logística
  scheduled_at        timestamptz,                               -- para servicios con requires_scheduling
  assigned_to         text,                                     -- email del admin responsable
  -- Cierre
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint service_orders_status_check check (status in (
    'pending_contact', 'contacted', 'confirmed', 'in_progress', 'delivered', 'closed', 'cancelled'
  )),
  constraint service_orders_payment_mode_check check (payment_mode in (
    'pending', 'test', 'stripe', 'manual', 'free'
  ))
);

create index if not exists service_orders_lead_id_idx       on public.service_orders (lead_id);
create index if not exists service_orders_status_idx        on public.service_orders (status);
create index if not exists service_orders_created_at_idx    on public.service_orders (created_at desc);
create index if not exists service_orders_service_id_idx   on public.service_orders (service_id);
create index if not exists service_orders_variant_id_idx   on public.service_orders (variant_id);

comment on table public.service_orders is
  'Pedidos de servicio. CRUD solo via service role (admin). El cliente snapshot-ea sus datos al crear el pedido, así que borrar el lead NO rompe la historia.';

alter table public.service_orders enable row level security;
-- (No public policies. Todo CRUD via service role.)

-- ===========================================================
-- Tabla `public.service_order_events` — timeline append-only
-- ===========================================================
create table if not exists public.service_order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.service_orders(id) on delete cascade,
  type        text not null,                    -- 'status_change'|'note'|'email_sent'|'whatsapp_sent'|'payment_received'|'document_uploaded'|'customer_contact'
  actor_id    text,                             -- user_id del admin, o 'system', o email del customer
  actor_type  text not null default 'admin',    -- 'admin'|'system'|'customer'
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists service_order_events_order_id_idx       on public.service_order_events (order_id, created_at desc);
create index if not exists service_order_events_type_idx           on public.service_order_events (type);

comment on table public.service_order_events is
  'Timeline append-only de eventos del pedido. Cambios de estado, notas, emails, WhatsApp, pagos, documentos, contacto. Auto-loggear transiciones desde triggers o service role.';

alter table public.service_order_events enable row level security;
-- (No public policies. Lectura via service role en el admin panel.)

-- ===========================================================
-- Tabla `public.service_order_notes` — notas internas
-- ===========================================================
create table if not exists public.service_order_notes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.service_orders(id) on delete cascade,
  author_id   text,                              -- user_id del admin
  body        text not null,
  note_type   text not null default 'general',   -- 'general'|'client_request'|'blocker'|'follow_up'
  is_pinned   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint service_order_notes_type_check check (note_type in (
    'general', 'client_request', 'blocker', 'follow_up'
  ))
);

create index if not exists service_order_notes_order_id_idx
  on public.service_order_notes (order_id, is_pinned desc, created_at desc);

comment on table public.service_order_notes is
  'Notas internas del pedido. is_pinned para fijar importantes. note_type categoriza el tipo de nota (general, blocker, client_request, follow_up). Solo visibles para admins.';

alter table public.service_order_notes enable row level security;
-- (No public policies. CRUD via service role.)

-- ===========================================================
-- Tabla `public.service_order_documents` — archivos del pedido
-- ===========================================================
create table if not exists public.service_order_documents (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.service_orders(id) on delete cascade,
  uploaded_by     text,                          -- user_id del admin o 'customer'
  file_name       text not null,
  file_url        text not null,                  -- URL en Supabase Storage o externo
  file_type       text not null default 'other', -- 'receipt'|'certificate'|'brief'|'deliverable'|'contract'|'other'
  file_size_bytes bigint,
  mime_type       text,
  description     text,
  created_at      timestamptz not null default now(),
  constraint service_order_documents_type_check check (file_type in (
    'receipt', 'certificate', 'brief', 'deliverable', 'contract', 'other'
  ))
);

create index if not exists service_order_documents_order_id_idx      on public.service_order_documents (order_id);
create index if not exists service_order_documents_order_type_idx    on public.service_order_documents (order_id, file_type);

comment on table public.service_order_documents is
  'Documentos del pedido: comprobantes de pago, certificados, briefs, deliverables, contratos. file_url apunta a Supabase Storage o un link externo. CRUD via service role.';

alter table public.service_order_documents enable row level security;
-- (No public policies. CRUD via service role.)

-- ===========================================================
-- Triggers updated_at (re-usan public.set_updated_at())
-- ===========================================================
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
  before update on public.services
  for each row
  execute function public.set_updated_at();

drop trigger if exists service_variants_set_updated_at on public.service_variants;
create trigger service_variants_set_updated_at
  before update on public.service_variants
  for each row
  execute function public.set_updated_at();

drop trigger if exists service_orders_set_updated_at on public.service_orders;
create trigger service_orders_set_updated_at
  before update on public.service_orders
  for each row
  execute function public.set_updated_at();

drop trigger if exists service_order_notes_set_updated_at on public.service_order_notes;
create trigger service_order_notes_set_updated_at
  before update on public.service_order_notes
  for each row
  execute function public.set_updated_at();

-- ===========================================================
-- Seed inicial: 3 servicios digitales con sus variants
-- ===========================================================
-- El seed es idempotente (ON CONFLICT DO UPDATE) para que re-correr
-- la migration actualice descripciones/precios sin duplicar filas.

insert into public.services (
  slug, category, display_name, short_description, long_description, icon,
  default_price_mxn, deliverable_type, display_order
) values
  (
    'sitio-web', 'digital',
    'Sitio Web Express',
    'Una página web que se ve profesional y convierte visitas en clientes.',
    'Diseñamos y publicamos tu sitio web en días, no semanas. Ideal para arrancar tu presencia online con todo lo esencial: diseño responsive, formulario de contacto, SEO básico y dominio/hosting configurados.',
    'Globe', 2500, 'web_link', 1
  ),
  (
    'auditoria-1a1', 'digital',
    'Auditoría & Diagnóstico 1a1',
    'Una llamada honesta con un estratega senior para revisar tu marketing y decirte qué arreglar primero.',
    'Sesión 1 a 1 con un experto que revisa tu situación actual (web, redes, pauta, CRM) y te entrega un plan priorizado de 90 días con acciones concretas y ordenadas por impacto.',
    'ClipboardCheck', 1000, 'live_session', 2
  ),
  (
    'kickstart-meta-ads', 'digital',
    'Kickstart de Meta Ads',
    'Campaña lista para lanzar en Meta con video, copy y segmentación optimizados.',
    'Armamos tu primera campaña de Meta Ads (Facebook + Instagram) con creatividades, copies, audiencias y configuración de píxel lista para escalar desde el día uno.',
    'Megaphone', 2500, 'video', 3
  )
on conflict (slug) do update set
  display_name      = excluded.display_name,
  short_description = excluded.short_description,
  long_description  = excluded.long_description,
  icon              = excluded.icon,
  default_price_mxn = excluded.default_price_mxn,
  deliverable_type  = excluded.deliverable_type,
  display_order     = excluded.display_order,
  is_active         = true,
  updated_at        = now();

-- Variants de los 3 servicios
insert into public.service_variants (
  service_id, slug, label, description, price_mxn,
  delivery_days_min, delivery_days_max, display_order
)
select s.id, v.slug, v.label, v.description, v.price_mxn,
       v.delivery_days_min, v.delivery_days_max, v.display_order
from public.services s
join (values
  -- Sitio Web
  ('sitio-web', 'esencial',    'Esencial',                 '5 secciones, formulario de contacto, diseño responsive, SEO básico, dominio y hosting configurados.', 2500, 2, 3, 1),
  ('sitio-web', 'profesional', 'Profesional',              'Todo Esencial + blog con 3 artículos, integración con WhatsApp, analytics avanzado y copy persuasivo en cada sección.', 5500, 5, 7, 2),
  -- Auditoría
  ('auditoria-1a1', 'zoom',         'Por Zoom (1h)',     'Sesión 1h por videollamada con grabación y plan priorizado de 90 días por escrito.', 1000, 1, 1, 1),
  ('auditoria-1a1', 'presencial',   'Presencial (SLR/MXL)','Sesión 1h presencial en San Luis Río Colorado o Mexicali, con plan impreso y coffee break.', 2000, 1, 1, 2),
  -- Kickstart Meta Ads
  ('kickstart-meta-ads', 'videoia',         'Con Video IA',         '1 video IA de 30s + 2 copies para anuncios + 1 set de audiencias + setup de píxel.', 2500, 2, 3, 1),
  ('kickstart-meta-ads', 'video-personas',  'Con Video Personas',   '1 video con actores reales + 2 copies para anuncios + 1 set de audiencias + setup de píxel.', 3500, 2, 3, 2)
) as v(service_slug, slug, label, description, price_mxn, delivery_days_min, delivery_days_max, display_order)
  on v.service_slug = s.slug
on conflict (service_id, slug) do update set
  label             = excluded.label,
  description       = excluded.description,
  price_mxn         = excluded.price_mxn,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  display_order     = excluded.display_order,
  is_active         = true,
  updated_at        = now();
