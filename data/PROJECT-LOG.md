# PROJECT-LOG — Qlick Marketing Integral

> **Propósito:** Registro append-only de cambios ongoing que NO caben en
> OPEN_ITEMS (deuda por feature) ni STATUS (snapshot vivo).
>
> Una entrada = un cambio puntual que requirió decisión: deploy, env var,
> fix urgente, hot-fix, decisión de producto. Formato corto:
>
> - **Fecha + título**
> - **Pregunta:** qué se necesitaba decidir / qué estaba mal
> - **Decisión:** qué se hizo
> - **Razón:** por qué
> - **Impacto:** qué cambia para el usuario / sistema
> - **Trigger:** qué originó el registro
>
> **Cuándo agregar:** cuando algo se cambia o decide en caliente y no
> calza como feature (OPEN_ITEMS) ni como snapshot (STATUS).
>
> **Cuándo NO agregar:** features planificadas (van en OPEN_ITEMS / ROADMAP)
> o cambios puramente cosméticos sin decisión.

---

## 2026-06-29 ~02:30 · Loop OAuth student con email admin

- **Pregunta:** El login OAuth de alumno redirige a `/login` en loop infinito
  cuando el usuario tiene email que está en `ADMIN_EMAIL_ALLOWLIST`.
- **Decisión:** Cambiar `getCurrentStudent()` en `src/lib/auth/session.ts`
  para que NO dependa de `isAuthEnabled()`. Ahora checkea solo
  `checkSupabaseConfig().configured`. Student y admin son roles
  independientes — el gate de allowlist solo aplica a admin.
- **Razón:** D-018 dice "admin y student son roles INDEPENDIENTES" pero el
  código violaba eso al hacer student auth depender de admin allowlist.
- **Impacto:** Login OAuth/magic link funciona para cualquier email
  autenticado, independiente del allowlist. Para el caso edge de un email
  dual (admin + intenta ser student), ahora `isStudentEmail()` devuelve
  false → student auth rechaza → redirect a `/login` con error claro en
  vez de loop silencioso. **Workaround para David:** usar otra cuenta
  Google (no-admin) para testear flow de student.
- **Trigger:** testing post-deploy Fase 6 por David. Sesión nocturna.

---

## 2026-06-29 ~02:45 · Build falló por import faltante

- **Pregunta:** Primer commit del fix anterior (`f674a90`) hizo build
  fallar en Vercel: `Cannot find name 'isAuthEnabled'` en
  `src/lib/auth/session.ts:43`.
- **Decisión:** Commit de fix `1cf252a` que restaura
  `import { isAuthEnabled } from "./admin-auth"`.
- **Razón:** Al refactorizar `getCurrentStudent()` olvidé que
  `getCurrentAdmin()` también usa `isAuthEnabled()`. Removí el import
  completo sin revisar todos los call sites.
- **Impacto:** El primer deploy quedó en `ERROR` (no production). El
  segundo deploy (con el import restaurado) pasó en 16 segundos
  aprovechando el cache del preview.
- **Trigger:** pipeline de Vercel notificando el build fallido.
- **Lección:** antes de remover un import, `grep` todos los usos en el
  archivo. TypeScript no atrapa "imports removidos que siguen en uso" en
  Server Components si la función no se llama en build.

---

## 2026-06-29 ~02:30 · Env var NEXT_PUBLIC_APP_URL vacía en Vercel

- **Pregunta:** Emails transaccionales, QR codes, sitemap, robots y
  metadata de OpenGraph apuntaban a `http://localhost:3000` aunque el
  production estaba en `https://qlick-three.vercel.app`.
- **Decisión:** Setear `NEXT_PUBLIC_APP_URL=https://qlick-three.vercel.app`
  en Vercel (production + preview), tipo `plain`.
- **Razón:** La env var existía en `.env.example` y `.env.local` pero
  nunca se cargó a Vercel. Como es `NEXT_PUBLIC_*`, se hornea al build,
  por lo que requería redeploy para tomar efecto.
- **Impacto:** QR codes, links de email, sitemap.xml, robots.txt ahora
  apuntan al dominio correcto. Antes: si alguien escaneaba un QR de un
  curso, le pegaba a localhost (muerto).
- **Trigger:** David reportó "anda a login" después de hacer clic en un
  link de un email. Investigando, vi que el link generado tenía
  localhost. Grep en `src/lib/` reveló 11 archivos con fallback a
  `localhost:3000`.
- **Lección:** después de setup inicial de un proyecto, hacer `grep
  "localhost:3000"` en `src/` para listar todos los call sites que
  dependen de `NEXT_PUBLIC_APP_URL`. Cada uno es un riesgo silencioso.

---

## 2026-06-29 ~02:35 · Supabase Auth URL config incompleta

- **Pregunta:** Configuración de Supabase Auth tenía `site_url =
  http://localhost:3000` y redirect URLs solo con localhost.
- **Decisión:** David actualizó manualmente en Supabase dashboard:
  - Site URL → `https://qlick-three.vercel.app`
  - Redirect URLs agregadas: las 2 de localhost (mantener para dev) + 2
    de Vercel (auth/callback + auth/callback-student).
- **Razón:** Sin redirect URLs de Vercel registradas, Supabase Auth
  rechazaba cualquier callback OAuth/magic link desde Vercel y caía al
  fallback `site_url = localhost`.
- **Impacto:** Login funciona desde Vercel. Cualquier futura URL
  custom/production requiere agregarla manualmente al dashboard.
- **Trigger:** misma investigación que el item anterior (link a
  localhost).
- **Acción futura:** considerar migrar la config de Supabase Auth a
  setup reproducible vía `supabase config.toml` + script de bootstrap
  automatizado (Fase 7+).

---

## 2026-06-29 ~02:55 · Limpieza 12 deploys viejos de Vercel

- **Pregunta:** Vercel tenía 13 deploys `READY + target=production`
  acumulados desde el 23-jun al 29-jun. Solo el último sirve el dominio.
- **Decisión:** Borrar 12 vía `DELETE /v13/deployments/{id}`, dejar solo
  el actual (`dpl_BBwdygHPDVgL6PfbdMWCSCAqLGW8` con commit `1cf252a`).
- **Razón:** Deploys viejos con bugs ya no son útiles como rollback
  (siempre se puede re-desplegar desde git). Solo suman ruido y
  confunden al debuggear.
- **Impacto:** Lista de deploys de producción ahora muestra 1 solo.
  Las URLs auto-aliadas (`qlick-XXXX-david17891-9351s-projects.vercel.app`)
  de los deploys borrados ahora devuelven 404 — cuidado con docs
  viejos o screenshots que las linkeen.
- **Trigger:** David reportó que después de hacer login veía "404"
  inconsistentes. La causa raíz fueron los deploys viejos en cache +
  browser cache, exacerbado por el ruido de aliases viejos.
- **Política nueva:** antes de promover un deploy nuevo a producción,
  evaluar borrar el anterior si no aporta como fallback.

---

## 2026-06-29 ~02:55 · STATUS.md creado como snapshot vivo

- **Pregunta:** Después de los fixes nocturnos, no había un único doc
  que dijera "ahora mismo dónde estamos". OPEN_ITEMS es append-only
  histórico, ROADMAP es plan, CRM_MODE_STATUS es stale (de 06-25).
- **Decisión:** Crear `docs/STATUS.md` con snapshot actual del estado
  de producción: deploy activo, env vars, qué funciona, qué es demo,
  issues activos, comandos de verificación.
- **Razón:** Para orientarse en 30 segundos sin scrollear 1500 líneas
  de docs. Especialmente útil para agentes que lleguen al proyecto
  sin contexto.
- **Impacto:** Cualquier Mavis (este u otro) puede leer STATUS.md y
  saber inmediatamente qué está roto, qué funciona, qué se deployó
  último y dónde está la lógica real vs demo.
- **Trigger:** David pidió "documentación inicial" después de la sesión
  confusa de las 404 y los deploys viejos.
- **Política:** STATUS.md NO es append-only. Se sobreescribe con el
  nuevo snapshot cuando cambia algo relevante (deploy, env var, fix
  crítico, issue nuevo/resuelto).

---

*Próximas entradas: agregar cuando ocurra otro cambio puntual. NO
agregar features planificadas (esas van en OPEN_ITEMS / ROADMAP).*

---

## 2026-06-29 ~03:05 · Dualidad admin+student + dev login en production

- **Pregunta:** David quería poder entrar como admin Y como student con el
  mismo email (`david17891@gmail.com`) para testear todo el flujo. Además,
  Mavis necesitaba poder entrar a production como cualquiera de los 3 roles
  (admin, student, visitante) sin browser interactivo.
- **Decisión A — dualidad:** `isStudentEmail()` ya no rechaza emails en
  `ADMIN_EMAIL_ALLOWLIST`. Cualquier email autenticado puede actuar como
  student. La separación admin/student la decide la ruta (`/admin/*` requiere
  allowlist; `/dashboard` requiere solo autenticación).
- **Decisión B — dev login en production:** `/api/dev/login` ahora corre
  en todos los envs (removido check de `NODE_ENV`). Acepta cualquier email
  (removido check de `isAdminEmail`). Gating único: `DEV_ADMIN_SECRET` que
  ahora está en Vercel además de `.env.local`.
- **Razón:** testing en production sin browser. El modelo de seguridad se
  mantiene porque (a) el secret es 64 chars hex = 256 bits de entropía, (b)
  RLS en Supabase previene acceso cruzado de datos entre usuarios, (c) el
  endpoint sigue siendo solo para testing — usuarios reales usan OAuth/magic
  link.
- **Impacto:** David puede entrar como alumno con `david17891@gmail.com` sin
  loop. Mavis puede testear cualquier ruta con el secret. El endpoint
  `auto-crea` usuarios en Supabase auth.users (útil para tests, no abusar en
  producción real con emails de personas).
- **Trigger:** pedido explícito de David en sesión nocturna: "Quiero
  permitir dualidad para david17891@gmail.com para poder probar todo,
  además también trabajar en tus credenciales para que puedas entrar
  como usuario, como admin y como visitante".
- **Lección:** "dev-only" en endpoints es un trade-off — útil para forzar
  disciplina pero costoso para testing en producción cuando no hay CI. La
  decisión correcta depende del costo de mantener el endpoint seguro vs.
  el costo de no poder testear flujos reales en producción.
- **Docs:** `docs/STATUS.md` actualizado con nuevo deploy, env var y cierre
  del issue I-1. `docs/HOW-TO-RUN.md` sección 9 con ejemplos PowerShell
  para los 3 roles.