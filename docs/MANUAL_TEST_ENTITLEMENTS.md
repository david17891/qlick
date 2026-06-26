# Test Manual — Entitlements (A, B, C)

> **Fecha de generación**: 2026-06-26.
> **Auditoría previa**: 3 críticos + 4 altos + 4 medios + 3 bajos detectados y arreglados antes de este test.
> **Estado esperado**: listo para ejecutar, requiere cuenta NO-admin en Google.

---

## Pre-requisitos

1. **DB Supabase** con las 3 migraciones aplicadas:
   - `20260626000000_entitlements_v1.sql`
   - `20260626000001_payments_align_v101.sql` (puede omitirse; equivalente a v1.0.2)
   - `20260626000002_payments_align_v102.sql`
2. **Seed ejecutado**: `npm run seed:courses` → 4 cursos en DB (1 paid, 3 free).
3. **Variables de entorno**: `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`.
4. **Cuenta de prueba NO-admin**: una Google account cuyo email NO esté en `ADMIN_EMAIL_ALLOWLIST`. (El admin por diseño no puede entrar como student; bloquea en `isStudentEmail`.)
5. **Dev server**: `npm run dev` en :3000.

---

## Área A — Schema

| # | Paso | Acción del usuario | Resultado esperado | Riesgo si falla | Estado |
|---|---|---|---|---|---|
| A.1 | Verificar tablas | Supabase SQL Editor: `\dt` o `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` | Lista `courses, modules, lessons, enrollments, lesson_progress, course_access, payments, ...` | DB no inicializada | pendiente |
| A.2 | Verificar access_type | `SELECT slug, access_type, price_mxn FROM courses` | 1 row con `access_type='paid', price_mxn=499` (publicidad-facebook-instagram-ads), 3 rows con `access_type='free', price_mxn=0` | Catálogo mal configurado | pendiente |
| A.3 | Verificar CHECK | `INSERT INTO courses (...) VALUES (..., 'invalid', ...)` | Error 23514 (check violation) | CHECK no aplicado | pendiente |
| A.4 | Verificar FK | `INSERT INTO course_access (user_id, course_id, ...) VALUES ('00000000-...', '00000000-...')` | Error FK violation | FK rota | pendiente |
| A.5 | Verificar RLS | Login como anon (no admin) y query `SELECT * FROM course_access` | 0 rows (RLS bloquea) | RLS no habilitado | pendiente |
| A.6 | Verificar UNIQUE idempotency | `INSERT INTO payments (..., idempotency_key='test1', ...)`, luego otro con mismo key | Error 23505 (unique violation) | UNIQUE constraint no aplicado | pendiente |

---

## Área B — Entitlements core (lib)

| # | Paso | Acción del usuario | Resultado esperado | Riesgo si falla | Estado |
|---|---|---|---|---|---|
| B.1 | Sin auth, /aprender | Abrir en incognito: `/aprender/publicidad-facebook-instagram-ads/que-es-marketing-digital-hoy` | 307 → `/login?next=/aprender/...` | Auth rota | pendiente |
| B.2 | Sin auth, /pagar | Abrir: `/pagar/publicidad-facebook-instagram-ads` | 307 → `/login?next=/pagar/...` | Auth rota | pendiente |
| B.3 | Login, /aprender sin pago | Login con cuenta NO-admin. Click directo en `/aprender/publicidad-facebook-instagram-ads/que-es-marketing-digital-hoy` | Render paywall con "Ir a pagar" + "Ver catálogo" | Falla de seguridad | pendiente |
| B.4 | Pagar → /aprender | Login → Catálogo → Click curso paid → "Comprar curso" → /pagar → "Pago exitoso" → redirect /dashboard?paid=ok | 1.2s después redirige a dashboard | grantAccess falla | pendiente |
| B.5 | Dashboard muestra curso | Después de B.4, en /dashboard | Card con "Publicidad en Facebook e Instagram Ads" + barra progreso 0% + botón "Empezar curso" | courseTitle="" (Fix X-1 debería arreglar) | pendiente |
| B.6 | Empezar curso | Click "Empezar curso" en dashboard | Navega a /aprender/.../lesson-1, renderiza LessonView con video de YouTube | LessonView falla o video no carga | pendiente |
| B.7 | Re-pagar (idempotencia) | Vuelve a /pagar/... y click "Pago exitoso" | Mismo payment_id, sin duplicar course_access, sin error | grantAccess duplica | pendiente |
| B.8 | Doble click rápido | Click "Pago exitoso" 2 veces seguidas | Solo 1 payment creado, 1 access activo | Race condition en grantAccess | pendiente |

---

## Área C — Simulador (endpoint + /pagar)

| # | Paso | Acción del usuario | Resultado esperado | Riesgo si falla | Estado |
|---|---|---|---|---|---|
| C.1 | Sin auth, POST endpoint | `curl -X POST http://localhost:3000/api/dev/simulate-webhook -d '{"courseSlug":"publicidad-facebook-instagram-ads","event":"paid"}'` | 401 + body `{"ok":false,"message":"Necesitás iniciar sesión..."}` | Auth rota | pendiente |
| C.2 | GET endpoint | `curl http://localhost:3000/api/dev/simulate-webhook` | 405 (method not allowed) | Solo POST permitido | pendiente |
| C.3 | Login → /pagar | Login NO-admin, click curso paid | Carga /pagar/[slug] con preview + 3 radio buttons de método (Tarjeta/OXXO/SPEI) | UI rota (Fix C-1 debería arreglar) | pendiente |
| C.4 | Pago exitoso | Selecciona Tarjeta, click "Pago exitoso" | Toast verde con `payment_id` corto + mensaje "Pago aprobado y acceso activado" + redirect 1.2s | grantAccess o enrollUserInCourse falla | pendiente |
| C.5 | Pago rechazado | (con otra sesión) Login → /pagar → "Pago rechazado" | Toast rojo + mensaje "Pago rechazado. No se activó el acceso." | Endpoint OK | pendiente |
| C.6 | Pago pendiente | "Pago pendiente" | Toast ámbar + mensaje "Pago pendiente. Esperá la confirmación." | Endpoint OK | pendiente |
| C.7 | OXXO | Selecciona OXXO, "Pago exitoso" | payment.method='oxxo' (visible en /admin/pagos cuando se implemente) | Method field OK | pendiente |
| C.8 | Ya pagó | Después de pagar, vuelve a /pagar | Redirect `/dashboard?already_paid=1` | checkCourseAccess falla | pendiente |
| C.9 | Preserva `?ref=qr` | Click "Inscribirme" desde QR → /inscripcion/...?ref=qr → redirect /pagar/...?ref=qr | El query param se preserva | ref se pierde (Fix X-4 debería arreglar) | pendiente |

---

## Casos negativos

| # | Caso | Resultado esperado |
|---|---|---|
| N.1 | Doble click "Pago exitoso" en menos de 1s | Solo 1 payment, 1 access (idempotente) |
| N.2 | Refrescar /pagar después de pagar | Redirect a /dashboard?already_paid=1 |
| N.3 | Login con cuenta admin | Redirige a /admin, no a /dashboard |
| N.4 | Acceder a /api/dev/simulate-webhook con método o evento inválido | 400 con mensaje claro |
| N.5 | Acceder a /pagar con courseSlug inexistente | Página de "Curso no encontrado" |
| N.6 | Acceder a /inscripcion/cursofree/cursofree con sesión | Enrola y redirige a /dashboard |
| N.7 | Acceder a /pagar/cursofree (free) con sesión | Redirect a /inscripcion |
| N.8 | Refresh después de pago aprobado | Sigue mostrando dashboard con el curso |
| N.9 | User marca lección completa en dashboard | Progreso se incrementa 11% (1/9) |
| N.10 | User llega al 100% | Badge cambia a "Completado" |

---

## Casos mobile / responsive

| # | Paso | Resultado esperado |
|---|---|---|
| M.1 | /pagar viewport 375px | Radio buttons stacked vertical, botones stacked, layout legible |
| M.2 | /dashboard viewport 375px | Cards stacked, badges visibles, botones accesibles |
| M.3 | /aprender viewport 375px | Video player responsive, sidebar colapsa |
| M.4 | /cursos viewport 375px | Grid de cursos 1 columna, badges de precio legibles |

---

## Evidencia a recolectar

Para cada caso, recolectar:

- **Screenshots** antes y después (especialmente del dashboard con el curso pagado).
- **Logs de consola del browser** (Network tab → verificar 200/307/401 correctos).
- **Query a la DB** post-test:
  - `SELECT * FROM course_access WHERE user_id='<UUID>'` → 1 row active.
  - `SELECT * FROM payments WHERE user_id='<UUID>'` → 1 row approved.
  - `SELECT * FROM enrollments WHERE user_id='<UUID>'` → 1 row active.
- **Console logs del server** (terminal de `npm run dev`) → buscar warnings/errors de los server libs.

---

## Criterios de cierre del test

| # | Criterio | Estado |
|---|---|---|
| 1 | type-check verde | ✅ (`tsc --noEmit`) |
| 2 | build verde | ✅ (`next build` con 60 páginas) |
| 3 | lint verde | ✅ (`next lint` sin warnings) |
| 4 | Test server-side sin auth verde | ✅ (status codes esperados en todas las rutas) |
| 5 | Test E2E con sesión NO-admin | ⏳ pendiente (requiere cuenta de prueba) |

---

## Comandos útiles

```powershell
# Levantar dev
npm run dev

# Query a la DB
node scripts/_query.mjs  # si lo armás

# Audit links
npm run audit:links

# Check Supabase
npm run check:supabase
```
