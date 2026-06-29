# Decisiones de diseño — Qlick Marketing Integral

Registro de decisiones importantes (ADR ligero). Cada entrada documenta qué se
decidió, por qué, qué alternativas se consideraron, el riesgo y cómo revertirlo.

---

## D-001 · Nombre de marca: Qlick (con Q)

- **Fecha:** 2026-06-22
- **Decisión:** Usar "Qlick Marketing Integral" como nombre de la plataforma,
  tal como aparece en los assets de marca del zip entregado.
- **Motivo:** El zip de identidad visual contiene logos, isotipos y wordmarks
  que dicen "Qlick" (con Q). Usar "Click" (con C) como pedía el prompt original
  generaría inconsistencia visual entre el texto y los logos PNG.
- **Alternativas consideradas:**
  1. Llamarlo "Click" e ignorar los logos del zip → inconsistencia visible.
  2. Llamarlo "Click" y crear un logo nuevo → descarta assets ya hechos.
  3. Llamarlo "Qlick" usando los assets reales → coherencia total. ✅
- **Riesgo:** Si la marca legalmente es "Click", hay que renombrar. El cambio es
  mecánico: buscar/reemplazar "Qlick" → "Click" en copy y mantener los assets.
- **Cómo revertir:** Búsqueda global de "Qlick" en `src/` y `docs/`, reemplazo
  textual. Los assets de marca se regenerarían aparte.

---

## D-002 · Next.js App Router + TypeScript

- **Fecha:** 2026-06-22
- **Decisión:** Stack base con Next.js 14 (App Router) y TypeScript estricto.
- **Motivo:** App Router permite SSG para páginas públicas (rápido y barato en
  Vercel) y client components para áreas con estado. TypeScript reduce errores y
  documenta el dominio.
- **Alternativas consideradas:**
  1. Remix → buen modelo pero menor ecosistema para SSR de un LMS.
  2. Vite + React SPA → perdería SSG/SEO del catálogo público.
  3. Pages Router → App Router es el futuro y soporta mejor layouts anidados.
- **Riesgo:** Mínimo. Next es el estándar de facto para este tipo de producto.
- **Cómo revertir:** Migración manual; no aplica en la práctica.

---

## D-003 · Sin ORM en el MVP; tipos TS como fuente de verdad

- **Fecha:** 2026-06-22
- **Decisión:** No usar Prisma ni Drizzle todavía. Los tipos TypeScript en
  `src/types/index.ts` definen el modelo, y los datos mock los implementan.
- **Motivo:** El MVP no tiene DB; un ORM añadiría fricción sin beneficio. Los
  tipos ya son la especificación del schema futuro.
- **Alternativas consideradas:**
  1. Prisma desde el inicio → requiere DB para que aporte valor.
  2. Drizzle → idem, y añade curva de aprendizaje ahora.
  3. Postergar la decisión a Fase 1. ✅
- **Riesgo:** Cuando llegue la DB, hay que escribir el schema. Trivial porque
  los tipos ya existen.
- **Cómo revertir:** Generar schema SQL desde los tipos o usar el generador de
  Prisma a partir de ellos.

---

## D-004 · Auth mock en localStorage

- **Fecha:** 2026-06-22
- **Decisión:** Autenticación simulada con `localStorage` y funciones con la
  misma firma que tendrá Supabase Auth.
- **Motivo:** Permite recorrer la plataforma con roles sin configurar Supabase.
- **Alternativas consideradas:**
  1. Supabase desde el inicio → requiere configuración externa para el MVP.
  2. NextAuth sin proveedor → complejidad sin beneficio ahora.
  3. Mock con misma interfaz que Supabase → migración trivial. ✅
- **Riesgo:** Es inseguro (cualquiera puede falsificar la sesión). Está
  claramente etiquetado como demo en la UI y en el código.
- **Cómo revertir:** Reemplazar el cuerpo de `mock-auth.ts` por llamadas a
  `supabase.auth`; los componentes no cambian.

---

## D-005 · Abstracciones para video y pagos desde el día 1

- **Fecha:** 2026-06-22
- **Decisión:** Crear interfaces `VideoProvider` y `PaymentProvider` con
  múltiples implementaciones (stubs incluidos) aunque el MVP solo use una.
- **Motivo:** Estas dos áreas son las que más riesgo de refactor traen. Tener la
  abstracción desde el inicio evita reescribir componentes cuando se cambie de
  proveedor.
- **Alternativas consideradas:**
  1. Implementar YouTube directo, abstraer después → deuda técnica.
  2. Abstraer desde el inicio, coste ~2h extra ahora. ✅
- **Riesgo:** Sobreenfoque arquitectónico. Mitigado: las abstracciones son
  mínimas (una interfaz, no un framework).
- **Cómo revertir:** Eliminar las implementaciones no usadas; el contrato se
  mantiene.

---

## D-006 · YouTube no listado como video inicial

- **Fecha:** 2026-06-22
- **Decisión:** Usar YouTube no listado para el MVP, documentando claramente que
  NO es protección real.
- **Motivo:** Cero costo, cero infraestructura, reproducción robusta. Adecuado
  para demo y contenido gratuito/de vista previa.
- **Alternativas consideradas:** Ver `docs/VIDEO_STRATEGY.md`.
- **Riesgo:** Contenido de pago quedaría expuesto si no se migra a tiempo.
- **Cómo revertir:** Cambiar `provider` en el `VideoAsset` de cada lección y
  completar el backend de firma de URLs (Fase 3).

---

## D-007 · Mercado Pago como proveedor inicial recomendado (Fase 2)

- **Fecha:** 2026-06-22
- **Decisión:** Recomendar Mercado Pago como primer proveedor real, dejando
  Stripe y Conekta preparados como alternativas.
- **Motivo:** Mejor conversión para métodos locales mexicanos (tarjeta, OXXO,
  SPEI) con la menor fricción de integración.
- **Alternativas consideradas:** Ver `docs/PAYMENTS_MEXICO_STRATEGY.md`.
- **Riesgo:** Dependencia de un proveedor. Mitigado: la abstracción permite
  cambiar o agregar proveedores sin tocar la UI.
- **Cómo revertir:** Implementar otro provider y cambiar
  `NEXT_PUBLIC_PAYMENT_PROVIDER`.

---

## D-008 · Paleta: morado `#AB3FEA` dominante + naranja `#EF9F08` de acento

- **Fecha:** 2026-06-22
- **Decisión:** Usar la paleta detectada en los assets de marca (morado
  principal, morado secundario, naranja acento). El morado es dominante; el
  naranja solo como acento.
- **Motivo:** Respeta la guía de identidad visual del zip y da sensación premium
  orientada a conversión.
- **Alternativas consideradas:**
  1. Propuesta propia distinta → chocaría con los logos reales.
  2. Respetar la guía de marca. ✅
- **Riesgo:** Mínimo. Si la marca evoluciona, las variables CSS en
  `globals.css` y `tailwind.config.ts` centralizan el cambio.
- **Cómo revertir:** Editar `--brand-primary` y `brand.500` en un solo lugar.

---

## D-009 · Componentes UI propios en lugar de una librería

- **Fecha:** 2026-06-22
- **Decisión:** Escribir primitivos UI (Button, Card, Badge, Input, etc.) en
  lugar de usar Radix/shadcn/MUI.
- **Motivo:** Menos dependencias, bundle más liviano, control total del diseño
  de marca y aprendizaje cero de una API externa.
- **Alternativas consideradas:**
  1. shadcn/ui → excelente, pero añade dependencias y estilos prefijados.
  2. MUI/Chakra → demasiado pesado para este MVP.
  3. Primitivos propios. ✅
- **Riesgo:** Más trabajo inicial y hay que mantener accesibilidad manualmente.
- **Cómo revertir:** Si se quiere migrar a shadcn, los componentes actuales se
  reemplazan uno a uno sin tocar las páginas.

---

## D-010 · Assets de marca en `/public/brand` sin modificar originales

- **Fecha:** 2026-06-22
- **Decisión:** Copiar los PNG originales a `/public/brand/original` y `/public/brand/white`
  sin alterarlos. El manifiesto en `src/lib/brand-manifest.ts` los referencia.
- **Motivo:** La guía de marca prohíbe recolorear o deformar los logos.
- **Alternativas consideradas:** Vectorizar/recolorear → rompe las reglas.
- **Riesgo:** Ninguno. Los assets son solo de lectura.
- **Cómo revertir:** No aplica.

---

## D-011 · Dominio de email de marca: `@qlick.com`

- **Fecha:** 2026-06-23
- **Decisión:** Unificar los emails de demostración a `@qlick.com` (antes
  `@click.com`) en `users.ts`, `login/page.tsx` y `mock-auth.ts`.
- **Motivo:** Coherencia con D-001 (la marca es "Qlick"). Mantener `@click.com`
  creaba una inconsistencia visible: la UI decía "Qlick" pero los correos demo
  usaban "Click".
- **Alternativas consideradas:**
  1. Dejar `@click.com` → inconsistencia con el naming.
  2. Usar `@qlick.mx` (dominio real de contacto) → mezcla cuenta real con cuenta
     demo; mejor reservar `@qlick.mx` para el email de negocio
     (`NEXT_PUBLIC_CONTACT_TO_EMAIL`).
  3. `@qlick.com` para cuentas demo, `@qlick.mx` para contacto real. ✅
- **Riesgo:** Mínimo. Cambio mecánico de strings.
- **Cómo revertir:** Búsqueda global de `@qlick.com` en las cuentas demo y
  reemplazo textual.

---

## D-012 · Transparencia de assets blancos: no usar directo sobre fondos oscuros

- **Fecha:** 2026-06-23
- **Decisión:** Sobre fondos oscuros se prohíbe el uso directo de los PNG
  `white/*`; en su lugar se usa el isotipo `original` (morado transparente) o el
  componente `<BrandLockup variant="dark">`.
- **Motivo:** La auditoría técnica (ver `docs/BRAND_ASSET_AUDIT.md`) determinó que
  los archivos `white/*` son `colorType: 2` (RGB, **sin canal alfa**): son
  rectángulos opacos. Renderizarlos sobre un fondo oscuro produce una "caaja"
  visible (el defecto que aparecía en footer y CTA del home).
- **Alternativas consideradas:**
  1. Recolorear/reexportar los PNG blancos con alfa → rompe la regla "no modificar
     originales" (D-010) y requiere herramientas externas.
  2. Pedir SVGs a diseño → correcto a medio plazo, pero no resuelve el MVP hoy.
  3. Sustituir el uso por `BrandLockup dark` (isotipo morado + texto tipográfico
     blanco) que da el mismo efecto visual sin el defecto. ✅
- **Riesgo:** El `BrandLockup` no es el logo "oficial" tipográfico; es una
  composición funcional. Si diseño entrega un logo blanco con transparencia real
  o un SVG, se puede revertir a `Logo variant="white"`.
- **Cómo revertir:** Tras recibir assets limpios, restaurar `variant="white"` en
  footer/CTA. La verificación anti-regresión es `grep variant="white"` (hoy da 0).

---

## D-013 · Abstracción de contacto (`ContactProvider`) y helper de WhatsApp

- **Fecha:** 2026-06-23
- **Decisión:** Crear `src/lib/contact/` con una interfaz `ContactProvider` (mock
  activo + stubs `resend`/`crm`) y un helper `getWhatsAppLink(intent)` con
  fallback `configured:false`.
- **Motivo:** Mismo principio que D-005 (video/pagos): aislar el canal externo
  para que el MVP funcione sin configuración y la activación real sea una env var,
  no un refactor. Además, evita botones/links "fantasma": cuando falta la env var,
  el helper devuelve `configured:false` y la UI muestra un estado explícito
  ("próximamente") en lugar de un `href="#"`.
- **Alternativas consideradas:**
  1. Hardcodear `wa.me` y un `<form>` con `action="mailto:..."` → frágil, sin
     validación, sin fallback limpio.
  2. Conectar Resend desde el inicio → requiere cuenta externa para el MVP.
  3. Abstracción con proveedor mock activo y helper con fallback. ✅
- **Riesgo:** El `mockContactProvider` no persiste mensajes (solo loggea). Está
  etiquetado como demo en la UI.
- **Cómo revertir:** `NEXT_PUBLIC_CONTACT_PROVIDER=resend` activa el proveedor de
  email una vez completado su stub; los componentes no cambian.

---

## D-014 · CRM en modo demo (foundation, sin backend)

- **Fecha:** 2026-06-23
- **Decisión:** Construir la foundation completa del CRM (tipos, datos mock,
  servicios de lectura/escritura, UI kanban/tabla/conversaciones/calendario y
  integración del formulario de contacto) **sin** conectar Supabase ni un CRM
  externo. Las escrituras (`createLeadFromContactForm`, `changeLeadStatus`)
  devuelven `demo: true` y no persisten.
- **Motivo:** Permite validar el flujo comercial completo y mostrar el producto a
  ventas/QA sin acoplarse a un backend (regla D-003: sin ORM/DB en el MVP). La
  firma pública de los servicios está pensada para migrar a Supabase sin tocar la
  UI, igual que el resto de `src/lib/data/*`.
- **Alternativas consideradas:**
  1. Esperar a Supabase para tocar CRM → retrasa validación de producto.
  2. Conectar un CRM externo (HubSpot) desde ya → rompe D-003 y requiere cuenta.
  3. Foundation mock con misma forma que la DB futura. ✅
- **Riesgo:** Alguien podría creer que los datos son reales. Mitigado: banner
  "demo" en cada sección, etiquetas `demo:true` en escrituras, nota de privacidad
  en `/contacto`.
- **Cómo revertir:** Migrar `src/lib/data/crm-data.ts` a tablas Supabase con la
  misma forma; los servicios mantienen su firma. Ver `docs/CRM_STRATEGY.md`.

---

## D-015 · Abstracción de proveedor de WhatsApp (`WhatsAppProvider`)

- **Fecha:** 2026-06-23
- **Decisión:** Crear `src/lib/whatsapp/` con una interfaz `WhatsAppProvider`
  (manual click-to-chat activo + stubs `meta_cloud_api`/`bsp`) y webhooks
  placeholder, siguiendo el mismo patrón que pagos/video/contacto (D-005/D-013).
- **Motivo:** WhatsApp es el canal principal de ventas en México y el que más
  riesgo de refactor y de ban trae (métodos no oficiales). Tener la abstracción
  desde el inicio permite migrar manual → Cloud API → BSP sin tocar la UI ni el
  CRM, y deja documentado que **solo** se usarán vías oficiales.
- **Alternativas consideradas:**
  1. Hardcodear `wa.me` y automatizar la app luego → deuda + riesgo de ban.
  2. Conectar la Cloud API desde ya → requiere negocio verificado y opt-in.
  3. Abstracción con manual activo y stubs oficiales documentados. ✅
- **Riesgo:** El `manualWaProvider` no envía mensajes automatizados (solo
  click-to-chat). Está etiquetado; el agente IA opera en modo sugerencia.
- **Cómo revertir:** Completar `metaCloudApiProvider`/`bspProvider` y resolver el
  activo por `NEXT_PUBLIC_WHATSAPP_PROVIDER`. La UI no cambia. Ver
  `docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md`.

---

## D-016 · Agente IA en modo sugerencia con guardrails duros

- **Fecha:** 2026-06-23
- **Decisión:** El Agente IA (`src/lib/ai/`) opera **siempre** en modo sugerencia
  (`AgentResult.needsReview: true`). Implementar guardrails en `guardrails.ts`
  (`mustEscalateToHuman`, `validateAgentReply`, `recommendCourseHeuristic` que no
  inventa) que aplican al proveedor mock actual **y** a cualquier LLM real futuro.
  El agente nunca confirma pagos, accesos ni descuentos.
- **Motivo:** Reducir riesgo de alucinaciones y de "commitments" no autorizados.
  Un LLM puede inventar precios o "confirmar" un pago; los guardrails lo impiden
  antes de que la propuesta llegue al humano. El proveedor `mock` (determinista)
  sirve de baseline y para QA reproducible.
- **Alternativas consideradas:**
  1. Autoenvío desde el día 1 → inaceptable sin métricas de seguridad.
  2. Agente solo cuando haya LLM → pierde baseline y validación de flujos.
  3. Modo sugerencia + guardrails duros desde la foundation. ✅
- **Riesgo:** Quitar `needsReview` por accidente habilitaría autoenvío. Mitigado:
  el flag es explícito y la UI repite "revisa antes de enviar".
- **Cómo revertir:** Cambiar `needsReview` a `false` sería una decisión de producto
  **separada**, solo para intents de bajo riesgo y con logging. Ver
  `docs/AI_AGENT_GUARDRAILS.md`.

---

## D-017 · Bootstrap de conexión a Supabase (sin migrar datos todavía)

- **Fecha:** 2026-06-23
- **Decisión:** Añadir la capa de conexión a Supabase — dependencias
  (`@supabase/supabase-js`, `@supabase/ssr`), clientes browser/server/admin con
  separación estricta de secretos, `config.ts` + `health.ts`, ruta interna de
  diagnóstico (`/admin/system/supabase`), estructura `supabase/` con migraciones
  versionadas placeholder, script `check:supabase` y docs (bootstrap, runbook
  MCP, protocolo del agente, env vars Vercel) — **sin** crear proyecto Supabase,
  **sin** tocar los mocks de LMS/CRM, **sin** auth real.
- **Motivo:** Preparar la conexión controlada antes de la Fase 1 para que, cuando
  se apruebe el proyecto, la migración sea sustitución de mocks por queries con
  la misma firma (D-003/D-014). El build debe seguir pasando aunque ninguna env
  var Supabase esté configurada (modo demo), igual que el resto de
  abstracciones (D-005/D-013/D-015).
- **Alternativas consideradas:**
  1. Esperar a tener proyecto Supabase para añadir nada → retrasa la
     preparación y obliga a un cambio más grande después.
  2. Conectar Supabase y migrar mocks de una vez → rompe la regla de "sin
     datos reales sin RLS + aviso de privacidad" y mezcla dos fases.
  3. Bootstrap de conexión solo (esta opción). ✅
- **Riesgos:**
  - Alguien podría creer que Supabase ya está activo. Mitigado: el health-check
    muestra "demo/fallback" y los mocks siguen siendo la fuente.
  - Fuga de la `secret_key` al navegador. Mitigado: `admin.ts` valida
    `typeof window === 'undefined'` y lanza; regla dura en
    `AGENT_SUPABASE_PROTOCOL.md`.
  - Costo por crear proyecto sin aprobación. Mitigado: el protocolo del agente
    lo prohíbe.
- **Cómo revertir:** Eliminar `src/lib/supabase/`, la ruta `/admin/system/supabase`,
  la carpeta `supabase/`, el script `check-supabase-env.mjs` y desinstalar las
  dependencias. Ningún componente existente depende de esta capa (es aditiva).

---

## D-018 · Auth admin con Supabase Auth + allowlist server-side

- **Fecha:** 2026-06-25
- **Decisión:** Proteger `/admin/*` y `/api/admin/*` con Supabase Auth
  (magic link OTP) más un **allowlist server-side** (`ADMIN_EMAIL_ALLOWLIST`).
  El cliente browser solo usa la publishable key (respeta RLS); la service
  role key se usa exclusivamente desde route handlers server-side para
  operaciones admin (status, notas, tareas, audit log) bypassing RLS por
  necesidad de negocio. La validación de allowlist se hace en **dos puntos
  independientes**: el callback (cierra sesión si no está) y el middleware
  (rebota en cada request).
- **Motivo:**
  - **Anti-enumeración:** la action de "pedir magic link" no revela si un
    email es admin (siempre devuelve éxito genérico). La validación real
    ocurre en el callback y el middleware, donde el atacante no llega si
    no tiene el enlace.
  - **PKCE obligatorio:** `@supabase/ssr` usa PKCE por defecto. El
    `code_verifier` debe persistir en cookies **del navegador**, no del
    server. Por eso `signInWithOtp` se llama desde un Client Component
    (`src/lib/auth/admin-auth-client.ts`) con acceso literal a
    `process.env.NEXT_PUBLIC_*` (para que Next.js las inline en el bundle).
  - **Service role para ops, RLS para todo lo demás:** los datos de leads
    son accesibles para el admin sin filtrar por RLS (necesario para
    gestión), pero **toda** operación admin se hace desde route handlers
    con `requireAdmin()` validando allowlist — nunca desde el cliente.
  - **Defensa en profundidad:** middleware filtra, callback cierra sesión
    si no allowlisted, route handlers re-validan. Si una capa falla, las
    otras contienen.
- **Alternativas consideradas:**
  1. Auth con email + password → más fricción para el usuario, recovery
     flow propio que mantener.
  2. Auth con OAuth (Google) → requiere configurar proveedor, scopes y
     mapeo email → allowlist adicional.
  3. Magic link OTP + allowlist server-side + service role solo en
     handlers. ✅
  4. Asumir "cualquier usuario autenticado es admin" → riesgoso: un
     alumno registrado tendría acceso a `/admin`.
- **Riesgos:**
  - **Fuga de service role key al cliente.** Mitigado: `admin.ts` valida
    `typeof window === 'undefined'` y lanza; regla dura en
    `AGENT_SUPABASE_PROTOCOL.md`.
  - **Rate-limit del plan free (2 emails/h).** Mitigable: subir a Pro
    para prod, esperar entre iteraciones en dev.
  - **Alguien agrega un email al allowlist por error.** Mitigado: el
    allowlist está en `.env.local` (no comiteado) y se documenta que
    cualquier cambio requiere OK.
  - **Sesión caducada sin aviso claro.** Mitigado: el middleware
    redirige a `/admin/login` con query param si la cookie expira
    mientras el usuario navega.
- **Cómo revertir:** Eliminar `middleware.ts`, los archivos en
  `src/lib/auth/`, la ruta `/auth/callback`, `src/app/admin/login/`,
  las rutas API admin, `src/lib/crm/` y la dependencia de
  `@supabase/ssr`. Restaurar el panel admin en modo mock (D-004). El
  CRM en demo (D-014) sigue funcionando con datos mock.

---

## D-019 · Masterclass Funnel Foundation (v0.6.0)

- **Fecha:** 2026-06-25
- **Decisión:** Modelar el embudo de adquisición como dos tablas nuevas
  (`masterclasses`, `masterclass_registrations`) con RLS estrictas:
  - `masterclasses`: lectura pública SOLO para publicadas. Escritura solo
    vía service role.
  - `masterclass_registrations`: SIN políticas públicas. El registro
    SIEMPRE pasa por un server action con service role que también
    crea/reusa el lead.
- **Motivo:** Separar el catálogo público de los registros privados
  refleja la realidad del negocio (la landing debe ser pública, los leads
  son datos personales bajo LFPDPPP). El server action público evita
  exponer la `service_role` key y mantiene RLS como defensa en
  profundidad: aunque alguien conozca el endpoint REST de
  `masterclass_registrations`, no puede leer ni escribir directo.
- **Alternativas consideradas:**
  1. Reusar la tabla `leads` para todo (sin `masterclass_registrations`)
     → pierde el modelo de "asistió / convertido / no show" específico
     del funnel de masterclass.
  2. Permitir INSERT público a `masterclass_registrations` con RLS →
     expone datos personales de leads al cliente; cualquier persona con
     el anon key puede inyectar registros. ❌
  3. Tabla separada + server action público + RLS deny en registrations
     + service role server-side. ✅
- **Riesgos:**
  - **El server action público es el único punto de inserción**: si
    tiene un bug, el funnel se rompe silenciosamente. Mitigado: tests
    manuales + checks de `consent_to_contact` + fallback demo cuando
    Supabase no está configurado.
  - **Vinculación lead ↔ registration por email**: si alguien manipula
    el email en el form, puede "apropiarse" del lead de otra persona.
    Mitigable: agregar verificación de email o auth obligatorio en
    una fase posterior.
  - **Doble rol del enum `source` en lead**: hoy usamos `'other'` porque
    `lead_source` no incluye 'masterclass'. Migración futura puede
    extender el enum.
- **Cómo revertir:** Eliminar las tablas (`DROP TABLE
  public.masterclass_registrations; DROP TABLE public.masterclasses;`),
  los archivos en `src/lib/masterclasses/`, las rutas en
  `src/app/masterclass/` y `src/app/admin/masterclass/`, los server
  actions en `src/app/actions/{masterclass,admin-masterclass}.ts` y el
  enlace en `AdminView.tsx`. El CRM admin y el resto de la app siguen
  funcionando como en v0.5.1.

---

## D-020 · Lead ↔ Event link con tabla de join `lead_event_links` (v0.7.0)

- **Fecha:** 2026-06-26
- **Decisión:** Para vincular leads con records de eventos, usamos una
  tabla de join dedicada `lead_event_links` con FK a `leads` y `events`,
  y un FK lógica (no enforced) al record según `link_type` enum
  (`'confirmation' | 'attendee' | 'survey'`).
- **Motivo:** En Fase 2 implementamos `linkLeadToEventRecord` como STUB
  que agregaba un tag al array `tags` del lead. Esto se identificó
  como **H2 del QA round 1** (race condition: SELECT-then-UPDATE sobre
  `leads.tags`). Al llegar Fase 3 (Events Funnel Foundation) decidimos
  cerrar el bug **por construcción** en lugar de mitigarlo con un
  trigger:
  - INSERT-only (no UPDATE sobre datos compartidos).
  - UNIQUE constraint `(lead_id, link_type, link_id)` hace la
    idempotencia en la DB.
  - Dos requests concurrentes que intenten agregar el mismo link: uno
    gana (INSERT), el otro recibe `23505 unique_violation` y se
    reporta como "ya estaba".
- **Alternativas consideradas:**
  1. Trigger `BEFORE UPDATE` que merge el array `tags` — más complejo,
     debugging difícil si rompe.
  2. `metadata jsonb` en `leads` con array de links — schema más flexible
     pero pierdes las constraints de FK.
  3. Tabla de join con INSERT-only + UNIQUE constraint. ✅
- **Riesgos:**
  - **`link_id` no es FK enforced** (sería costoso hacer 3 FKs opcionales
    a 3 tablas distintas). Mitigable con trigger si se vuelve un problema
    de integridad. Por ahora: baja probabilidad de inconsistencia porque
    los callers son server-side.
  - **Tabla crece rápido** si un lead se vincula a muchos eventos. Sin
    riesgo conocido (un lead difícilmente viene de >100 eventos).
- **Cómo revertir:** DROP TABLE `public.lead_event_links` + restaurar el
  STUB tag-based en `leads-server.ts:linkLeadToEventRecord`. Reversible
  en 1 migration + 1 revert de commit.

---

## D-021 · Cierre del H2 del QA Fase 2 — race condition en `linkLeadToEventRecord` (v0.7.0)

- **Fecha:** 2026-06-26
- **Decisión:** Resolver el H2 (race condition) **por construcción** vía
  la tabla `lead_event_links` (D-020) en lugar de mitigarlo con un
  trigger de merge en `leads.tags`.
- **Motivo:** el patrón "tag array con merge manual" es frágil y difícil
  de razonar bajo concurrencia. Una tabla de join dedicada es la
  solución canónica y se alinea con cómo se hacen los joins lead↔evento
  en cualquier sistema real (Salesforce, HubSpot, etc.).
- **Relación con otros ADRs:** D-020 describe la mecánica. Este ADR es
  el "por qué cerramos H2 acá y no en Fase 2".
- **Por qué NO en Fase 2:**
  - En Fase 2 no existían las tablas `events` (se planearon para Fase 3).
    La FK de `lead_event_links` requiere que `events` exista.
  - El STUB tag-based de Fase 2 era aceptable como placeholder porque
    Fase 3 iba a reemplazarlo de inmediato. Documentamos el riesgo en el
    QA round 1 (riesgo #11 del doc).
- **Cierre:** commit `d0acaaa` en `feat/events-funnel-foundation`.
  Test #7 de `_test-fase3.mjs` valida la idempotencia con dos inserts
  seguidos (la segunda devuelve `23505`).
- **Cómo revertir:** ver D-020.

## D-022 · Adopción de Mavis multi-agent team para Qlick LMS

- **Fecha:** 2026-06-29
- **Decisión:** Adoptar la estructura Mavis multi-agent team en este
  repo: `AGENTS.md` (raíz, contrato global OpenCode/agents.md) +
  `.harness/agent.md` (orchestrator) + 6 reins en `.harness/reins/`
  (`developer`, `tester`, `code-reviewer`, `crm-expert`,
  `lms-payments-expert`, `supabase-expert`) + `.harness/docs/project-standards.md`
  (índice cross-cutting) + `.harness/memory/MEMORY.md` (memoria compartida).
- **Motivo:** tres razones concretas.
  1. **Consolidación de ground truth.** Las reglas operativas estaban
     dispersas en 5+ docs (`HOW-TO-RUN.md`, `GITHUB_WORKFLOW.md`,
     `AGENT_SUPABASE_PROTOCOL.md`, `AI_AGENT_GUARDRAILS.md`,
     `PRIVACY_AND_DEPLOY_CHECKLIST.md`) sin un índice unificado. Un agente
     nuevo (OpenCode, Codex, Cursor, Devin, Mavis) tenía que abrirlos todos.
     `AGENTS.md` + `project-standards.md` resuelven eso.
  2. **Routing por dominio.** Cuando David pide "agregale Stripe al
     checkout", el orchestrator sabe que va a `lms-payments-expert` y a
     `docs/PAYMENTS_MEXICO_STRATEGY.md` sin re-descubrir el dominio en
     cada turno.
  3. **Scope boundaries.** Cada rein declara qué NO toca (DDL destructivo,
     secrets, push a main), evitando que workers se pisen entre sí en
     team plans paralelos.
- **Lo que NO hace esta decisión:**
  - **No** agrega trazabilidad por sí sola. La trazabilidad real del
    proyecto sigue siendo `data/PROJECT-LOG.md` (log append-only),
    `docs/DECISIONS.md` (este archivo), `docs/STATUS.md` (snapshot) y
    `docs/HANDOFF_*.md` (cierre de fase).
  - **No** reemplaza los docs canónicos. `docs/GITHUB_WORKFLOW.md`,
    `docs/AGENT_SUPABASE_PROTOCOL.md`, `docs/AI_AGENT_GUARDRAILS.md` y
    `docs/PRIVACY_AND_DEPLOY_CHECKLIST.md` siguen siendo la fuente de
    verdad; `project-standards.md` los resume y enlaza. Cada uno recibió
    un header note el 2026-06-29 apuntando a su contraparte en `.harness/`.
- **Lexical precedence** (definida en `project-standards.md`, de mayor a
  menor autoridad): `docs/*` → `AGENTS.md` → `project-standards.md` →
  `agent.md` del rein.
- **Reins definidos y dominios:**
  - `developer` — `src/app/**`, `src/components/**`, `src/lib/**` (genérico).
  - `tester` — `tests/*.test.mjs`, TDD bug reproduction.
  - `code-reviewer` — gate pre-merge: RLS + PII + types + a11y + commits.
  - `crm-expert` — eventos, CRM (kanban, leads, conversaciones), WhatsApp,
    masterclass, contacto, agente IA modo sugerencia.
  - `lms-payments-expert` — `src/app/cursos/**`, `/aprender/**`,
    `/dashboard/**`, `/pagar/**`, `src/lib/lms/**`, `payments/**`,
    `video/**`, `qr/**`.
  - `supabase-expert` — `supabase/migrations/**`, `src/lib/supabase/**`
    (client + admin), `src/lib/audit/**`, `src/lib/email/**`, seeds,
    env vars.
- **Reversibilidad:** alta. `.harness/` se puede borrar sin tocar código
  de producto. Los docs canónicos en `docs/` siguen funcionando sin
  `.harness/`. El commit se puede revertir con `git revert` sin
  consecuencia operacional.
- **Próximo paso:** commit `chore(harness): bootstrap Mavis multi-agent
  team + doc sync` desde la terminal de David. Push después.
- **Cómo revertir:** borrar `.harness/` y `AGENTS.md`, revertir el commit
  de sync de headers en los 4 docs canónicos. No tocar código de producto.

---