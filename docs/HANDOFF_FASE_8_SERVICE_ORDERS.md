# FASE 8 — Sistema integral de pedidos de servicios

> Handoff canónico del sprint de servicios digitales. Cierra el gap que dejó
> la landing de `/diseno-paginas` (que mostraba paquetes pero no tenía
> flujo de checkout real) y abre la plataforma a la facturación de servicios
> profesionales de Qlick.
>
> **Cuándo leerlo:** al retomar la plataforma después de esta sesión,
> cuando se agreguen features sobre el sistema de pedidos, o cuando se
> integre Stripe real en el próximo sprint.
>
> **Última actualización:** 2026-07-21 06:00 — sprint cerrado, push
> `e9689c7..76ca9ad` en `main`. 14 commits atómicos, 1480/1480 tests
> verde, type-check 0, lint 0/0, build OK. Catalog E2E verificado contra
> prod: cliente llena form en `/servicios/sitio-web` → POST
> `/api/services/checkout` → 200 con `order_number: QO-2026-0001` → fila
> en DB con `status: pending_contact` → email Brevo al admin.

---

## TL;DR — Lo que ahora puede hacer Qlick end-to-end

| Actor | Antes | Ahora |
|---|---|---|
| **Cliente final** | Tenía que escribir WhatsApp o ir a `/diseno-paginas` (que era landing sin checkout) | Va a `/servicios` → elige servicio → ve paquetes → click "Lo quiero" → modal con form → submit → recibe número de pedido + WhatsApp de contacto |
| **Admin (David)** | Tenía que leer WhatsApp, armar pedido a mano en Excel, cobrar por transferencia | Ve todos los pedidos en `/admin` → tab "Pedidos" → drawer con 5 tabs (Info/Cliente/Notas/Documentos/Timeline) → cambia status, asigna responsable, sube comprobantes, agrega notas internas |
| **CRM** | El lead y el pedido vivían en mundos separados | El `LeadDetailDrawer` muestra "Servicios contratados" con total gastado, click en row abre el mismo drawer de gestión del admin |

---

## Arquitectura

### Decisión de modelo: cada servicio es un producto independiente

NO se modeló como "producto genérico con variants" (estilo Shopify).
Se modeló como **`services` (1) + `service_variants` (N)** porque:

- Cada servicio tiene su propio set de variants (Esencial/Profesional,
  Zoom/Presencial, VideoIA/VideoPersonas).
- Las variants son **parte del catálogo público**, no opciones de
  compra de un producto genérico. Un cliente en `/servicios/sitio-web`
  elige entre Esencial y Profesional; en `/servicios/auditoria-1a1`
  elige entre Zoom y Presencial. Mismo componente (`ServiceCard`),
  distinto set de variants.
- Permite agregar tipos nuevos (recurrent, course, event) sin tocar
  el modelo de products.
- Extensible: notas, certificados, comprobantes, timeline events son
  **tablas separadas** desde día 1, no metadatos genéricos.

### Diagrama lógico

```
                        ┌─────────────┐
                        │  services   │ (catálogo público, RLS is_active)
                        └──────┬──────┘
                               │ 1:N
                        ┌──────┴──────┐
                        │service_var. │ (precios, tiempos entrega)
                        └──────┬──────┘
                               │ 1:N
                        ┌──────┴──────┐
                        │service_ord. │ (1 lead → N orders via FK)
                        └─┬──┬──┬────┘
              ┌───────────┘  │  └───────────┐
              │              │              │
       ┌──────┴────┐ ┌───────┴────┐ ┌───────┴────────┐
       │  events   │ │   notes    │ │  documents    │
       │ (timeline)│ │ (internas) │ │ (comprobantes)│
       └───────────┘ └────────────┘ └────────────────┘
```

### Estados del pedido (state machine)

```
pending_contact → contacted → confirmed → in_progress → delivered → closed
                                                                  ↘ cancelled (terminal)
```

- `pending_contact` (default al crear) — admin lo lee y contacta al cliente
- `contacted` — admin habló con el cliente
- `confirmed` — admin confirmó el alcance y el precio
- `in_progress` — trabajo en curso
- `delivered` — producto entregado al cliente (auto-set `delivered_at`)
- `closed` — ciclo cerrado
- `cancelled` — terminal (auto-set `cancelled_at` + razón)

Cada transición se auto-loggea en `service_order_events` con
`{from, to}` en el payload. El cliente final **NO** ve este state
machine — solo recibe un email de "tu pedido está en proceso" cuando
el admin avanza a `confirmed` (FASE 8+ futuro).

### Por qué `pending_contact` y NO `confirmed` por default

Decisión explícita (vs el flow estándar de e-commerce donde el pago
= confirmación):

1. **Auditoría 1a1** es un servicio que requiere agendar — el admin
   tiene que coordinar disponibilidad antes de confirmar.
2. **Servicio digital** puede requerir un brief inicial que el admin
   valida (ej. cliente pide "diseño de página" pero su negocio no
   encaja con el paquete).
3. **Anti-fraude**: si David pasa a Stripe real en el futuro, los
   pagos con tarjeta de prueba NO deben generar orders `confirmed`
   sin que David valide el alcance.

El admin confirma manualmente desde el panel. Esa es la decisión de
diseño que evita pedidos que se cobran solos.

---

## Schema (migration `20260721045701_service_orders.sql`)

6 tablas con RLS, índices, triggers de `updated_at` y seed inicial.

### `services` — Catálogo público

```sql
id, slug, category, display_name, short_description, long_description,
icon, default_price_mxn, default_currency, requires_scheduling,
requires_documents, deliverable_type, is_active, display_order,
created_at, updated_at
```

- `category` (text): `digital | recurrent | event | course` (text para
  flexibilidad, no enum cerrado).
- `icon` (text): nombre de icono Lucide (`Globe`, `ClipboardCheck`,
  `Megaphone`). Resuelto en runtime via map cerrado en
  `src/components/services/ServiceIcon.tsx`.
- `is_active` (boolean): RLS público solo si `true`.
- `deliverable_type` (text): `web_link | pdf | video | in_person |
  live_session` — qué tipo de artefacto se entrega.

**RLS:** lectura pública solo `is_active=true`. Escritura solo
service role (admin).

### `service_variants` — Packages por servicio

```sql
id, service_id (FK), slug, label, description, price_mxn,
delivery_days_min, delivery_days_max, is_active, display_order,
created_at, updated_at, UNIQUE(service_id, slug)
```

- `slug` (text): `esencial | profesional | zoom | presencial |
  videoia | video-personas`. El seed usa estos.
- `delivery_days_min/max` (int): rango de tiempo de entrega.
  `null` significa "no definido" (ej. auditoría 1a1 = 1 día).

**RLS:** lectura pública solo si variant Y service padre están
activos. Escritura service role.

### `service_orders` — Pedidos

```sql
id, order_number, lead_id (FK nullable), service_id (FK),
variant_id (FK), customer_name, customer_email, customer_phone,
customer_notes, amount_mxn, currency, status, payment_mode,
payment_reference, scheduled_at, assigned_to, delivered_at,
cancelled_at, cancellation_reason, created_at, updated_at
```

- `order_number` (text unique): human-readable `QO-YYYY-NNNN`
  generado con seq atómico (SELECT MAX LIKE).
- `customer_*` (text): **snapshot** del cliente. NO se borra si el
  lead se actualiza o se borra (ON DELETE SET NULL en `lead_id`).
- `status` (text + CHECK 7 valores): el state machine.
- `payment_mode` (text + CHECK 5 valores): `pending | test | stripe
  | manual | free`.
- `payment_reference` (text nullable): `stripe_session_id` u otro
  ID externo.
- `scheduled_at` (timestamptz nullable): para servicios con
  `requires_scheduling` (auditoría 1a1).
- `assigned_to` (text nullable): email del admin responsable.

**RLS:** service-role only. Todo CRUD via `/api/admin/orders/*`.

### `service_order_events` — Timeline append-only

```sql
id, order_id (FK), type, actor_id, actor_type, payload (jsonb),
created_at
```

- `type` (text): `status_change | note | email_sent | whatsapp_sent
  | payment_received | document_uploaded | customer_contact`.
- `actor_type` (text): `admin | system | customer`.
- `payload` (jsonb): shape libre por type. Ej: `{from, to}` para
  `status_change`, `{note_id, note_type}` para `note`,
  `{document_id, file_type}` para `document_uploaded`.

**RLS:** service-role only. Lectura via drawer admin.

### `service_order_notes` — Notas internas

```sql
id, order_id (FK), author_id, body, note_type, is_pinned,
created_at, updated_at
```

- `note_type` (text + CHECK 4 valores): `general | client_request
  | blocker | follow_up`.
- `is_pinned` (boolean): orden de display (pinned first).

**RLS:** service-role only.

### `service_order_documents` — Archivos adjuntos

```sql
id, order_id (FK), uploaded_by, file_name, file_url, file_type,
file_size_bytes, mime_type, description, created_at
```

- `file_type` (text + CHECK 6 valores): `receipt | certificate |
  brief | deliverable | contract | other`.
- `file_url` (text): URL en Supabase Storage o externo. **El
  endpoint NO sube el archivo**, el caller lo sube aparte y pasa
  la URL final.

**RLS:** service-role only.

### Triggers `set_updated_at`

Las 4 tablas mutables (services, variants, orders, notes) usan
`public.set_updated_at()` (helper de la migration de leads).

### Seed inicial (idempotente, ON CONFLICT DO UPDATE)

3 servicios × 6 variants:

| Servicio | Variants | Precios |
|---|---|---|
| Sitio Web Express | Esencial / Profesional | $2,500 / $5,500 MXN |
| Auditoría & Diagnóstico 1a1 | Zoom / Presencial (SLR/MXL) | $1,000 / $2,000 MXN |
| Kickstart de Meta Ads | Video IA / Video Personas | $2,500 / $3,500 MXN |

Aplicada a prod via Management API (status 201).

---

## APIs REST (6 endpoints)

### `GET /api/services/catalog` (público)

Devuelve `services` activos con sus `variants` activas. RLS ya filtra
por `is_active=true`. Rate limit: ninguno (read público cheap).

### `POST /api/services/checkout` (público)

Crea un order desde el form público.

- **Rate limit:** 5 req/min per IP (`lib/api/rate-limit.ts`, mismo
  helper que `create-checkout` de cursos/eventos).
- **Body:** `{ serviceSlug, variantSlug, customerName, customerEmail,
  customerPhone?, customerNotes?, paymentMode?, scheduledAt? }`.
- **Validación server-side:**
  - Service + variant existen y están activos.
  - `customerName` + `customerEmail` requeridos.
  - Email formato regex básico (no RFC completo, defense vs basura obvia).
  - Si `service.requiresScheduling === true`, `scheduledAt` obligatorio.
- **Genera `order_number` atómico** con SELECT MAX LIKE sobre el año.
- **Auto-log:** evento `customer_contact` en la timeline con
  `{source: 'checkout', customer_name, customer_email}`.
- **Best-effort email** al admin vía Brevo (fire-and-forget, no rompe
  el flow principal).

### `GET/POST /api/admin/orders` (admin)

- **GET**: lista con filtros (`status` CSV, `serviceId`, `leadId`, `q`
  búsqueda libre, `limit`/`offset`). Devuelve `ServiceOrderListItem[]`
  con `serviceName`, `serviceSlug`, `variantLabel`, `variantSlug`
  hidratados via INNER JOIN (sin N+1).
- **POST**: crea order manual con `actor=admin.email`. Útil cuando
  el cliente pagó por transferencia y David lo carga a mano.

### `GET/PATCH/DELETE /api/admin/orders/[id]` (admin)

- **GET**: detalle con `service` + `variant` + `events` + `notes` +
  `documents` hidratados en paralelo (`Promise.all`).
- **PATCH**: actualiza cualquier subset de `{status, paymentMode,
  paymentReference, scheduledAt, assignedTo, customerNotes,
  cancellationReason}`. Auto-logs:
  - `status_change` con `{from, to}` si cambió status.
  - `note` con `kind: 'assignment'` si cambió `assignedTo`.
  - Si `status=delivered`, auto-setea `delivered_at=now()`.
  - Si `status=cancelled`, auto-setea `cancelled_at=now()` +
    `cancellation_reason`.
- **DELETE**: soft delete. Marca `status=cancelled` con razón
  "Pedido eliminado por {admin_email}" + evento `status_change` con
  `kind: 'soft_delete'`. **NO** se borra físicamente.

### `GET/POST /api/admin/orders/[id]/notes` (admin)

- **GET**: lista de notas, pinned first.
- **POST**: crea nota + auto-log de `note`.

### `GET/POST /api/admin/orders/[id]/documents` (admin)

- **GET**: lista de documentos, recientes first.
- **POST**: crea documento (URL) + auto-log de `document_uploaded`.
  El archivo NO se sube — el caller (panel admin) lo sube a
  Supabase Storage o externo y pasa la URL.

### Patrón de auth (todos los admin endpoints)

```ts
const admin = await requireAdmin();
if (!admin) return NextResponse.json({...}, { status: 401 });
```

Mismo `requireAdmin()` que el resto de `/api/admin/*`. Lee
`ADMIN_EMAIL_ALLOWLIST` y valida contra el email del session.

---

## UI pública (FASE 8D)

### `/servicios` (catálogo)

Server Component que llama a `getActiveServices()`. Renderiza grid
de 1/2/3 cols responsive con `ServiceCard`. Empty state con mensaje
"pronto publicaremos los servicios" si no hay activos.

**`ServiceCard`** (`src/components/services/ServiceCard.tsx`):

- Header con brand-gradient + icono Lucide en glass (`bg-white/15
  backdrop-blur-sm`).
- Badge con N paquetes en top-right.
- displayName + shortDescription (line-clamp 3).
- Precio "desde" calculado de la variant más barata.
- CTA "Ver paquetes →" con hover effect.

### `/servicios/[slug]` (detalle)

Server Component que llama a `getServiceBySlug()`. Renderiza:

- `PageHero` variant `gradient` con icono grande + título + stats.
- Descripción larga en sección centrada.
- `ServiceDetailInteractive` con grid de `VariantCard` (1/2/3 cols
  según N variants).
- CTABanner subtle "¿Tienes dudas?" con WhatsApp + "Ver todos".

**`VariantCard` heurística featured:** el variant con label que
matchea `/profesional|personas|completo/` se marca con badge "Más
elegido" y botón accent. Esto mapea el seed actual (Esencial vs
Profesional, VideoIA vs VideoPersonas).

**`ServiceCheckoutModal`** (`ServiceCheckoutModal.tsx`):

- Form con: nombre, email, WhatsApp, notas.
- Si `service.requiresScheduling`, input `datetime-local`.
- Submit: POST a `/api/services/checkout` (no server action — JSON
  in/out más claro para el flow).
- Vista de éxito: número de pedido + WhatsApp de contacto + link
  al panel admin.
- Reset state al cerrar (delay 200ms para que no se vea el cambio
  durante la animación de salida).

### Paleta y tuteo

- Brand: magenta/purple (`#AB3FEA` primary, `#EF9F08` accent).
- Tuteo consistente: "Lo quiero", "Mándanos WhatsApp", "te avisamos".
- Sin jerga: "tu página para que te encuentren" en lugar de
  "SEO on-page". Aplica a TODO el copy visible.

---

## UI admin (FASE 8E)

### Tab "Pedidos" en `/admin`

Wire en `AdminView.tsx`:

- Type `Tab` extendido con `"pedidos"`.
- Tab `ShoppingBag` (lucide) entre "Pagos" y "CRM".
- Renderiza `<OrdersTab />`.

### `OrdersTab` (lista)

- Header con total de pedidos + botón "Refrescar".
- Filtros: input de búsqueda libre (q en name/email/phone) +
  pills de status (Todos, Pendiente contacto, Contactado, etc.).
- Tabla: order_number (mono), cliente (name + email), servicio +
  variant, monto, status (Badge), payment_mode, creado (date).
- Click en row → abre `OrderDetailDrawer`.
- Empty state cuando no hay orders.
- Loading con spinner grande.

### `OrderDetailDrawer` (5 tabs internos)

Drawer right-side (compartido con `LeadDetailDrawer`) con:

1. **Info** — Cambiar status (solo transiciones válidas del state
   machine), asignar responsable, cancelar con razón, metadata
   (creado/editado/agendado/entregado/cancelado).
2. **Cliente** — Datos + links `mailto`/`tel`/`wa.me` + notas del
   cliente + razón de cancelación si aplica.
3. **Notas** — Lista (pinned first) + form (body, type, isPinned).
4. **Documentos** — Lista + form (URL, type, descripción). El
   caller sube el archivo aparte.
5. **Timeline** — Feed cronológico inverso con icono según type
   + payload JSON.

State machine en `InfoTab` solo muestra transiciones válidas:

```
pending_contact → [contacted, confirmed, cancelled]
contacted       → [confirmed, in_progress, cancelled]
confirmed       → [in_progress, cancelled]
in_progress     → [delivered, cancelled]
delivered       → [closed]
closed          → []
cancelled       → []
```

### `LeadDetailDrawer` del CRM (FASE 8F)

Nueva card "Servicios contratados" justo después de "Riesgo de
respuesta". Muestra:

- Total de pedidos + total gastado (suma de no cancelados).
- Lista de orders con order_number (mono), service + variant,
  status (Badge), monto, fecha.
- Click en row → abre `OrderDetailDrawer` (mismo componente).
- Empty state con "Cuando el lead complete el formulario de un
  servicio en `/servicios/[slug]`, el pedido aparece acá."

---

## Tests

8 tests nuevos en `tests/services-orders.test.mjs` (1473 → 1480):

- 4 grupos de labels (status, payment_mode, note_type, document_type).
- `mapServiceOrderRow` con `numeric(10,2)` string → number.
- `mapServiceOrderEventRow` con payload object → Record + null/array → {}.

El test E2E del checkout (cliente → form → order real) se hace
contra prod via curl (no en suite unitaria). El patrón:

```bash
node --env-file=.env.local -e "
fetch('https://qlick.digital/api/services/checkout/', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    serviceSlug: 'sitio-web', variantSlug: 'esencial',
    customerName: 'Test E2E', customerEmail: 'test-e2e@example.com',
    paymentMode: 'test'
  })
}).then(r => r.json()).then(console.log)"
# → { ok: true, orderNumber: 'QO-2026-0001', order: {...} }
```

---

## Verificación global

| Check | Resultado |
|---|---|
| `npm run type-check` | 0 errores |
| `npm run lint` | 0 warnings |
| `npm test` | 1480/1480 verde |
| `npm run build` | Compiled successfully (rutas nuevas: `/servicios`, `/servicios/[slug]`, 6 APIs) |
| Migration aplicada | Management API status 201 |
| Catalog E2E | `GET /api/services/catalog` → 200 con 3 services + 6 variants |
| Checkout E2E | `POST /api/services/checkout` con payload válido → 200, order `QO-2026-0001` creado, después limpiado |
| Deploy Vercel | `https://qlick.digital` → 200 OK |

---

## Commits del sprint (14)

```
e9689c7 (HEAD anterior)  feat(admin): FASE 7D-1 — AdminView + CRMView con Lucide
94ae704 chore(cleanup): remove old /servicios/web routes migrated to /diseno-paginas
94ae704 feat(design): FASE 8A — WhatsApp directo + cursos 'próximamente'
7a446dd feat(db): FASE 8B — service_orders system schema + 3 services seed
5bacc16 feat(services): FASE 8C-1 — types + mappers + lib server
5bacc16 feat(services): FASE 8C-2 — APIs REST + email Brevo + tests
5e56eea feat(services): FASE 8D — UI pública /servicios + modal checkout
fd0f2ff feat(admin): FASE 8E — tab Pedidos + OrderDetailDrawer
76ca9ad feat(crm): FASE 8F — LeadServicesCard en LeadDetailDrawer
```

Logs detallados de cada fase en `data/PROJECT-LOG.md`.

---

## Pendientes (siguientes sprints)

### No bloqueantes (en backlog)

1. **Email al cliente** cuando admin confirma el order (`status →
   confirmed`). Hoy solo se manda email al admin. El cliente recibe
   el "lo quiero" → modal success con número de pedido, pero no
   recibe un email de seguimiento.

2. **Integración con Stripe real** (test mode hoy; live pendiente).
   - El endpoint `/api/services/checkout` actualmente crea el
     order con `paymentMode='pending'` por default.
   - Cuando se integre Stripe: agregar `paymentMode='stripe'` →
     crear Checkout Session → redirigir → webhook actualiza order
     a `confirmed` + `payment_reference=stripe_session_id`.
   - El patrón está en `src/app/api/payments/create-checkout/route.ts`
     (cursos/eventos) — reusar la misma infra de provider.

3. **Auto-link lead ↔ order**: hoy un order puede venir con
   `lead_id` (FK) si el caller lo pasa, pero el form público
   nunca lo pasa. Cuando el bot ya tiene un lead con el mismo
   email del checkout, **asociar automáticamente** vía email
   match en `createOrder` server-side.

4. **Filtros adicionales en `/servicios`**: categoría, rango de
   precio, `requiresScheduling` (para "solo agendamiento"). El
   MVP muestra todos los servicios sin filtros.

5. **Storage en Supabase** para el upload de documentos. Hoy
   el caller sube el archivo aparte. Cuando se integre, agregar
   endpoint `POST /api/admin/orders/[id]/upload-document` que
   recibe `multipart/form-data` y sube a `service-order-docs/`
   bucket.

6. **Tag/label de WhatsApp follow-up** desde el admin. Cuando
   David quiere mandar un WhatsApp al cliente del order, debería
   poder loggear el outbound en `service_order_events` con
   `type='whatsapp_sent'`. Hoy se hace por separado en
   `lead_whatsapp_log` (cuando el order tiene `lead_id` linkeado).

### Decisiones que NO se tomaron (para discutir con David)

- **¿El order es público o solo del admin?** Hoy la confirmación
  al cliente es via modal. ¿Quiere David que el cliente reciba
  un email automático al confirmar? (Sí, recomendado.)
- **¿Multi-currency?** Schema usa `currency` (default `MXN`)
  pero no hay UI para cambiar. ¿Qlick vende también en USD?
- **¿Descuentos/cupones?** No hay sistema. Si David quiere
  cupones para influencers, agregar tabla `service_coupons` +
  aplicar en `createOrder`.
- **¿Servicios recurrentes (membresías)?** Schema soporta
  `category='recurrent'` pero no hay UI ni billing recurrente.
  Sprint aparte cuando se decida el producto.

---

## Archivos clave (para próximas sesiones)

```
src/types/services.ts                    # tipos de dominio + labels
src/lib/services/mappers.ts              # snake_case → camelCase
src/lib/services/orders-server.ts        # CRUD server-only
src/lib/services/index.ts                # barrel

src/app/servicios/layout.tsx             # layout público
src/app/servicios/page.tsx               # listado
src/app/servicios/[slug]/page.tsx        # detalle

src/components/services/ServiceCard.tsx           # card del listado
src/components/services/ServiceIcon.tsx           # map name → icon
src/components/services/ServiceDetailInteractive.tsx  # grid variants + modal
src/components/services/ServiceCheckoutModal.tsx   # form checkout
src/components/admin/OrdersTab.tsx                # lista admin
src/components/admin/OrderDetailDrawer.tsx        # drawer con 5 tabs
src/components/crm/LeadServicesCard.tsx           # sección CRM

src/app/api/services/catalog/route.ts            # GET público
src/app/api/services/checkout/route.ts           # POST público
src/app/api/admin/orders/route.ts                # GET/POST admin
src/app/api/admin/orders/[id]/route.ts           # GET/PATCH/DELETE admin
src/app/api/admin/orders/[id]/notes/route.ts     # GET/POST notes
src/app/api/admin/orders/[id]/documents/route.ts # GET/POST documents
src/app/api/admin/leads/[id]/orders/route.ts     # GET orders por lead

src/lib/email/service-order-notification.ts  # email Brevo al admin

supabase/migrations/20260721044345_courses_status_proximamente.sql
supabase/migrations/20260721045701_service_orders.sql
```

---

## Glosario

- **Order**: pedido de servicio (no confundir con `orders` legacy
  del schema viejo, que era para cursos).
- **Variant**: package/precio dentro de un servicio. Un service
  tiene 1..N variants. El cliente elige UN variant al hacer
  checkout.
- **Service Order = "QO-2026-0001"**: formato human-readable para
  tracking. El ID interno sigue siendo UUID.
- **Service = producto del catálogo**: cada uno tiene su propia
  página `/servicios/[slug]` con sus variants.
- **CRM ↔ Orders link**: `service_orders.lead_id` (FK nullable,
  `ON DELETE SET NULL`). 1 lead → N orders. Hoy el form público
  no linkea, pero la API lo soporta.

---

**Próximo sprint sugerido:** integrar Stripe real (test mode →
live) + email al cliente cuando `confirmed`. Es lo que desbloquea
facturación automática real y reduce el trabajo manual de David.
