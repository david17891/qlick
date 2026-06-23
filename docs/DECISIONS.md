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
