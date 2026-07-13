# SUPER_AUDIT_REMEDIATION_PROTOCOL.md — Protocolo Canónico de Remediación de Súper-Auditoría (Minimax Engine)

> **Audience:** Mavis / Minimax AI Multi-Agent Team (`.harness/`).
> **Goal:** Ejecutar la remediación sistemática, ordenada y libre de regresiones de los **10 hallazgos certificados (`AUDIT-001` a `AUDIT-010`)** reportados en `private-data/reports/super_audit_master.json`, trabajando por olas de prioridad en la rama dedicada `fix/super-audit-remediation-2026`.

---

## 🚀 Instrucción de Ejecución por Olas (Para Minimax)

Minimax ejecutará las correcciones divididas estrictamente en **3 Olas Atómicas de Remediación**. Al concluir cada ola, verificará que `npm test`, `npm run type-check` y `npm run lint` sigan en verde antes de avanzar a la siguiente ola.

---

## 🌊 OLA 1: Remediación Crítica de Conversión y CI (`Remediación Nivel 1`)
*Objetivo: Eliminar el voseo rioplatense del checkout y activar la compuerta automática de CI.*

1. **`AUDIT-008` — Integración del Script `audit:voseo` a `package.json`**
   - Renombrar `scripts/_audit-voseo-templates.mjs` $\to$ `scripts/audit-voseo.mjs` (eliminar el guión bajo inicial).
   - Registrar en `package.json`:
     ```json
     "audit:voseo": "node scripts/audit-voseo.mjs"
     ```
   - Refinar el script `audit-voseo.mjs`: Asegurar que ignore palabras técnicas legítimas del español (como `Parámetro`, `parámetro`, `diámetro`) para eliminar falsos positivos y mantener únicamente la detección de conjugaciones verbales rioplatenses (`podés`, `tenés`, `querés`, `ingresá`, `confirmá`, etc.).

2. **`AUDIT-003` — Limpieza Estricta de Voseo en el Checkout (`/pagar`)**
   - Editar `src/app/pagar/[courseSlug]/page.tsx` y reemplazar las 3 conjugaciones rioplatenses por español neutro mexicano:
     - Línea 155: `'Ya tenés este curso'` $\to$ `'Ya tienes este curso'`
     - Línea 160: `'podés reenviarlo desde tu dashboard'` $\to$ `'puedes reenviarlo desde tu dashboard'`
     - Línea 286: `'¿Querés ver el detalle antes de pagar?'` $\to$ `'¿Quieres ver el detalle antes de pagar?'`
   - **Verificación Ola 1:** Ejecutar `npm run audit:voseo` confirmando 0 coincidencias en toda la plataforma.

---

## 🌊 OLA 2: Rendimiento, Resiliencia y UX Premium (`Remediación Nivel 2`)
*Objetivo: Prevenir sobrecargas de memoria en el CRM, brindar skeletons de carga en las 5 rutas core y preparar webhooks de pago latinos.*

1. **`AUDIT-001` — Paginación y Límite de Memoria en `leads-server.ts`**
   - En `src/lib/crm/leads-server.ts` (líneas 64, 89, 130), modificar `getLeads()` y sus variantes. Reemplazar el `select('*')` sin cota por una consulta paginada utilizando `.range(from, to)` o `.limit(PAGE_SIZE)` con un `PAGE_SIZE = 50` por defecto, aceptando un parámetro `?page=N`. Esto previene un `table scan` masivo al escalar la base de leads.

2. **`AUDIT-004` & `AUDIT-010` — Esqueletos de Carga (`loading.tsx`) y 404 Branded (`not-found.tsx`)**
   - Para cada una de las 5 rutas core (`/admin/dashboard`, `/lms`, `/crm`, `/eventos`, `/admin/bot`):
     - Crear un `loading.tsx` elegante y reutilizable (utilizando `animate-pulse`, skeletons grises y diseño responsivo) para que el usuario jamás vea un salto o página en blanco.
     - Crear un `not-found.tsx` con el branding oficial de Qlick, mensajes amables en español neutro y botones claros para redirigir al Dashboard o a los Cursos.

3. **`AUDIT-005` — Estructura Base de Webhooks para MercadoPago y Conekta**
   - Crear los archivos de ruta canónicos:
     - `src/app/api/webhooks/mercadopago/route.ts`
     - `src/app/api/webhooks/conekta/route.ts`
   - Implementar el esqueleto transaccional con verificación de firmas (`HMAC SHA256` / cabeceras oficiales) devolviendo error `401 Unauthorized` si la firma es inválida y `200 OK` tras procesar exitosamente la confirmación del pago.

---

## 🌊 OLA 3: Tipados Quirúrgicos, Políticas RLS y Catálogo (`Remediación Nivel 3`)
*Objetivo: Cerrar deudas técnicas de tipado, habilitar políticas en tablas administrativas de UI y sincronizar documentación.*

1. **`AUDIT-002` — Políticas RLS Explícitas para Tablas de UI del CRM**
   - Para las tablas que el Admin UI consulta desde el cliente o mediante server actions (`crm_notes`, `crm_tasks`, `lead_interactions`), crear la migración SQL `supabase/migrations/YYYYMMDDHHMMSS_crm_admin_rls_policies.sql` habilitando políticas de acceso por rol (`COALESCE((auth.jwt() ->> 'app_role') = ANY(ARRAY['admin','instructor']), false)`).

2. **`AUDIT-007` & `AUDIT-009` — Narrowing de Tipos en `stripe/route.ts`**
   - En `src/app/api/webhooks/stripe/route.ts`, importar el tipo oficial de Stripe (`import type Stripe from 'stripe';`) y reemplazar los `as any` y `@ts-ignore` en el parseo de eventos de checkout mediante validación de tipos por discriminador (`if (event.type === 'checkout.session.completed') { const session = event.data.object as Stripe.Checkout.Session; ... }`).

3. **`AUDIT-006` — Sincronización del Catálogo de Cursos en Documentación**
   - Actualizar `docs/ROADMAP.md` y `docs/STATUS.md` reflejando que el catálogo productivo de Qlick cuenta con **6 cursos, 15 módulos y 45 lecciones** en Supabase, reemplazando la referencia histórica obsoleta de 4/12/36.

---

## 📝 Contrato de Cierre y Verificación para Antigravity

Al finalizar las 3 Olas de Remediación, Minimax debe actualizar `docs/SUPER_AUDIT_REPORT_2026.md` marcando los 10 hallazgos como **`[RESOLVED]`** e indicar en la descripción del PR las métricas finales verificadas:

- **Type-Check (`tsc --noEmit`):** 0 errores.
- **Lint (`npm run lint`):** 0 errores / 0 warnings.
- **Tests (`npm test`):** 1,262+ tests en verde sin regresiones.
- **Voseo Audit (`npm run audit:voseo`):** 0 coincidencias en código productivo.

---

## 🛑 Criterios de Aceptación (`DO NOT STOP UNTIL ALL ARE TRUE`)

1. **Las 3 Olas Completadas:** Implementadas exitosamente las remediaciones de las Olas 1, 2 y 3.
2. **Suite Global 100% Verde:** `npm test` pasa la totalidad de los tests en la rama `fix/super-audit-remediation-2026`.
3. **Cero Voseo en Checkout:** Verificado con el nuevo comando oficial `npm run audit:voseo`.
4. **Commit + PR Abierto:** Commit atómico `fix(audit): remediación sistemática de 10 hallazgos certificados (Olas 1 a 3)` y PR hacia `main`.
