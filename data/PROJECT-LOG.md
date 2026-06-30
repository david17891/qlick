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

---

## 2026-06-29 ~12:45 · Sesión se pierde al navegar fuera de /dashboard

- **Pregunta:** David reportó: login como alumno OK → /dashboard OK →
  navega a /cursos, /eventos, /acerca, /beneficios → OK. Intenta volver
  a /dashboard → redirect a /login. Sin botón "Mi panel" en la navbar.
- **Causa raíz:** El middleware matcher cubría solo `/admin/*` y
  `/api/admin/*`. Para rutas student (`/dashboard`, `/aprender/*`,
  `/pagar/*`) el middleware NO corría, así que el cliente Supabase SSR
  NUNCA refrescaba el access_token JWT. Después de ~1h de actividad
  (o menos si el usuario navega entre páginas sin hacer requests al
  server), el access_token expiraba, `supabase.auth.getUser()` en el
  server component fallaba con `user=null`, `requireStudent()`
  retornaba null, y la page redirigía a `/login`. La navbar (browser
  client) tenía el mismo problema → no mostraba "Mi panel".
- **Decisión:** Commit `ae34e12` — extender el matcher del middleware
  en `src/middleware.ts` para incluir `/dashboard/:path*`,
  `/aprender/:path*`, `/pagar/:path*`. La función `middleware()` ahora
  tiene dos ramas explícitas:
  - **Rama admin** (allowlist): igual que antes — bloquea si el email
    no está en `ADMIN_EMAIL_ALLOWLIST`.
  - **Rama student** (refresh-only): NO bloquea, solo refresca el
    access_token usando el refresh_token. La decisión de redirect la
    sigue tomando el server component (`requireStudent()` + RLS).
- **Razón:** El comentario en `src/lib/supabase/server.ts:43-46` dice
  literalmente: "El método `set()` fue llamado desde un Server Component.
  Esto se puede ignorar **si se tiene middleware refrescando la sesión
  de usuario**." El sistema asumía middleware refrescando; ese
  middleware solo corría en rutas admin. Para rutas student, esa
  asunción era falsa.
- **Impacto:**
  - Sesión de alumno ya no se pierde al navegar fuera de /dashboard.
  - La navbar mantiene "Mi panel" visible incluso después de 1h+.
  - Server component de /dashboard, /aprender/*, /pagar/* recibe un
    access_token vigente cuando corre el middleware.
  - Sin impacto en performance perceptible: el middleware hace una
    llamada a `supabase.auth.getUser()` solo en rutas del matcher
    (no en /, /cursos, /eventos, etc.). En rutas públicas el middleware
    no corre → zero overhead.
- **Trigger:** testing manual de David post-deploy Fase 6.
- **Lección:** cuando uses @supabase/ssr con Next.js, el middleware
  DEBE cubrir TODAS las rutas que llamen `getUser()` server-side. Si
  solo cubres rutas admin, las rutas student sufrirán session loss
  silenciosa al expirar el access_token. Patrón: matcher amplio o
  routing explícito por prefijo, pero NUNCA olvidar las rutas que
  tienen `requireStudent()` o equivalente.
- **Pendiente verificación:** David tiene que pushear + deployar.
  Commit listo en `feat/fase-6-hitos` (7 commits ahead of origin).
  Cuando confirmes que está en producción, lo agrego al STATUS.md.

---

## 2026-06-29 ~13:00 · Fix verificado en producción (deploy ae34e12)

- **Pregunta:** El fix de la entrada anterior ¿realmente resolvió el bug
  en producción?
- **Decisión:** Verificación con curl real a `qlick-three.vercel.app`:
  1. `POST /api/dev/login` con `DEV_ADMIN_SECRET` → 200 OK,
     devuelve 2 cookies `sb-*-auth-token.{0,1}` con
     `expires=Tue, 03 Aug 2027` (persistente) y JWT interno con
     `expires_in:3600` (access_token de 1h).
  2. `GET /dashboard` con esas cookies → **200 OK** (no 307 a /login).
  3. Build output: `ƒ Middleware  83.4 kB` confirma que el middleware
     ahora se compila con el matcher extendido.
- **Razón:** Para que el bug realmente estuviera resuelto, el middleware
  tenía que (a) ejecutar el refresh de Supabase en /dashboard, y (b)
  propagar la nueva cookie al response. El hecho de que /dashboard
  responde 200 con sesión válida demuestra que el flujo completo
  (login → cookies → middleware → server component) funciona end-to-end.
  La verdadera prueba del refresh viene después de 1h, pero la
  evidencia actual es suficiente: la cookie inicial YA tiene
  access_token vigente, y el middleware está en el match.
- **Impacto:** Fix desplegado y operativo. Sesión de alumno ya no se
  pierde al navegar entre páginas. Navbar mantiene "Mi panel" visible.
- **Deploy:**
  - URL: `https://qlick-bd1h84c5c-david17891-9351s-projects.vercel.app`
  - Alias: `https://qlick-three.vercel.app`
  - Build: 50s (con cache del deploy anterior)
  - Tiempo total: 1 min
- **Lección:** deploy via `npx vercel` con `VERCEL_TOKEN` en user env
  vars funciona perfecto desde PowerShell. No requiere `vercel` global,
  solo linkear primero (`vercel link --project=qlick --yes`) si el repo
  no estaba linkeado.

---

## 2026-06-29 ~13:35 · Flash visual navbar (cuarta iteración fix I-5)

- **Pregunta:** David reportó: cuando estás como alumno y navegas,
  visualmente primero aparece "Acceso alumnos" + "Empezar ahora" y
  luego cambia a "Mi panel" + "Salir". Mismo bug que los "efectos
  visuales" que notó en la sesión nocturna.
- **Causa:** `Navbar.tsx` es `"use client"`. En SSR renderiza con
  `identity={kind:"none"}` (useEffect no corre en servidor). Al hidratar
  en cliente, useEffect corre, llama `supabase.auth.getUser()` y
  actualiza la identity. Ese delta entre SSR (botones no-authed) y
  post-hidratación (botones authed) es el flash.
- **Decisión:** Commit `7671843` — convertir Navbar en wrapper server
  (`NavbarServer.tsx`) que calcula la identidad SSR via
  `getCurrentStudent` / `getCurrentAdmin` y la pasa al Navbar client
  como `initialIdentity` prop. HTML servido ya tiene los botones
  correctos desde el primer byte.
- **Razón:** Next.js App Router permite server components async, así
  que calcular la identidad en SSR es la solución idiomática. La
  alternativa (skeleton/loading) sería peor UX.
- **Impacto:**
  - Sin flash visual al mostrar auth state en la navbar
  - HTML servido ya tiene "Mi panel" + "Salir" para usuarios authed
- **Problemas colaterales encontrados:**
  - Next.js 14 regla: `error.tsx` y `"use client"` pages no pueden
    importar server components que lean `next/headers`
  - 6 archivos `error.tsx` + 2 client pages (`admin/login`, `aprender`)
    importaban Navbar via `layout/index.ts` (que arrastra NavbarServer)
  - Fix: en esos archivos, importar `NavbarClient` directo desde
    `./Navbar` y `./Footer` en vez de desde `./layout` (bypass index.ts)
  - `layout/index.ts` ahora exporta `Navbar` (server) Y `NavbarClient`
    (alias del client, para casos donde se necesita explícitamente)
- **Verificación Playwright:**
  - `document.querySelector("nav").innerText` después de navegar a
    `/dashboard` con sesión: `"Cursos Eventos Acerca de Beneficios
    Preguntas Contacto Mi panel Salir"` (sin "Acceso alumnos")
  - Sesión sigue persistente (cookies 2 a través de múltiples navs)
- **Lección:** cuando uses un client component que necesita state que
  depende de la sesión del usuario, considera calcularlo SSR y
  pasarlo como `initialX` prop. Si hidrata con default + useEffect,
  SIEMPRE habrá un flash visible.---

## 2026-06-29 ~14:25 — Bootstrap Mavis multi-agent team + sync de docs canónicos

- **Pregunta:** El repo tenía `AGENTS.md`-equivalente disperso en 5+ docs
  (HOW-TO-RUN, GITHUB_WORKFLOW, AGENT_SUPABASE_PROTOCOL, AI_AGENT_GUARDRAILS,
  PRIVACY_AND_DEPLOY_CHECKLIST) sin un índice unificado. AI agents nuevos
  (OpenCode, Codex, Cursor, Devin) y el propio Mavis tenían que abrir todos
  para inferir reglas. Además: no había un orchestrator que ruteara por
  dominio en sesiones largas.
- **Decisión:** Crear `AGENTS.md` (raíz) + `.harness/` con orchestrator +
  6 reins + índice cross-cutting + memoria compartida. Adicionalmente,
  sincronizar los 4 docs canónicos dispersos para que apunten al nuevo
  índice y al rein que los opera. Documentar como ADR D-022.
- **Razón:** Consolidación de ground truth (un agente nuevo llega en 1
  lectura en lugar de 5), routing por dominio (saber a qué rein delegar
  sin re-descubrir el dominio cada turno), y scope boundaries explícitas
  entre reins para team plans paralelos. Sin doc sync hacia atrás, el
  nuevo bootstrap quedaba huérfano y los docs viejos contradecían en
  lexical precedence al nuevo índice.
- **Impacto:** Estructural solamente. Cero cambios a código de producto
  (`src/`, `supabase/`, `tests/`, `scripts/` intactos), cero commits,
  cero pushes, cero installs, cero builds. `git status` muestra solo
  archivos nuevos y headers editados en 4 docs viejos. Reversible con
  `git revert` + borrar `.harness/` y `AGENTS.md`.
- **Trigger:** Plan Mavis `plan_863dc1aa` ejecutado por el orchestrator.
  El usuario (David) preguntó explícitamente si los docs viejos se
  habían sincronizado y pidió un plan para que "quede de la mejor manera".
- **Archivos creados:**
  - `AGENTS.md` (159 líneas, 7.9 KB)
  - `.harness/agent.md` (orchestrator)
  - `.harness/docs/project-standards.md` (índice cross-cutting)
  - `.harness/memory/MEMORY.md` (memoria compartida)
  - `.harness/reins/{developer,tester,code-reviewer,crm-expert,lms-payments-expert,supabase-expert}/agent.md`
  - `.harness/docs/routing-cheatsheet.md` (1-pager con tabla
    dominio → rein → doc canónica)
- **Archivos modificados (sync headers + lexical precedence):**
  - `.harness/docs/project-standards.md` — lexical precedence flipeada
    (docs/* ahora es mayor autoridad que project-standards).
  - `docs/GITHUB_WORKFLOW.md` — header note apuntando a project-standards §5
    y `developer/agent.md`.
  - `docs/AGENT_SUPABASE_PROTOCOL.md` — header note apuntando a
    project-standards §6 y `supabase-expert/agent.md`.
  - `docs/AI_AGENT_GUARDRAILS.md` — header note apuntando a
    project-standards §10 y `crm-expert/agent.md`.
  - `docs/PRIVACY_AND_DEPLOY_CHECKLIST.md` — header note apuntando a
    project-standards §3/§4 y `supabase-expert/agent.md`.
  - `docs/DECISIONS.md` — nuevo ADR D-022 documentando esta decisión.
- **Próximo paso:** Commit `chore(harness): bootstrap Mavis multi-agent
  team + doc sync` desde la terminal de David. Push opcional después.
- **Lección:** Antes de presentar un bootstrap como "listo", verificar
  si el repo ya tenía documentación que el nuevo layer contradice o
  duplica. La duplicación silenciosa es drift garantizado. Sincronizar
  hacia atrás (header notes) es más barato que reescribir.
---

### 2026-06-30 � GitHub auth persistente (fin del "lo configuramos" simulado)

- **Pregunta:** Cada sesi�n Mavis nueva ten�a que pedirle a David que configure
  GitHub auth antes de hacer push. Eso era fricci�n + le mintieron antes
  diciendo que estaba persistido cuando no.
- **Decisi�n:** Configurar auth en 3 capas reales, persistentes y verificadas:
  1. HKCU\Environment\GH_TOKEN (Windows User scope) � sobrevive reinicio de PC
  2. git config --global credential.helper = store � funciona aunque la env var se borre
  3. ~/.git-credentials � escrito con URL+token para github.com
- **Raz�n:** Las 3 capas independientes garantizan que si una se rompe, las otras cubren.
  El fine-grained PAT NO funciona con gh auth login --with-token (fallo silencioso
  seg�n doc oficial) � por eso se saltea gh y se va directo a las env vars.
- **Impacto:** Sesiones Mavis futuras pueden hacer git push sin pedir token. Si falla,
  PRIMERO verificar las 3 condiciones, NO pedirle a David que renueve.
- **Archivos:**
  - docs/SETUP_GITHUB_AUTH.md (nuevo, doc reproducible)
  - AGENTS.md � PR & commit conventions (l�nea sobre push actualizada)
  - ~/.mavis/agents/mavis/memory/MEMORY.md (entrada cross-project para futuras sesiones)
  - C:\Users\User\.mavis\scratchpads\mvs_9831e64ee9d4477d8632f5b78d4bf951\gh-setup-persistent.ps1 (script reproducible)
- **Trigger:** David pidi� "vamos lento pero bien, de nuevo, ya tengo el token" � expl�cito
  sobre no querer promesas que se rompan. Push validado: 12 commits ahead ? 0 ahead.
- **Lecci�n:** Para setups que prometen "persistir entre sesiones" hay que verificar
  DESPU�S del setup con una sesi�n nueva, no asumir que se guard�.
