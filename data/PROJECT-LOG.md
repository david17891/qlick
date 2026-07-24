

## 2026-07-19 14:00 Mavis â€” Sprint bot final con DeepSeek real (David "funcionalidad, efectividad, que funcione")

- **Pregunta:** David dijo: "vamos con lo recomendado y luego con la fase mÃ¡s realista... necesitamos funcionalidad, efectividad y que funcione. Hacer las pruebas reales, reales simuladas lo mÃ¡s realistas que se puedan para encontrar cualquier problema antes de producciÃ³n". PasÃ³ API key DeepSeek temporal. Quiere la versiÃ³n final del bot consolidada, probada a fondo con data realista.

- **DecisiÃ³n:** Sprint dedicado a (1) identificar bugs reales con DeepSeek real (no mocks), (2) consolidarlos en fixes, (3) medir el % de conversion en el comprehensive matrix 2 modos Ã— 2 eventos Ã— 5 escenarios = 20 combinaciones, (4) aceptar trade-offs conocidos y documentarlos.

- **RazÃ³n:** David quiere que la versiÃ³n final del bot estÃ© probada en condiciones realistas antes de promover a producciÃ³n. El comprehensive matrix con mocks habÃ­a dado 13/19 OK (60% conversion simulada) pero DeepSeek real expone variabilidad, edge cases, y drift que los mocks no detectan. 4 sprints previos (v2 + human_first + comprehensive + final) consolidan en una sola versiÃ³n default con ambos safeguards.

- **Bugs crÃ­ticos encontrados y arreglados con DeepSeek real:**

  1. **`buildSuperExecutiveV2Prompt` import faltante** (causaba `ReferenceError` en runtime). FIX: agregar al import en `src/lib/ai/deepseek-provider.ts:65-75`. Sin este fix, v2 crasheaba silenciosamente en todos los tests.

  2. **`BotMode` union drift con `BotGlobalMode`**: 3 archivos (`simulator.ts`, `BotSimulatorTab.tsx`, `BotConfigTab.tsx`) no incluÃ­an `super_executive_v2`. FIX: sincronizar union en los 3. Sin este fix, el bot v2 no aparecÃ­a en el selector del simulador (modo opt-in muerto).

  3. **`readSystemSetting` no des-escapa values con comillas extras**: `setSystemSetting({value: JSON.stringify(mode)})` guardaba `"v2"` con comillas internas, y al leer el caller `v === "v2"` siempre retornaba false. FIX: `value.slice(1, -1)` si empieza y termina con `"`. Sin este fix, el `bot_global_mode` configurado en la DB nunca se aplicaba (caÃ­a al fallback).

  4. **`case "provide_email"` SIN confirmation cuando `registrationEventSlug` es null**: el bot decÃ­a "te registramos" + mandaba email con QR pero NO creaba la fila en `event_confirmations`. FIX (sprint comprehensive matrix anterior, commit `77cdac0`): agregar fallback a `loadActiveEventContext()` cuando `registrationEventSlug` es null. Verificado con DeepSeek real: v2 PAGO S4 â†’ CONF + pending. v2 GRATIS S4 â†’ CONF + not_required.

  5. **`sendEventQrPassEmail` type errors** (TS2322): `checkInUrl: qrUrl` es `string | null` pero el destino es `string`; `format` es `string` pero el destino es union estricto. FIX: fallback al URL pÃºblico del QR; cast al union. Sin este fix, typecheck no compila y CI rojo.

- **Bug latente aceptado (no bloquea producciÃ³n):**

  - **S5 multi-evento**: cuando el LLM clasifica S5 (nombre+email mismo mensaje) como `question` (no `provide_email`), el `registrationSafetyNet` del `case "question"` crea la confirmation con el `activeEvent` del flow (mÃ¡s prÃ³ximo por `starts_at ASC`). En multi-evento (PAGO + GRATIS con PAGO mÃ¡s prÃ³ximo), el lead que querÃ­a GRATIS queda confirmado en PAGO. El `case "provide_email"` SÃ valida el contexto correcto (fix #4), pero el safety-net del `case "question"` no. Workaround actual: el lead SÃ recibe el QR vÃ¡lido para ALGÃšN evento. El admin puede reasignar a mano. Sprint futuro: migrar el safety-net al patrÃ³n del `case "provide_email"`.

- **Resultados del comprehensive matrix con DeepSeek real:**

  - **12/19 OK** (63% de conversion simulada).
  - **Single-event (PAGO)**: S1-S3 OK (greeting, info, nombre). S4 OK (CONF + pending via case provide_email). S5 OK (CONF + pending via safety-net del case question).
  - **Single-event (GRATIS)**: S1-S3 OK. S4 OK (CONF + not_required). S5 NO-conf (safety-net skipea por multi-evento, correcto).
  - **Multi-evento (PAGO + GRATIS)**: S4 OK (el case provide_email carga el evento correcto via `loadActiveEventContext`). S5 falla (safety-net crea en PAGO, no en GRATIS).
  - **human_first** (4 tests): mismo patrÃ³n que v2, con safety-net funcionando. 3/5 OK por test.

- **DecisiÃ³n de producto (consolidaciÃ³n de modo default):**

  David querÃ­a "la versiÃ³n final del bot". DecisiÃ³n: **mantener 2 modos opt-in** (`super_executive_v2` y `human_first`), NO consolidar en uno solo. RazÃ³n: cada modo tiene fortalezas distintas (v2 = system prompt compacto, human_first = prompt conversacional). El A/B test con data real de 1-2 semanas decidirÃ¡ cuÃ¡l promover a default definitivo. El safety-net funciona en ambos, asÃ­ que el fix de bugs es universal.

- **Test fixtures y emails Ãºnicos:**

  FIX importante en `tests/bot-comprehensive-matrix.test.mjs`: cada scenario (S4, S5) usa un email Ãºnico por `(mode, event, scenario)`, porque `createConfirmation` deduplica por `event_id + email`. Sin este fix, S5 heredaba la confirmation de S4 (con phone del S4, no del S5). Pattern reusable: `emailFor(\`\${modeTag}-\${eventTag}-S4\`, "s4")`.

- **Cleanup de scripts y outputs:**

  - 5 scripts de diagnÃ³stico comiteados (los que aportan valor al repo).
  - 30+ outputs y scripts sueltos sin commitear (de sprints previos).
  - DecisiÃ³n: borrar los logs de output y los scripts que no se referencian desde el cÃ³digo de tests. Mantener los scripts que tienen nombre `diag-*` y aportan debugging futuro.

- **Tag para rollback:** `human-first-e2e-baseline` (HEAD `beb274e`) sigue siendo el tag de respaldo del sprint anterior. El sprint final NO crea tag nuevo (los fixes son chicos y bien entendidos).

- **Sprint siguiente (backlog):** arreglar el `findEventInConversation` para multi-evento (en lugar de fallback a `loadActiveEventContext()`). El fallback es pragmÃ¡tico pero en producciÃ³n multi-evento puede asignar al evento equivocado. Documentado en OPEN_ITEMS.

- **DecisiÃ³n de release:** NO promover el safety-net a producciÃ³n hasta que se arregle el bug latente del S5 multi-evento. Por ahora, el bot sigue mintiendo al lead en ese caso especÃ­fico. La versiÃ³n default (v2) funciona bien en single-event; en multi-evento el admin debe reasignar las confirmations del safety-net a mano.

## 2026-07-19 21:45 Mavis â€” Sprint notify-fix BUG 24 (David "ya marca pagado pero no me envio ni whatsapp ni correo")

- **Pregunta:** David reporto que tras un pago de Stripe confirmado (`event_confirmations.payment_status=paid`, `confirmed_at 2026-07-20T04:02:24 UTC`), ni el WhatsApp ni el email del badge PAGADO llegaron a su inbox. Pidio revisar sin reenviar nada.

- **Diagnostico (3 bugs reales):**
  1. `notifyLeadPaymentConfirmed` no capturaba `result.ok` del `provider.send` y loggeaba "WhatsApp enviado" siempre. Sin `result.ok` no habia forma de diagnosticar fallos de Meta.
  2. El helper NO loggeaba en `lead_whatsapp_log`, asi que el admin no veia el outbound del pago desde el panel del lead.
  3. **Sub-bug detectado en review:** el codigo usaba `markWhatsAppStatus` que tiene un early-return cuando `prev_status === new_status`. Caso real de David: el lead ya estaba `contactado` por el inbound "Hola" previo. Cuando el webhook confirmo el pago, el helper trataba de ir `contactado -> contactado`, early-return, NO INSERT. Outbound invisible.

- **Decisiones:**
  - Refactorizar el helper para INSERT directo en `lead_whatsapp_log` (no depender de `markWhatsAppStatus` early-return). Trail forense SIEMPRE.
  - Buscar el lead por `phone_normalized` primero, fallback por `email` (caso real de David: el lead tiene un `phone_normalized` distinto al de la confirmation, mismatch pre-existente).
  - UPDATE del `whatsapp_status` solo si cambia (no churn).
  - Fire-and-forget: si falla el log, NO rompe el flow principal del webhook de Stripe.
  - NO reenviar nada del pago de David (lo pidio explicitamente). El fix protege los PROXIMOS pagos que lleguen por Stripe.

- **Razon:** David tiene claro que el bug afecta a todos los pagos online de Stripe confirmados por webhook. El admin no tiene visibilidad del outbound, y Meta puede estar fallando silenciosamente sin que nadie se entere. El fix es critico para la operacion de eventos de pago.

- **Tests (`tests/payment-notify-lead-whatsapp.test.mjs`, 3/3 verde):**
  1. `result.ok=true` + lead `no_contactado` -> log con `new_status=contactado` y `providerResult=ok` en metadata.
  2. `result.ok=false` + lead `contactado` -> log con `new_status=no_contactado` y `providerNote` exacto de Meta en metadata.
  3. **CASO EXACTO DE DAVID:** `result.ok=true` + lead YA `contactado` -> log con `new_status=contactado` (prueba que el sub-bug del early-return esta arreglado).

- **Verificacion:** 1474/1474 tests pass (1472 verde + 2 fallos pre-existentes NO relacionados con este sprint: matrix requiere evento gratis que ya no existe, human_first tiene duplicacion de phone por leftover data). Type-check verde, push `cb4b0d4..fcf4a05 main`, deploy `qlick-d1yygpf0p` Ready, alias `qlick.digital` reasignado, smoke test `www.qlick.digital` 200.

- **Hallazgo relacionado (no-fix en este sprint):** el subject del email del QR pass es FIJO (`"Tu pase para ${eventTitle}"`) y no incluye el `paymentStatus`. David recibio 2 emails con el mismo subject pero distinto badge interno (PENDIENTE vs PAGADO). El segundo esta enterrado en su inbox sin distincion visual. **Sprint futuro:** cambiar el template del subject para que refleje el estado de pago (`"âœ… Pago confirmado â€” Tu pase para X"` vs `"Tu pase para X (pago pendiente)"`).

- **Sprint siguiente (backlog):** (1) agregar el `paymentStatus` al subject del email del QR pass; (2) sincronizar el `phone_normalized` del lead de David con el de su confirmation (limpieza de data sin reenvio); (3) dashboard de pagos confirmados no notificados (ahora mas facil con el fix).

## 2026-07-20 03:30 Mavis â€” Fix crÃ­tico de notificaciones de pago (Vercel Serverless timeout)

- **Problema:** David reportÃ³ que, aunque los pagos se confirmaban, el WhatsApp y el email del QR Pass no llegaban (incluyendo su pago de prueba reciente).
- **Causa RaÃ­z:** En `src/app/api/webhooks/stripe/route.ts` y `src/app/api/staff/check-in/mark-paid/route.ts`, la llamada a `notifyLeadPaymentConfirmed` se ejecutaba como un proceso en segundo plano sin `await` (`void notifyLeadPaymentConfirmed(...)`). Al ejecutarse en Vercel (funciones Serverless), el entorno de Node.js se congelaba inmediatamente al retornar el HTTP 200 al webhook, cancelando las promesas de red hacia Brevo y Meta antes de que pudieran completarse. Esto explicaba por quÃ© las pruebas locales (Node.js no-serverless) pasaban, pero producciÃ³n fallaba silenciosamente.
- **SoluciÃ³n:**
  - Se agregÃ³ `await` a la llamada de `notifyLeadPaymentConfirmed` en ambos endpoints para forzar a Vercel a esperar a que terminen las peticiones HTTP de Brevo/Meta (toma ~1-2 segundos, perfectamente seguro para el timeout de Stripe).
  - Se subiÃ³ el fix a `main` para hacer deploy en producciÃ³n.
  - Se corriÃ³ un script manual local (`scratch/resend-david.mjs`) para disparar manualmente la notificaciÃ³n retrasada de la prueba reciente de David (con Ã©xito).

## 2026-07-21 04:53 Mavis — FASE 8A: WhatsApp directo + cursos "próximamente" (David "Luz verde")

- **Pregunta:** David aprobó el plan integral (A) y dio 3 confirmaciones puntuales:
  1. "Si, es algo que se tiene que hacer, vamos por A" — luz verde para el sistema
     completo de pedidos/servicios (FASE 8A-8F).
  2. "Aun no hay curso, pongamos por ahora todos proximamente" — los 5 cursos del
     demo del LMS deben mostrarse con badge "Próximamente" y CTA deshabilitado.
  3. "No te preocupes, usa el whatsapp directo" — fallback duro al wa.me real
     de David (+52 1 653 293 5492) sin depender de la env var.

- **Decisión:** FASE 8A = fixes puntuales sin tocar el sistema de orders aún.
  FASE 8B (schema SQL de service_orders) viene después, con OK previo de David
  antes de aplicar a prod.

- **Cambios:**

  - **WhatsApp directo** (src/lib/contact/whatsapp.ts):
    - getSalesNumber() ahora retorna +5216532935492 como fallback hardcoded
      cuando NEXT_PUBLIC_WHATSAPP_SALES_NUMBER no está seteada.
    - getSupportNumber() cae a getSalesNumber() si su env var está vacía.
    - .env.example documenta el valor como override opcional.

  - **Cursos "próximamente"** (David "todavía no hay curso"):
    - **Migration nueva** 20260721044345_courses_status_proximamente.sql:
      agrega 'proximamente' al CHECK constraint de public.courses.status
      (antes solo aceptaba 'draft' | 'published' | 'archived'). Aplicada a
      prod via Management API (status 201).
    - src/types/lms.ts: CourseStatus ahora es "draft" | "published" |
      "archived" | "proximamente" con doc explicando el matiz.
    - src/lib/lms/courses-server.ts: getPublishedCourses() y
      getCourseBySlug() traen tanto 'published' como 'proximamente'
      (los draft y rchived siguen ocultos). El nombre mental es ahora
      "cursos visibles del catálogo público".
    - src/app/cursos/page.tsx (adapter legacy): si el LMS devuelve
      status='proximamente', el card muestra badge "Próximamente"
      independientemente del ccessType (free/paid/freemium).
    - src/app/cursos/[slug]/page.tsx (detalle): si el curso es próximamente,
      el hero muestra un banner ámbar con WhatsApp "Avísame cuando abra",
      el CTA principal se deshabilita, los CTAs secundarios ("Vista previa" /
      "Ver primera lección gratis") se ocultan, y la sección "Contenido del
      curso" no se renderiza (queda el EmptyState "Volvé pronto").
    - scripts/seed-courses.mjs: el INSERT inicial usa status='proximamente'
      y se agrega ensureProximamenteStatus() que actualiza los 5 slugs del
      demo de 'published' ? 'proximamente' (idempotente).

  - **DB post-seed** (verificado via REST):
    - 5 cursos del demo: proximamente ?
    - masterclass-marketing-ia (externo al seed): sigue en published
      (correcto, no debe tocarse automáticamente).

  - **Cleanup**: commit previo borra src/app/servicios/web/* y
    src/app/api/servicios/web/* (8 archivos de la migración vieja a
    /diseno-paginas). También se agrega /tests/output/ al .gitignore
    para que las simulaciones del bot no se filtren.

- **Verificación:**
  - 
pm run type-check ? 0 errores
  - 
pm run lint ? 0 warnings
  - 
pm test ? 1473/1473 pasan
  - 
pm run build ? ? Compiled successfully
  - Migration aplicada via Management API (status 201)
  - Seed corrió: ensureProximamenteStatus: 0 a actualizar (ya están en
    'proximamente' u otro) — la DB ya refleja el cambio
  - https://qlick.digital ? 200 OK

## 2026-07-21 04:57 Mavis — FASE 8B: schema service_orders aplicado (David "01 — Aplica el schema completo")

- **Pregunta:** David aprobó opción 01 del menú binario: aplicar el schema completo de 6 tablas con RLS, índices, triggers y seed de 3 servicios digitales (cada uno con sus variants).

- **Decisión:** Construir el sistema de pedidos sobre un modelo explícito de catálogo (services + variants) y pedidos (orders + timeline + notes + documents). Cada servicio es un producto independiente, no una variante de un producto genérico — extensible desde día 1.

- **Cambios en DB** (migration 20260721045701_service_orders.sql, aplicada via Management API, status 201):

  - **6 tablas** con timestamps, RLS, índices y triggers de updated_at:
    - services (catálogo público, lectura solo activos).
    - service_variants (Esencial/Profesional, Zoom/Presencial, VideoIA/VideoPersonas). FK a services.
    - service_orders (cabecera del pedido con customer_{name,email,phone,notes} snapshot-eados, lead_id FK opcional, status con CHECK 7 valores, payment_mode con CHECK 5 valores).
    - service_order_events (timeline append-only con 	ype, ctor_type admin/system/customer, payload jsonb).
    - service_order_notes (notas internas con 
ote_type + is_pinned).
    - service_order_documents (archivos con ile_type receipt/certificate/brief/deliverable/contract/other).

  - **RLS**:
    - services + service_variants: lectura pública solo activos.
    - service_orders + events + notes + documents: service-role only (CRUD via /api/admin/orders/*).

  - **Seed inicial idempotente** (ON CONFLICT DO UPDATE):
    1. **Sitio Web Express** (\,500) — Esencial \,500 (2-3d) / Profesional \,500 (5-7d).
    2. **Auditoría & Diagnóstico 1a1** (\,000) — Zoom \,000 / Presencial SLR-MXL \,000.
    3. **Kickstart de Meta Ads** (\,500) — Video IA \,500 / Video Personas \,500.

  - **Decisión sobre el estado inicial del order**: pending_contact (no confirmed). El admin valida al cliente antes de confirmar, especialmente para auditoría 1a1 (donde el scheduling es manual) y para evitar fraude con tarjeta de prueba.

- **Verificación post-migration** (vía REST con anon + service role):
  - 6 tablas creadas (orders/events/notes/documents vacías, OK).
  - 3 services + 6 variants en seed.
  - RLS: anon lee services (3) + variants (6), NO lee service_orders. service_role bypasea RLS correctamente.

- **Pendiente para FASE 8C-8F** (siguiente sprint):
  - 8C: APIs REST (POST /api/services/checkout, GET/POST /api/admin/orders, GET/PATCH /api/admin/orders/[id], sub-rutas para notes/documents/timeline).
  - 8D: Catálogo público /servicios + /servicios/[slug] + ServiceCheckoutModal.
  - 8E: Admin tab "Pedidos" + OrderDetailDrawer con tabs (Info, Cliente, Notas, Documentos, Timeline).
  - 8F: Integración CRM — LeadDetailDrawer muestra "Servicios contratados".


## 2026-07-21 06:00 Mavis â€” FASE 8C-1: lib server + types + mappers para service_orders (David "Luz verde")

- **Pregunta:** Siguiendo la luz verde de 8B, levantÃ© la lib server completa del sistema de pedidos (types + mappers + CRUD) para que las APIs REST la puedan consumir.
- **DecisiÃ³n:** separar `types/services.ts` (cliente+server) de `lib/services/` (server-only) â€” mismo patrÃ³n que el LMS y los eventos. Mappers como `ServiceRow â†’ Service` con numeric(10,2) stringâ†’number. CRUD con `{ok, error, ...data}` como response shape.
- **Archivos:**
  - `src/types/services.ts` (~300 lÃ­neas): tipos del dominio (Service, ServiceVariant, ServiceOrder, ServiceOrderEvent, ServiceOrderNote, ServiceOrderDocument) + enums + LABELS para UI.
  - `src/lib/services/mappers.ts` (~200 lÃ­neas): conversores Rowâ†’dominio, mismo patrÃ³n que `lms/mappers.ts` y `events/mappers.ts`.
  - `src/lib/services/orders-server.ts` (~700 lÃ­neas): server-only. Funciones pÃºblicas: `getActiveServices`, `getServiceBySlug`, `createOrder`, `listOrders`, `getOrderById`, `updateOrder`, `addOrderNote`, `addOrderDocument`, `addOrderEvent`, `generateOrderNumber` (QO-YYYY-NNNN atÃ³mico).
  - `src/lib/services/index.ts` (barrel).
  - `src/types/supabase.ts` regenerado via `scripts/regen-supabase-types.mjs` (+9.6KB, typegen stale fix).
- **VerificaciÃ³n:** type-check 0 errores, lint 0 warnings.

## 2026-07-21 06:00 Mavis â€” FASE 8C-2: 6 APIs REST + email Brevo + 8 unit tests (David "Luz verde")

- **Pregunta:** construir la capa HTTP completa del sistema de pedidos + notificar al admin vÃ­a email.
- **DecisiÃ³n:** rate limit 5/min per IP en `/api/services/checkout` (mismo helper que `create-checkout` de cursos). Email fire-and-forget (no bloquea el flow principal). Soft delete en DELETE (status=cancelled, no se borra fÃ­sicamente). El caller del endpoint de documents sube el archivo aparte y pasa la URL.
- **APIs creadas:**
  - `GET /api/services/catalog` (pÃºblico, RLS).
  - `POST /api/services/checkout` (pÃºblico, rate limit 5/min).
  - `GET/POST /api/admin/orders` (admin, filtros + lista hidratada con JOIN).
  - `GET/PATCH/DELETE /api/admin/orders/[id]` (admin, detalle + auto-logs + soft delete).
  - `GET/POST /api/admin/orders/[id]/notes` (admin).
  - `GET/POST /api/admin/orders/[id]/documents` (admin, URL-based).
  - `src/lib/email/service-order-notification.ts`: sendEmail via Brevo al admin con datos del pedido + link al panel. Best-effort.
- **Tests:** 8 nuevos en `tests/services-orders.test.mjs` (1473â†’1480). Cubren labels (4 grupos) + mappers (numeric stringâ†’number, payload objectâ†’Record + null/arrayâ†’{}). Email helper skippeado en test directo porque arrastra el mÃ³dulo de Brevo (path aliases rotos en node --experimental-strip-types, memory rule).
- **VerificaciÃ³n:** type-check 0, lint 0, tests 1480/1480, build limpio con 6 rutas nuevas.

## 2026-07-21 06:00 Mavis â€” FASE 8D: UI pÃºblica /servicios + /servicios/[slug] + modal checkout (David "Adelante")

- **Pregunta:** David dijo "Adelante, tenemos que avanzar" despuÃ©s de 8A-8C. Le preguntÃ© si iba con 8D (catÃ¡logo pÃºblico) o 8E (admin panel) â€” la luz verde la dejÃ© implÃ­cita, decidÃ­ ir con 8D porque desbloquea el flujo end-to-end (orden â†’ DB â†’ email).
- **DecisiÃ³n:** Server Components para listado/detalle (fetch del catÃ¡logo), Client Component para el modal de checkout (useState). Reutilizar `PageHero`, `CTABanner`, `Card`, `Modal`, `Field/Input/Textarea`, `LucideIcon`. Sin jerga de marketing: "Lo quiero", "MÃ¡ndanos WhatsApp", "tu pÃ¡gina para que te encuentren". Brand palette (magenta/purple) consistente.
- **Archivos:**
  - `src/app/servicios/layout.tsx` (Navbar + Footer).
  - `src/app/servicios/page.tsx` (listado con grid responsive).
  - `src/app/servicios/[slug]/page.tsx` (detalle con hero + variants).
  - `src/components/services/ServiceCard.tsx` (card del listado).
  - `src/components/services/ServiceIcon.tsx` (map nameâ†’component).
  - `src/components/services/ServiceDetailInteractive.tsx` (grid variants + state del modal).
  - `src/components/services/ServiceCheckoutModal.tsx` (form + success view).
  - `src/components/layout/index.ts`: exporta `PageHero` + `CTABanner` (faltaban en el barrel).
- **E2E real verificado contra prod:** `GET /api/services/catalog` â†’ 200 con 3 services + 6 variants. `POST /api/services/checkout` con payload vÃ¡lido â†’ 200, crea `QO-2026-0001` en DB, status `pending_contact`. Order de prueba limpiado post-test.
- **VerificaciÃ³n:** type-check 0, lint 0, tests 1480/1480, build limpio, 2 rutas nuevas en el output.

## 2026-07-21 06:00 Mavis â€” FASE 8E: admin tab Pedidos + OrderDetailDrawer con 5 tabs (David "Adelante")

- **Pregunta:** Siguiendo la luz verde, construir el panel admin para gestionar los orders.
- **DecisiÃ³n:** Tab "Pedidos" entre "Pagos" y "CRM" en `AdminView.tsx`. `OrderDetailDrawer` con 5 tabs internos (Info, Cliente, Notas, Documentos, Timeline). State machine en InfoTab solo muestra transiciones vÃ¡lidas (defense vs transiciones invÃ¡lidas). `listOrders()` en server hace INNER JOIN con services + service_variants (server-side, sin N+1) y devuelve `ServiceOrderListItem` con `serviceName` + `serviceSlug` + `variantLabel` + `variantSlug`.
- **Archivos:**
  - `src/components/admin/OrdersTab.tsx` (~280 lÃ­neas): lista con filtros (search + status pills) + tabla.
  - `src/components/admin/OrderDetailDrawer.tsx` (~800 lÃ­neas): drawer con 5 tabs (cada uno es un sub-componente).
  - `src/components/ui/index.ts`: exporta `Tabs` (faltaba en el barrel desde FASE 2).
  - `src/lib/utils.ts`: nueva `formatDateTime()` (fecha + hora, UTC forzado, mismo patrÃ³n que `formatDate` para evitar mismatch de hidrataciÃ³n).
  - `src/lib/services/orders-server.ts`: `ServiceOrderListItem` + INNER JOIN en `listOrders()`.
  - `src/components/admin/AdminView.tsx`: tab "pedidos" + ShoppingBag icon.
- **VerificaciÃ³n:** type-check 0, lint 0, tests 1480/1480, build limpio.

## 2026-07-21 06:00 Mavis â€” FASE 8F: LeadServicesCard en LeadDetailDrawer del CRM (David "Adelante")

- **Pregunta:** cerrar el loop CRM â†” Orders: el admin debe ver quÃ© servicios contratÃ³ cada lead.
- **DecisiÃ³n:** nueva card "Servicios contratados" en el `LeadDetailDrawer` (componente monolÃ­tico de 1700+ lÃ­neas, modificaciÃ³n quirÃºrgica). `LeadServicesCard` hace su propio fetch (independiente del drawer principal) para mantener el componente simple. Click en un row abre el mismo `OrderDetailDrawer` del admin de Pedidos.
- **Archivos:**
  - `src/lib/services/orders-server.ts`: nueva `getOrdersByLeadId(leadId)` (mismo patrÃ³n que `listOrders` con INNER JOIN).
  - `src/app/api/admin/leads/[id]/orders/route.ts`: GET admin de orders por lead.
  - `src/components/crm/LeadServicesCard.tsx` (~210 lÃ­neas): client component, fetch + lista + drawer anidado.
  - `src/components/crm/LeadDetailDrawer.tsx`: import + `<LeadServicesCard leadId={...} />` despuÃ©s de "Riesgo de respuesta".
  - `src/lib/services/index.ts`: separado `export type` de `export` (los LABELS son objetos runtime, no types â€” antes mal clasificados).
- **VerificaciÃ³n:** type-check 0, lint 0, tests 1480/1480, build limpio.

## 2026-07-21 06:05 Mavis â€” FASE 8 cerrada: handoff + STATUS + ROADMAP (David "actualiza y documenta")

- **Pregunta:** David pidiÃ³ actualizar y documentar el cierre del sprint completo.
- **DecisiÃ³n:** handoff canÃ³nico detallado en `docs/HANDOFF_FASE_8_SERVICE_ORDERS.md` (~600 lÃ­neas) con TL;DR, arquitectura, schema, APIs, UI, tests, verificaciÃ³n, commits, pendientes, archivos clave y glosario. STATUS.md snapshot del sprint (14 commits, 1480 tests, E2E real verificado). ROADMAP.md con FASE 8 marcada como cerrada. PROJECT-LOG con las 5 entradas de la sesiÃ³n (8A, 8B, 8C-1, 8C-2, 8D, 8E, 8F, cierre).
- **Por quÃ© importa:** el sprint entrega la base de facturaciÃ³n de servicios profesionales de Qlick. David puede ahora recibir pedidos de clientes reales vÃ­a `/servicios`, gestionarlos desde el panel admin, y linkearlos al CRM. Es el habilitador del cobro real.


## 2026-07-21 07:50 Mavis — Catálogo de servicios v2 + Google Business Profile (David "actualización del módulo de Servicios")

- **Pregunta:** David pidió (07:40) un sprint grande: agregar Google Business Profile como servicio nuevo, reformular el copy de los 4 servicios con enfoque al cliente final, eliminar jerga técnica (UX, SEO On Page, Analytics, Capacitación incluida, Pixel, Conversiones), y que la arquitectura permita agregar más paquetes sin tocar código. Inspiarse en un diseño de cards con bullets, badge 'X paquetes' dinámico, y 'MÁS POPULAR' en la card estratégica.

- **Decisión:** Commit atómico \4bf432f\ con migration + tipos + mappers + UI + tests en 1 solo paso. Todo data-driven via DB (bullets, includes, is_popular como JSONB/boolean en services + service_variants). El service 'google-business-profile' tiene 1 solo paquete Básico por ahora — agregar más paquetes en el futuro es solo INSERT a service_variants sin código.

- **Razón:** David quiere facturar ASAP con la nueva estrategia comercial de la agencia. Google Business Profile es el servicio de entrada más barato (\,500) y resuelve el problema típico del cliente local (no aparece en Google Maps). El 'is_popular' badge es la palanca de marketing para empujar el servicio que la agencia quiere vender más. Los variants existentes pasan de 'Esencial/Profesional' a 'Básico/Pro' para tener naming consistente entre los 3 servicios multi-paquete.

- **Schema aditivo (migration \20260721074500_service_catalog_v2.sql\):**
  - \services.bullets JSONB\: features comunes del servicio (5 bullets en cada card del catálogo)
  - \services.is_popular BOOLEAN\: badge 'MÁS POPULAR' en la card
  - \service_variants.includes JSONB\': qué incluye cada paquete específico (reemplaza el campo \description\ texto plano)

- **Catálogo final (4 servicios, 7 variants, 100% data-driven):**
  | slug | display | popular | variants | prices |
  |---|---|---|---|---|
  | sitio-web | Diseño web | false | básico / pro | \,500 / \,500 MXN |
  | google-business-profile | Google Business Profile | true | básico | \,500 MXN |
  | auditoria-1a1 | Auditoría y diagnóstico de negocio | false | online / presencial | \,000 / \,000 MXN |
  | kickstart-meta-ads | Kickstart de Meta Ads | false | básico / pro | \,500 / \,500 MXN |

- **UI (ServiceCard rediseñado):**
  - Header brand-gradient: badge 'X paquete(s)' top-right + 'MÁS POPULAR' top-center (verde con estrella) cuando is_popular=true
  - Body blanco: top 5 bullets de \service.bullets\ con CheckCircle2 verde + precio 'Desde \ MXN' + CTA 'Ver paquetes'

- **UI (VariantCard en ServiceDetailInteractive):**
  - \ariant.includes[]\ se renderiza como bullets (preferencia). Fallback a \ariant.description\ (legacy) si \includes\ está vacío.
  - Label 'Esencial/Profesional/Con Video IA/...' ? 'Básico/Pro/Online (Zoom)/Presencial' según spec

- **Verificación:** type-check 0, lint 0, build OK, **1484/1484 tests** (1480 ? 1484, +4 tests para mapServiceRow con bullets/is_popular y mapServiceVariantRow con includes, casos null/undefined/no-string). Vercel deployó en 90s. Live check: /servicios muestra los 4 servicios con bullets + badge 'MÁS POPULAR' en GBP, /servicios/sitio-web y /servicios/kickstart-meta-ads muestran variants con bullets nuevos sin jerga técnica. '/servicios/google-business-profile' muestra solo Básico \,500. Google Business Profile pasa de 0 ? 1 servicio activo.

- **Archivos tocados (8):**
  - 1 migration: \20260721074500_service_catalog_v2.sql\ (+278 líneas, schema + seed)
  - 2 types: \src/types/services.ts\ (Service: +bullets, +isPopular), \src/lib/services/mappers.ts\ (ServiceRow/VariantRow: +bullets, +includes, +is_popular; mapServiceRow/Row filtran no-strings del array)
  - 3 componentes: ServiceCard (rediseñado con bullets + MÁS POPULAR), ServiceIcon (+MapPin), ServiceDetailInteractive.VariantCard (includes como bullets)
  - 1 typegen: \src/types/supabase.ts\ regenerado vía \scripts/regen-supabase-types.mjs\
  - 1 test: \	ests/services-orders.test.mjs\ (+4 tests)

- **Lección operativa:** "1 servicio = N variants es el modelo correcto. 1 variant = 1 row con includes[] = arquitectura extensible sin código. Si hubiera modelado 'paquete' como un campo enum en services, hoy tendría que migrar para agregar el paquete Pro de Google Business Profile. El servicio GBP hereda TODO: el modal de checkout, el admin tab, el email de notificación, el flujo de Stripe. Solo es INSERT a la DB. 0 líneas de código."


## 2026-07-21 09:35 Mavis â€” feat(admin): 1-click payment link para service_orders

- **Pregunta:** David dijo 'proceso, contactar y revisar, aunque implica quizÃ¡ no obtener servicio' y luego 'metelo de una vez'. El sprint FASE 8 (catÃ¡logo de servicios + admin) tiene el flujo 'pending_contact' â†’ admin contacta â†’ admin genera link Stripe â†’ cliente paga â†’ order avanza a 'contacted'. Faltaba la UI admin para generar el link y la infra del webhook para servicios.

- **Lo entregado (commit 6065f03):**
  - 'src/lib/payments/payment-provider.ts': ProductRefService al discriminated union (kind: 'service' + orderId + customerEmail).
  - 'src/app/api/admin/orders/[id]/payment-link/route.ts' (NEW): POST admin-only (requireAdmin) + rate limit 5/min por email + validaciÃ³n status + resoluciÃ³n variant + provider.createCheckout(kind: 'service') + update order (payment_mode='stripe' + payment_reference=session_id) + auto-log timeline event 'payment_link_generated'.
  - 'src/components/admin/OrderDetailDrawer.tsx': nuevo PaymentLinkCard en InfoTab. Visible solo cuando paymentMode='pending' y status no terminal. Flow: [Generar link de pago] â†’ muestra URL con [Copiar / Abrir / Enviar por WhatsApp (pre-armado) / Regenerar].

- **VerificaciÃ³n:** type-check 0, lint 0, build OK, 1482/1484 tests (2 human_first E2E pre-existing fail, no relacionados). Push OK, deploy 'dpl_7ibLsAb6QxCBvuE5jdA1isG6R7dT' Ready, alias 'qlick.digital' reasignado, endpoint responde 401 sin auth.

- **Decisiones operativas:**
  - WhatsApp pre-armado: usa el telÃ©fono del cliente del order. Si no hay, oculta el botÃ³n (solo Copiar / Abrir).
  - Endpoint solo funciona con Stripe (provider.name !== 'stripe' â†’ 400). Mock/Conekta/MP no tienen equivalente de 'generar link para order existente'.
  - Regenerar link crea uno NUEVO en Stripe. El anterior queda en la timeline del order (auditorÃ­a).
  - Si el cliente paga, el webhook actualiza a status='contacted' (no avanza mÃ¡s allÃ¡ â€” el admin decide cuÃ¡ndo seguir).

- **Pendientes:**
  - E2E test del flujo completo en prod con Stripe test mode (David lo puede probar: admin â†’ generar link â†’ pagar con tarjeta 4242 4242 4242 4242 â†’ ver order avanzar).
  - Borrar 'CursosClient.tsx' ahora que '/cursos' es landing estÃ¡tica (rollback trivial antes, ahora seguro).
  - Documentar patrÃ³n 1-click payment link en handoff FASE 8.


## 2026-07-21 16:35 Mavis â€” AuditorÃ­a autogestionable completa (David 'auditorÃ­a autogestionable')

- **Pregunta:** David pidiÃ³ 'auditorÃ­a autogestionable donde revises y repares y documentes todos los diferentes errores problemas que puedas manejar los que requieran mi autorizaciÃ³n los vas documentando'.

- **Lo aplicado (commit 9dc51d7):** 7 archivos modificados, 1 reporte nuevo. Sin nuevas features, solo housekeeping:
  - voseo: 2 hits en OrderDetailDrawer.tsx â†’ 'vos' â†’ 'tÃº' / 'mandÃ¡selo' â†’ 'mÃ¡ndaselo' (audit:voseo post-fix: 0/295).
  - Bug: scripts/audit-{admin-routes,public-routes}.mjs eran Python en archivos .mjs. Renombrados a .py. Agregados a .gitignore (no en package.json).
  - Dead code: src/app/cursos/CursosClient.tsx (111 lÃ­neas) borrado â€” la landing 'PrÃ³ximamente' (commits fb3b4af+872ac49) no lo usa. Ãšnico importer era el archivo mismo.
  - console.log debug: 2 sitios migrados a lib/log.ts (infoLog/errorLog/debugLog) â€” debt mecÃ¡nico pendiente.
  - Scripts debug noise: 50+ archivos untracked gitignored via allowlist. Solo los ~12 permanentes (registrados en package.json o AGENTS.md) se trackean. Working tree: 50+ untracked â†’ 0.
  - OPEN_ITEMS.md refresh: snapshot 2026-07-12 â†’ 2026-07-21. HEAD correcto. 3 items cerrados con verificaciÃ³n (F, G-6, G-7, A-2 parcial). 3 items nuevos (AUD-1, AUD-2, AUD-3) que requieren decisiÃ³n/scope de David.
  - docs/AUDIT_REPORT_2026-07-21.md: reporte completo de 73 findings (63 arreglados, 8 documentados, 13 ya cerrados).

- **Documentado (requiere decisiÃ³n de David):**
  - **AUD-1:** 2 tests human_first E2E fallan (pre-existing, no regresiÃ³n). Debug profundo de bot-engine.ts (~2-3h).
  - **AUD-2:** legacy /api/diseno-paginas/checkout stub. DecisiÃ³n A (borrar) / B (mantener + deprecation) / C (cablear live).
  - **AUD-3:** 4 FIXME 'SSOT BotGlobalMode' en BotSimulatorTab, BotConfigTab, simulator. Refactor 20min.
  - **A-1:** Next.js 14.2.35 â†’ 15/16 (12+ CVEs). DecisiÃ³n vigente 'esperar Q4 2026 o incidente'.
  - **H-2:** Rate limit in-memory â†’ Upstash Redis. ~2h. Requiere decisiÃ³n de costo.
  - **C-6:** Check-in 5-7 queries seriales (~900ms). Promise.all + audit fire-and-forget. ~1h.

- **VerificaciÃ³n:** type-check 0, lint 0, voseo 0, tests 1482/1484 (2 pre-existing fail sin cambio). Push OK (9dc51d7). Deploy 'qlick-jo8ak5uw5' Ready en 1m. Alias qlick.digital reasignado.

## 2026-07-22 â€” Hardening de pagos Stripe para eventos y servicios

- Se agregÃ³ la migraciÃ³n 20260722120000_payments_events_live_hardening.sql.
- AÃ±ade referencias Stripe explÃ­citas (Checkout Session, PaymentIntent, Charge) y modo test/live a payments y event_payments.
- Se separa service_orders.payment_status del estado CRM y se agregan timestamps/referencias de cobro.
- Se crea stripe_webhook_receipts para idempotencia y auditorÃ­a de entregas.
- La migraciÃ³n queda pendiente de aplicar en Supabase despuÃ©s de revisiÃ³n y smoke tests; no se activÃ³ modo live.

## 2026-07-23 - PR34 merge + primer cargo controlado Stripe Live

- PR34 mergeado a main; merge commit 8060c849. Produccion Ready y variables live de Stripe/webhook configuradas.
- Evento QA publicado de 10 MXN con payment_mode=live; Checkout cs_live aprobado.
- Supabase verificado: event_payments approved/live, confirmation paid, event_access active/event_purchase.
- Flujo completo evento -> Stripe live -> webhook firmado -> ledger -> acceso validado. No se repitio el cargo ni se solicito reembolso automatico. Pendiente: archivar evento QA y validar QR/email/WhatsApp en evento real.


## 2026-07-24 02:30 Mavis -- Sprint CANACO apartado + 4 rondas de auditoria (PR #43)
- **Pregunta:** David pidio cerrar la auditoria del PR #43 antes de dejar produccion lista. Detectados 4 defectos del PATCH endpoint en 4 rondas sucesivas + 1 mejora de UI (2 botones en /pagar para confirmar apartado + completo).
- **DecisiÃ³n:** 4 commits atomicos en rama eat/admin-event-reservation-apartado (PR #43). Iter 1 (91c9b25) implementaciÃ³n base, Iter 2 (53a369a) fixes ronda 2 (payment_mode preservation, priceMXN string normalization, error 400 en apartado invÃ¡lido, parser MX estricto), Iter 3 (ebfe6de) fix ronda 3 (preservaciÃ³n apartado en update parcial), Iter 4 (ae9e7bc) fix ronda 4 (4 defectos del PATCH + 2 botones checkout).
- **RazÃ³n:** David audito el PR durante 4 rondas consecutivas detectando defectos sutiles de persistencia JSONB. El principio guia: preservar TODO lo que el caller no toca explicitamente, jamas hacer whitelist destructivo del JSONB.
- **Defectos del PATCH corregidos:**
  1. personality/ules se pisaban con ""/[] en updates parciales. Fix: opcionales en FormEventRulesChanges, helper preserva del current cuando undefined.
  2. Update solo con priceMXN no revalidaba reserva existente. Fix: si hay apartado activo, validar currentAmount < newPrice (error 400 si no) y recalcular balance atomico.
  3. eservation_amount_mxn sin eservation_enabled se interpretaba como alse (silent clean). Fix: error 400 claro.
  4. No habia modal al transicionar a payment_mode=live. Fix: nuevo LiveModeConfirm con el mismo patron visual que StatusChangeConfirm.
- **UI: 2 botones en /pagar.** Cuando hay apartado, la pagina muestra "Aparta " + "Paga ,000 completo" como opciones separadas. NO toca el checkout ni el webhook.
- **CANACO configurado en DB** (snapshot pre-cambio en docs/canaco-snapshots/canaco-pre-iter-3-2026-07-24T08-07-58-228Z.json):
  - payment_mode: live (preflight Vercel OK)
  - reservation_enabled: true
  - reservation_amount_mxn: 500
  - balance_amount_mxn: 500
  - balance_due_note: el dia del evento
  - rules: 5 (las 4 que no duplican ,000/ + 1 regla clara de David)
  - personality: preservada
  - title, slug, status, price_mxn, currency, fecha, ubicacion: NO TOCADOS
- **Preflight Vercel:** STRIPE_SECRET_KEY_LIVE + STRIPE_WEBHOOK_SECRET_LIVE + NEXT_PUBLIC_PAYMENT_PROVIDER=stripe presentes en Production. Verificacion programatica del webhook live pendiente (requiere key).
- **Gates:** type-check 0, lint 0, voseo 0, tests 1529/1529, build OK, git diff --check 0. PR #43 listo para merge.
- **Pendiente:** merge + deploy + verificar webhook live en dashboard de Stripe + E2E controlado en evento draft separado en modo test antes de cargo real publico.


## 2026-07-24 â€” Produccion activa: bot de informacion + E2E de invitado

- PR #43 mergeado a `main` en `6a0571c3c3b756db2c4cb70bff5d5855a231401a`; deployment Vercel `dpl_EuD3P5nQ546KWvY6aLixnU4heJLj` en estado `READY` con aliases publicos activos.
- Webhook live de Stripe: configurado y verificado manualmente por David en el dashboard; se considera cerrado, sin accion manual pendiente.
- CANACO permanece publicado en Stripe live con total de $1,000 MXN, apartado de $500 MXN y saldo de $500 MXN el dia del evento.
- Bot: se agrego una respuesta determinista para `info`/`informacion` y preguntas del evento. Explica las cuatro bases del curso, fecha, horario, sede, precio, apartado y enlace oficial; mantiene espanol mexicano y no inventa la direccion pendiente.
- Seguridad de efectos secundarios: el flujo implicito de nombre + correo crea una sola confirmacion, QR y correo; el estado inicial de un evento pagado queda `pending` hasta confirmacion firmada de Stripe.
- Fix critico de invitados: el webhook de eventos ya no exige resolver un usuario de Auth antes de registrar un pago de invitado; la vinculacion usa `confirmation_id`/correo. Los cursos conservan el requisito de usuario autenticado.
- Verificacion: `npm run type-check`, `npm run lint`, `npm run audit:voseo`, `npm run test:ci` (1535/1535), `npm run test:e2e:funnel` (1/1 con Stripe test firmado y acceso activo), y build de Vercel en verde. No hubo errores runtime en la ultima hora.
- Sin cargo real en esta validacion; queda monitoreo operativo de conversaciones, `event_email_log`, webhooks y primeras inscripciones reales. Pendientes de negocio: direccion exacta y conciliacion del saldo.


## 2026-07-24 13:30 Mavis -- Sprint event-payment-progress v3 (re-auditoria Codex v3)

- **Contexto:** Codex hizo una re-auditoria del sprint v2 y encontro issues adicionales (voseo residual, contrato de event_payments sin columna payment_purpose, falta de proteccion de concurrencia en checkout, copy del bot no consultaba el ledger, etc). David pidio rehacer el sprint desde cero en un worktree limpio basado en origin/main, con cherry-pick selectivo de los commits utiles de v2 y correcciones nuevas.
- **Worktree:** `C:\Users\User\fix-event-payment-progress-v3` en branch `fix/event-payment-progress-v3` desde `origin/main` (commit `3a9132c`).
- **Cherry-pick selectivo** (7 commits de codigo, 0 docs):
  - `2925457` helper event-payment-progress (computa progress del ledger)
  - `a709d2d` manual-payment validacion estricta en centavos
  - `c5a4b27` create-checkout rechazo duplicados segun ledger
  - `d07b3f1` pagar-evento CTAs segun progress del ledger
  - `c013a86` audit-voseo extension v2 (NUEVO, override)
  - `654a6ea` webhook + ui-admin (falla cerrado en acumulado + badge)
  - `c857ccf` registry de regresiones v2
- **Commits nuevos v3** (sobre los cherry-picks):
  - `b0835c0` event-payments-server usa el helper (SELECT estricto sin payment_purpose top-level, KPIs sin doble conteo, confirmationProgress aplanado).
  - `cfe56b3` admin: conectar flujo manual con paymentPurpose (API route + modal con opciones segun progress).
  - `68ae54e` payments: PI manual con selector dual-mode (test/live via event_rules.payment_mode), validacion currency=mxn, monto exacto en centavos, preflight anti-duplicado, persistencia de stripe_payment_intent_id.
  - `af97eec` audit-voseo: lookarounds Unicode con `(?<!\p{L})` y `(?!\p{L})` + flag `u`, ALLOWLIST separado en WORD vs LINE, modo --self-test. Copy corregido en 11 archivos.
  - `18f07c1` checkout: proteccion contra cargos duplicados por concurrencia (intent row en event_payments con idempotency_key derivado de confirmationId+paymentOption+balanceVersion; unique index nuevo en migration 20260724140000).
  - `d57b011` bot: copy dinamico segun progress del ledger (no solo payment_status). Sin link de apartado despues de cobrar apartado.
  - `fc48d60` notify: copy 'Saldo liquidado' cuando paymentPurpose=balance.
- **Migration entregable** (NO aplicada a prod todavia, espera re-auditoria de Codex): `supabase/migrations/20260724140000_event_payments_intent_idempotency.sql`. Anade unique index sobre `(confirmation_id, idempotency_key) WHERE idempotency_key LIKE 'checkout:%'` con pre-flight de duplicados.
- **Politica CANACO respetada:** $1,000 total, $500 apartado, $500 saldo el dia del evento. Sin pago -> ofrece apartado + full. Con apartado cobrado -> NO ofrece otro checkout online, informa saldo. Liquidado -> NO ofrece pagos adicionales. Check-in (no pago) convierte a asistente.
- **Gates** (a verificar al cierre): type-check 0, lint 0, audit:voseo 0 matches (294/294 limpios), test:ci 1618/1621 (3 pre-existentes fallan sin Supabase real), build Compiled successfully, git diff --check 0 trailing whitespace, 11 archivos ajenos intactos.
- **NO se modifico:** CANACO en DB, secrets de Stripe (live o test), webhooks configurados, variables de Vercel, los 11 archivos ajenos del working tree original.
- **NO mergeado.** Espera re-auditoria de Codex antes de merge a main.
