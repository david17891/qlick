# Plan: Entitlements + Sistema de Pagos Simulado

> Capa de acceso comercial del LMS. Diferencia cursos gratis / de pago / freemium,
> deja el sistema listo para reemplazar el simulador por Stripe / MercadoPago / Conekta
> sin reescribir la lógica de acceso.
>
> **Decisiones congeladas el 2026-06-25 con David** (sesión nocturna, antes de dormir).
> **Próxima sesión**: arrancar **Fase A (schema)**.

---

## Decisiones congeladas

| # | Pregunta | Resolución |
|---|---|---|
| 1 | ¿Cuántos cursos de pago arrancamos? | **1 gratis + 1 de pago** (escalar a 2+2 después de validar) |
| 2 | ¿Precio del curso de pago? | **$499 MXN** (barrera baja para testear con socios) |
| 3 | ¿Acceso permanente o expira? | **Permanente**. Campo `expires_at` ya existe en schema, default `NULL` |
| 4 | ¿El QR aplica a cursos de pago? | **Dual**: QR general → `/cursos?ref=qr_general` (awareness). QR por curso → `/inscripcion/[slug]?ref=qr` (caso conferencia). Solo aplica a cursos gratis. |
| 5 | ¿Login requerido para cursos gratis? | **SÍ**. OAuth Google es obligatorio para consumir contenido (gratis o pago). Funnel de ventas claro. |
| 6 | ¿Email transaccional de compra? | **No en MVP**. Se agrega cuando se decida proveedor |
| 7 | Re-entry de alumno que ya pagó | No le vuelve a pedir pago. Check: `access_status='active' AND (expires_at IS NULL OR expires_at > now())` |

### Detalle de decisión #5 (lectura final, validada por David)

**Objetivo comercial claro**: vender, vender y llevar a suscripción. Los cursos gratis son **parte del funnel de ventas**, no branding social.

**Implicación**: el alumno DEBE estar logueado para consumir contenido del LMS, también en cursos gratis. Esto permite:

- Tracking de progreso desde el primer momento.
- Datos del alumno capturados desde el inicio.
- Funnel claro: anónimo ve landing/contenido público → login → consume → eventualmente paga.
- Remarketing basado en comportamiento real.
- Métricas de conversión (cuántos ven, cuántos se loguean, cuántos pagan).

```
Catálogo público (/cursos):                  preview SIN login (título, descripción, precio, módulos listados)
Detalle público (/cursos/[slug]):            preview SIN login (estructura, primeras lecciones como preview)
Curso gratis — ver lecciones completas:      CON login
Curso gratis — guardar progreso:             CON login (ya logueado, automático)
Curso gratis — descargar recursos:           CON login
Curso gratis — reclamar constancia:          CON login
Curso de pago — cualquier lección:           CON login + course_access.active
```

**OAuth Google es el método de login primario** (mercado mexicano, ya implementado). Email + password NO se ofrece en MVP.

**Tabla de captura de leads**: NO se crea tabla nueva `course_anon_leads`. El tracking se hace via `enrollments` + `course_access` + tabla `leads` existente (rama `feature/supabase-leads-foundation`) que ya tiene campos para captura de marketing.

**Validado por David el 2026-06-25**: "nuestro objetivo es vender, vender y llevar a suscripción". Mi recomendación original de login obligatorio para cursos gratis queda firme.

### Detalle de decisión #4 (QR dual)

**David quiere las dos opciones de QR**:

1. **QR general** (marketing masivo): apunta a `/cursos?ref=qr_general`. Se imprime en folleto, se pone en redes, se vincula desde el home. Para awareness.
2. **QR por curso** (caso conferencia): apunta a `/inscripcion/[slug]?ref=qr`. Se imprime en el flyer específico del curso regalado en un evento. Para conversión directa.

**Implementación**:

- Endpoint actual `/api/qr/[slug]` (por curso) **se mantiene igual** apuntando a `/inscripcion/[slug]?ref=qr`.
- Nuevo endpoint `/api/qr/general` apuntando a `/cursos?ref=qr_general`.
- Ambos endpoints devuelven PNG (mismo formato).
- Diferenciable en analytics por el `ref` (`qr` vs `qr_general`).
- Badge "vía QR" en `/inscripcion/[slug]` cuando `?ref=qr` (curso específico).
- Badge "vía QR general" en `/cursos` cuando `?ref=qr_general`.

**Caso de uso dual**:

| Canal | QR | Lleva a | Analytics |
|---|---|---|---|
| Folleto del curso "Fundamentos" en conferencia X | QR por curso | `/inscripcion/fundamentos-marketing-digital?ref=qr` | tracking por curso |
| Tarjeta de presentación con Qlick logo | QR general | `/cursos?ref=qr_general` | tracking agregado de awareness |
| Footer del sitio web | QR general | `/cursos?ref=qr_general` | tracking desde web |

**Para Fase A**: solo el typegen. La implementación del endpoint general es Fase F (Catálogo).

---

## Modelo de datos

### Cambios a `courses` (migración v1.0.0)

```sql
ALTER TABLE courses
  ADD COLUMN access_type text NOT NULL DEFAULT 'free'
    CHECK (access_type IN ('free', 'paid', 'freemium')),
  ADD COLUMN price_mxn integer CHECK (price_mxn IS NULL OR price_mxn >= 0);
```

- `free` → todo público
- `paid` → requiere `course_access.active`
- `freemium` → curso gratis + contenido premium interno (Fase futura, schema ya lo soporta)

### Nueva tabla `course_access` (migración v1.0.0)

```sql
CREATE TABLE course_access (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  access_status   text NOT NULL DEFAULT 'pending'
    CHECK (access_status IN ('active', 'pending', 'expired', 'revoked')),
  access_source   text NOT NULL
    CHECK (access_source IN (
      'free_course', 'simulated_payment', 'manual_admin',
      'stripe', 'mercadopago', 'conekta', 'coupon'
    )),
  payment_id      uuid REFERENCES payments(id) ON DELETE SET NULL,
  starts_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,  -- NULL = permanente
  granted_reason  text,         -- audit: 'paid_via_sim_2026-06-25', etc.
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- UNIQUE: un solo access activo por (user, course). Si se revoca, se puede crear otro.
  CONSTRAINT course_access_active_unique
    EXCLUDE USING gist (user_id WITH =, course_id WITH =)
    WHERE (access_status = 'active')
);

CREATE INDEX idx_course_access_user ON course_access(user_id) WHERE access_status = 'active';
CREATE INDEX idx_course_access_course ON course_access(course_id) WHERE access_status = 'active';

-- RLS
ALTER TABLE course_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own access" ON course_access
  FOR SELECT USING (auth.uid() = user_id);
-- Writes via service role (server-side only). No INSERT/UPDATE policy for anon/authenticated.
```

### Nueva tabla `payments` (migración v1.0.0)

```sql
CREATE TABLE payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id            uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  provider             text NOT NULL DEFAULT 'simulated'
    CHECK (provider IN ('simulated', 'stripe', 'mercadopago', 'conekta')),
  provider_payment_id  text,  -- null para simulated; null en pending
  amount_mxn           integer NOT NULL CHECK (amount_mxn >= 0),
  currency             text NOT NULL DEFAULT 'MXN',
  status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  idempotency_key      text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Idempotencia: un solo payment pendiente por (user, course, key)
  CONSTRAINT payments_idempotency_unique UNIQUE (user_id, course_id, idempotency_key)
);

CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_course ON payments(course_id);
CREATE INDEX idx_payments_status ON payments(status) WHERE status IN ('pending', 'paid');

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);
```

### Tabla `enrollments` — sin cambios

`enrollments` queda como "¿está apuntado al curso?" (status `active | pending_payment | cancelled | expired`).
`course_access` queda como "¿tiene derecho a ver el contenido?" (independiente de enrollment).

**Por qué ambas**: un alumno puede estar inscrito sin haber pagado (pending_payment) y un admin puede dar acceso sin enrollment (manual_admin). Separar evita migraciones futuras.

---

## Server lib `entitlements.ts` (Fase B)

```ts
// src/lib/lms/entitlements.ts
export type AccessResult =
  | { hasAccess: true; source: CourseAccess['access_source']; expiresAt: Date | null }
  | { hasAccess: false; reason: 'not_authenticated' | 'no_access' | 'expired' };

/** Devuelve el access activo del user para un curso, si existe. */
export async function getCourseAccess(
  userId: string | null,
  courseId: string
): Promise<CourseAccess | null>;

/** API de alto nivel: ¿este user puede ver este curso? */
export async function checkCourseAccess(
  userId: string | null,
  courseId: string
): Promise<AccessResult>;

/** API de alto nivel: ¿puede ver esta lección específica? (para Fase E) */
export async function checkLessonAccess(
  userId: string | null,
  courseId: string,
  lessonId: string
): Promise<AccessResult>;

/** Otorga acceso. Usado por: simulador, admin manual, futuro webhook de Stripe. */
export async function grantAccess(params: {
  userId: string;
  courseId: string;
  source: CourseAccess['access_source'];
  paymentId?: string;
  expiresAt?: Date | null;
  grantedReason: string;
}): Promise<CourseAccess>;

/** Revoca acceso. Usado por: refund, admin manual, expiración. */
export async function revokeAccess(params: {
  userId: string;
  courseId: string;
  reason: string;
}): Promise<void>;
```

**Regla de oro**: cualquier página que muestre contenido de un curso de pago llama a `checkCourseAccess` en server-side. Frontend NUNCA decide acceso por sí solo.

---

## Flujos de usuario

### Flujo 1: Alumno anónimo ve curso gratis

```
1. GET /cursos?ref=qr (opcional badge "vía QR")
2. GET /cursos/fundamentos-marketing-digital
3. GET /aprender/fundamentos-marketing-digital/<primera-leccion>
   → server-side: course.access_type='free' → render contenido sin login
4. (opcional) Click "Guardar mi progreso" → modal → email o Google OAuth
   → si OAuth: crear enrollment retroactivo + persistir progreso
```

### Flujo 2: Alumno logueado ve curso de pago SIN pago

```
1. GET /cursos/publicidad-pagada
2. Click "Inscribirme" (botón diferenciado)
3. Redirect a /pagar/publicidad-pagada
4. Server-side: user logueado pero course_access NO existe
   → render página de pago con precio, descripción, botón "Pagar"
5. NO muestra contenido del curso. Solo preview.
```

### Flujo 3: Alumno logueado paga curso de pago (simulado)

```
1. POST /api/dev/simulate-webhook  body: { course_id, event: 'paid' }
   → crea/encuentra payment (idempotency_key = hash(user+course))
   → si event='paid': update payment.status='paid', grantAccess(...)
   → si event='failed': update payment.status='failed', no access
   → si event='pending': payment queda pending (alumno puede volver a intentar)
2. Redirect a /dashboard?paid=ok
3. GET /aprender/publicidad-pagada/<leccion>
   → server-side: checkCourseAccess → active → render contenido
```

### Flujo 4: Alumno con acceso vigente re-entra

```
1. GET /aprender/publicidad-pagada/<leccion>
2. server-side: checkCourseAccess → hasAccess=true (status='active', expires_at=null)
3. Render contenido sin pedir pago
```

---

## Plan de fases

| Fase | Qué entrega | Archivos principales | Esfuerzo | Criterio de cierre |
|---|---|---|---|---|
| **A. Schema** | Migración v1.0.0 con cambios a `courses`, creación de `course_access` + `payments`, RLS. Update de `seed-courses.mjs` para marcar 1 curso como paid y agregar precio. Update de `types/supabase.ts` (typegen manual). | `supabase/migrations/20260625XXXXXX_entitlements_v1.sql`, `scripts/seed-courses.mjs`, `src/types/supabase.ts` | 1-2 h | `npm run type-check && npm run build` green. Query directa a DB confirma 1 curso `access_type=paid, price_mxn=499`. |
| **B. Entitlements core** | Server lib `src/lib/lms/entitlements.ts` con la API de arriba. Tests mínimos manuales via script. | `src/lib/lms/entitlements.ts` | 2-3 h | Script de prueba grant → check → revoke funciona. |
| **C. Simulador** | Endpoint `POST /api/dev/simulate-webhook` + página `/pagar/[slug]` con UI de simulación (3 botones: éxito, fallo, pendiente). Mockea patrón de webhook. | `src/app/api/dev/simulate-webhook/route.ts`, `src/app/pagar/[courseSlug]/page.tsx`, `src/app/pagar/[courseSlug]/SimulatorForm.tsx` | 2-3 h | Login → click "Pagar" → simular éxito → ver `course_access` activo en DB. Simular fallo → no access. Re-simular → idempotente (no duplica). |
| **D. Integración enrollment** | Bifurcar `/inscripcion/[slug]`: si `access_type=free` → flujo actual (OAuth → enroll). Si `paid` → redirige a `/pagar/[slug]`. | `src/app/inscripcion/[courseSlug]/page.tsx`, `src/app/inscripcion/[courseSlug]/EnrollmentLoginButton.tsx` | 1-2 h | Click "Inscribirme" en curso gratis sigue funcionando. En curso de pago, redirige a `/pagar`. |
| **E. UI gating lecciones** | `src/app/aprender/[courseSlug]/[lessonSlug]/page.tsx`: si curso es `paid` y no hay access → render `<Paywall>` con CTA "Ir a pagar". | `src/app/aprender/[courseSlug]/[lessonSlug]/page.tsx`, `src/app/aprender/[courseSlug]/[lessonSlug]/Paywall.tsx` | 1-2 h | Anónimo en curso de pago ve paywall. Logueado sin pago ve paywall. Logueado con pago ve lección. |
| **F. Catálogo** | Badges "GRATIS" / "$499 MXN" / "PREMIUM" en `/cursos` y `/cursos/[slug]`. Cambiar endpoint QR a `/cursos?ref=qr`. | `src/app/cursos/...`, `src/app/cursos/[slug]/...`, `src/app/api/qr/[courseSlug]/route.ts` | 1 h | Catálogo muestra precios. QR escaneado lleva a `/cursos` con badge. |
| **G. Admin vista** | `/admin/pagos`: lista de payments, vista de `course_access` por alumno, endpoint `POST /api/admin/payments/[id]/refund`. | `src/app/admin/pagos/...`, `src/app/api/admin/payments/[id]/refund/route.ts` | 2-3 h | Admin ve lista. Refund cambia status='refunded' Y revoca access. |

**Total**: 10-15 horas divididas en **3-4 sesiones**.

### Reglas de cierre de cada fase (consistentes con LMS Real Foundation)

1. Commit con `feat(...)` / `fix(...)` / `chore(...)`.
2. `npm run type-check && npm run lint && npm run build` verde.
3. Verificación manual de los criterios de cierre.
4. Merge a `main` con `--no-ff` cuando David dé luz verde.

---

## Anti-patrones (lo que NO hacer)

- ❌ **No instalar SDK de Stripe/MercadoPago/Conekta todavía**. El simulador debe poderse reemplazar por el webhook real sin reescribir nada.
- ❌ **No hacer UI de selección de método de pago** (tarjeta, OXXO, transferencia).
- ❌ **No hacer emails transaccionales** (decisión #6).
- ❌ **No usar el cliente de Supabase público para `course_access` o `payments`**. Solo service role desde server-side.
- ❌ **No permitir `INSERT` o `UPDATE` en `course_access` o `payments` desde políticas RLS**. Solo `SELECT` para el dueño. Todo lo demás pasa por server-side con service role.
- ❌ **No decidir acceso en el frontend**. La página `/aprender/[slug]/[lesson]` llama a `checkCourseAccess` server-side y renderiza condicionalmente.

---

## Multi-agente: política para esta fase

**Fase A (schema) la hago yo en una sola sesión secuencial**. Razón: son 3 archivos que se modifican entre sí (migración → typegen → seed), el orden importa, y secuencial es más rápido que coordinar.

**Multi-agente lo probamos en una fase más adelante**, posiblemente Fase G (admin vista) o si una fase crece a >8 archivos. Reglas si lo probamos:

- **Un solo worker**, no 3 paralelos (memoria de la sesión lms-migration: 3 workers paralelos agotaron el budget de uso de 5h).
- **Alcance < 8 archivos por worker**.
- **Si el worker falla o muere por budget**, cancelar, consolidar parciales, cerrar manualmente con `npm run type-check && npm run build`. Anotar el intento en este doc.

---

## Próximo paso concreto

**Decisiones validadas por David el 2026-06-25** ("Ok te creo"). Interpretación de #5 y #4 confirmadas.

1. **David duerme** (ya es tarde en Phoenix).
2. **Próxima sesión**: arrancar **Fase A** (schema). Es 1-2 horas.
   - Migración: `access_type` + `price_mxn` en `courses`, tablas `course_access` + `payments` con RLS.
   - Update seed: marcar 1 curso como `paid` con `price_mxn=499`.
   - Typegen manual: `src/types/supabase.ts` con las columnas/tablas nuevas.
3. Después de Fase A: continuar con B, C, D en sesiones sucesivas.
4. **Multi-agente**: lo probamos en una fase futura con archivos bien aislados (ej: Fase G admin).