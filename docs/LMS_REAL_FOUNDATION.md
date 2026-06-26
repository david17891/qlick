# LMS Real Foundation (v0.7.0)

Cimientos del LMS con persistencia real en Supabase: 5 tablas nuevas,
server libs con fallback demo, auth de alumnos separada de admin, y
dashboard protegido.

> **Estado:** ✅ rama `feature/lms-real-foundation` lista para review/merge
> a `main` (v0.7.0). Type-check + lint + build en verde.

---

## 📦 Lo que quedó en disco

### Migración DB (Track 1, commit `4cfb429`)
- `supabase/migrations/20260625160000_lms_real_foundation.sql` (5 tablas + RLS + índices + trigger updated_at + idempotencia)
- `src/types/supabase.ts` regenerado (UTF-8 sin BOM, las 5 tablas presentes)

### Server libs + modelo de dominio (Track 2, commit `95bd9d4`)
- `src/types/lms.ts` — tipos de dominio (Course, Module, Lesson, Enrollment, LessonProgress, enums)
- `src/lib/lms/courses-server.ts` — `getPublishedCourses`, `getCourseBySlug`, `getAdminCourses`, `getCourseModules`, `getModuleLessons`
- `src/lib/lms/enrollments-server.ts` — `getUserEnrollments`, `enrollUserInCourse`, `getLessonProgress`, `markLessonComplete`, `updateEnrollmentProgress`
- `src/lib/lms/mappers.ts` — `mapCourseRow`, `mapModuleRow`, `mapLessonRow`, `mapEnrollmentRow`, `mapLessonProgressRow` (snake_case → camelCase)
- `src/lib/lms/index.ts` — fachada
- `legacyEnrollmentToLms` / `legacyLessonProgressToLms` exportados para adapters externos

### Auth alumnos + dashboard (Track 3, commit `95bd9d4`)
- `src/app/login/page.tsx` + `MagicLinkForm.tsx` — magic link para alumnos (separado de admin)
- `src/app/auth/callback-student/route.ts` — intercambia code por session, redirect a /dashboard
- `src/app/dashboard/page.tsx` + `DashboardView.tsx` — Server Component protegido + UI client con "Marcar como visto"
- `src/lib/auth/student-auth.ts` — `requireStudent()` (separado de admin)
- `src/lib/auth/mock-auth.ts` — marcado deprecated; cae a Supabase si hay session real
- `src/lib/auth/session.ts` — `getCurrentStudent()`
- `src/components/layout/Navbar.tsx` — distingue mock / supabase-student / supabase-admin

### Data layer (compatibilidad)
- `src/lib/data/courses.ts` y `src/lib/data/enrollments.ts` mantienen firma pública. Internamente delegan al server lib de `lms/` en realMode y caen a mocks en demoMode.

---

## 🧱 Esquema de las 5 tablas

```
courses
  ├─ id, slug (unique), title, subtitle, description, cover_image_url
  ├─ status: 'draft' | 'published' | 'archived'
  ├─ level: 'beginner' | 'intermediate' | 'advanced'
  ├─ category, duration_minutes, instructor_name, price_mxn
  └─ is_featured, display_order, created_at, updated_at

modules (course_id FK → courses CASCADE)
  ├─ id, course_id, title, description
  └─ display_order, created_at

lessons (module_id FK → modules CASCADE)
  ├─ id, module_id, title, description
  ├─ video_provider: 'youtube' | 'cloudflare_stream' | 'mux' | 'local' | 'external'
  ├─ video_id, video_url, duration_minutes
  └─ display_order, is_free_preview, created_at

enrollments (user_id FK → auth.users CASCADE, course_id FK → courses CASCADE)
  ├─ UNIQUE (user_id, course_id)
  ├─ status: 'active' | 'completed' | 'cancelled'
  └─ progress_percent, enrolled_at, completed_at

lesson_progress (user_id FK, lesson_id FK CASCADE)
  ├─ UNIQUE (user_id, lesson_id)
  └─ completed, completed_at, watch_seconds, updated_at
```

---

## 🔒 RLS activa en las 5 tablas

| Tabla            | SELECT                                       | INSERT/UPDATE                              |
| ---------------- | -------------------------------------------- | ------------------------------------------ |
| `courses`        | público si `status='published'`              | service role only                          |
| `modules`        | público si course padre está `published`     | service role only                          |
| `lessons`        | público si module → course está `published`  | service role only                          |
| `enrollments`    | solo dueño (`auth.uid() = user_id`)          | solo dueño                                 |
| `lesson_progress`| solo dueño (`auth.uid() = user_id`)          | solo dueño                                 |

Las Server Actions / server libs usan `createSupabaseAdminClient()` (bypass
RLS) para inscripciones administrativas. Para alumno end-user, las mutations
deben pasar por `createSupabaseServerClient()` (con sesión del usuario) y la
RLS se encarga.

---

## 🔄 Patrón fallback demo ↔ real

Todos los server libs siguen este patrón:

```ts
function isRealMode(): boolean {
  if (typeof window !== "undefined") return false; // defensa browser
  return checkSupabaseConfig().configured;
}

export async function getX(...) {
  if (!isRealMode()) {
    // cae a mocks de lib/data/*
    return ...;
  }
  const supabase = createSupabaseAdminClient();
  // query a Supabase
}
```

`isRealMode()` se evalúa server-side solo (defensa contra `typeof window`).
El frontend (`checkSupabaseConfig().mode === 'demo'`) usa otra ruta: muestra
el dashboard demo con `user_alumno` mock.

---

## 🛣️ Rutas nuevas

| Ruta | Tipo | Protegida | Notas |
| --- | --- | --- | --- |
| `/login` | Static | no | Magic link para alumnos |
| `/auth/callback-student` | Dynamic (route handler) | n/a | Intercambia code → session → redirect `/dashboard` |
| `/dashboard` | Dynamic | `requireStudent()` | Lista cursos inscritos + progreso + "Marcar como visto" |

Las rutas admin (`/admin/*`) y auth (`/admin/login`) siguen funcionando
independientes — los cambios en `mock-auth.ts` y `session.ts` son
backwards-compatibles.

---

## 🧪 Validaciones

```
$ npm run type-check
✔ (sin errores)

$ npm run lint
✔ No ESLint warnings or errors

$ npm run build
✔ Compila /dashboard, /login, /auth/callback-student (Dynamic)
✔ Mantiene /admin/*, /cursos, /masterclass/[slug] intactos
```

---

## 🚧 Lo que NO está (TODO para v0.7.x)

- [ ] Catálogo `/cursos` sigue leyendo de `lib/data/courses.ts` (mocks). Migrar a `getPublishedCourses()` del server lib cuando se quieran servir cursos reales.
- [ ] Flujo de "Continuar aprendiendo" (deep-link a `/aprender/[courseSlug]/[lessonSlug]`) — el dashboard lo prepara como `nextLessonSlug` pero aún no hay ruta dinámica de LMS que renderice lecciones reales (sí existe para el demo: `/aprender/[courseSlug]/[lessonSlug]`).
- [ ] Certificados — placeholder, falta tabla `certificates` + flujo de emisión.
- [ ] Payments — placeholder en dashboard (`paymentsCount: 0`). Falta integración MercadoPago.
- [ ] Seed data en Supabase para probar dashboard con cursos reales publicados.
- [ ] Tests unitarios de los server libs (mappers, fallback demo).

---

## 📋 Comandos para David

```powershell
cd "C:\Users\User\Documents\Click"

# Push de la rama (gh CLI está autenticado en tu terminal)
git push origin feature/lms-real-foundation

# (Opcional) PR a main con título sugerido:
gh pr create --base main --head feature/lms-real-foundation `
  --title "feat(lms): LMS real foundation (v0.7.0)" `
  --body "Schema LMS + server libs + auth alumnos + dashboard"

# Después del merge, tag v0.7.0-lms-real-foundation:
git checkout main; git pull origin main
git tag v0.7.0-lms-real-foundation
git push origin v0.7.0-lms-real-foundation
```

---

## 🧵 Notas de proceso

### Lo que pasó durante el desarrollo

Esta versión arrancó con un plan team de 3 tracks paralelos
(plan_7944cc20). Los 3 workers fueron killed por timeout del engine a
los 15 min (límite por tarea), antes de poder commitear sus cambios
completos. Los archivos quedaron en disco y se consolidaron en 2 commits
manuales (`4cfb429` migración + `95bd9d4` server libs + auth + fixes).

**Lección:** para tareas no triviales con scope > ~10 archivos, los
workers tienden a agotar el timeout de 15 min. Estrategia viable:
dividir en sub-tareas más chicas, o aceptar el partial-state y terminar
manual post-mortem (que es lo que se hizo aquí).

### Auth: separación clara admin ↔ student

`admin-auth.ts` y `student-auth.ts` son módulos independientes. Un email
en `ADMIN_EMAIL_ALLOWLIST` puede ser admin; cualquier otro email puede
ser alumno. La Navbar muestra ambos botones si el usuario es admin
autenticado por Supabase Auth (porque el check `isAdminEmail()` lo
determina por email, no por user_role).

### `mock-auth` marcado deprecated

`getCurrentUser()` ahora prioriza sesión Supabase real si existe
(buscando `user` en el cliente browser) y solo cae al mock si no hay
Supabase configurado o si la sesión falla. Los consumers existentes
siguen funcionando porque la firma del retorno es compatible.

---

**Versión:** v0.7.0-lms-real-foundation
**Rama:** `feature/lms-real-foundation`
**Commits clave:** `4cfb429`, `95bd9d4`
**Listo para:** merge a `main` + tag