# Arquitectura — Qlick Marketing Integral

Plataforma LMS (Learning Management System) para cursos de marketing. Este
documento describe la arquitectura actual (MVP) y el camino hacia producción.

## Stack

| Capa             | Tecnología                          | Estado            |
| ---------------- | ----------------------------------- | ----------------- |
| Framework        | Next.js 14 (App Router)             | ✅ Activo         |
| Lenguaje         | TypeScript (strict)                 | ✅ Activo         |
| Estilos          | Tailwind CSS 3                      | ✅ Activo         |
| Fuentes          | Inter + Space Grotesk (next/font)   | ✅ Activo         |
| UI               | Componentes propios (sin librería)  | ✅ Activo         |
| Auth             | Mock (localStorage)                 | ✅ MVP            |
| Auth real        | Supabase Auth                       | 🔜 Fase 1         |
| Base de datos    | Archivos mock en memoria            | ✅ MVP            |
| Base de datos real | Supabase (Postgres)               | 🔜 Fase 1         |
| Video            | YouTube no listado + abstracción    | ✅ MVP            |
| Video pro        | Cloudflare Stream / Mux             | 🔜 Fase 3         |
| Pagos            | Mock provider                       | ✅ MVP            |
| Pagos reales MX  | Mercado Pago / Stripe / Conekta     | 🔜 Fase 2         |
| Hosting          | Vercel                              | ✅ Preparado      |

## Estructura de carpetas

```
src/
├── app/                         # App Router (rutas)
│   ├── layout.tsx               # Layout raíz: fuentes, metadata global
│   ├── page.tsx                 # Home
│   ├── globals.css              # Estilos globales + variables de marca
│   ├── cursos/                  # Catálogo público
│   │   ├── page.tsx
│   │   └── [slug]/page.tsx      # Detalle de curso (SSG)
│   ├── aprender/                # Área privada de alumno
│   │   ├── page.tsx             # Índice de cursos inscritos
│   │   └── [courseSlug]/[lessonSlug]/page.tsx  # Lección con reproductor
│   ├── dashboard/page.tsx       # Panel del alumno
│   ├── admin/page.tsx           # Panel administrativo
│   ├── login/page.tsx           # Acceso (mock)
│   ├── acerca/page.tsx
│   ├── beneficios/page.tsx
│   ├── faq/page.tsx
│   ├── contacto/page.tsx
│   ├── not-found.tsx
│   ├── sitemap.ts
│   └── robots.ts
├── components/
│   ├── ui/                      # Primitivos: Button, Card, Badge, Input…
│   ├── brand/                   # Logo, Isotipo, Wordmark, Tagline
│   ├── layout/                  # Navbar, Footer
│   ├── course/                  # CourseCard, ModuleList, LessonRow…
│   ├── video/                   # VideoPlayer con abstracción de proveedor
│   ├── dashboard/               # EnrolledCourseCard, StatCard, DashboardView
│   └── admin/                   # AdminView
├── lib/
│   ├── brand-manifest.ts        # Referencia central de assets de marca
│   ├── utils.ts                 # cn, formatMXN, formatDuration, etc.
│   ├── auth/
│   │   └── mock-auth.ts         # Auth simulada con roles
│   ├── video/
│   │   └── provider.ts          # Abstracción VideoProvider (5 proveedores)
│   ├── payments/
│   │   ├── payment-provider.ts  # Interfaz + factory
│   │   ├── mock-provider.ts     # ✅ Activo
│   │   ├── mercadopago-provider.ts  # 🔜 Stub
│   │   ├── stripe-provider.ts   # 🔜 Stub
│   │   ├── conekta-provider.ts  # 🔜 Stub
│   │   └── index.ts
│   └── data/                    # Datos mock (se sustituyen por DB en Fase 1)
│       ├── users.ts
│       ├── instructors.ts
│       ├── courses.ts           # 4 cursos completos
│       ├── enrollments.ts
│       ├── payments.ts          # Pagos + cupones
│       ├── certificates.ts
│       └── content.ts           # Testimonios, FAQ, actividad
└── types/
    └── index.ts                 # Tipos del dominio (fuente de verdad)
public/
└── brand/                       # Assets de marca (no modificar originales)
    ├── original/                # Variantes moradas (fondos claros)
    ├── white/                   # Variantes blancas (fondos oscuros)
    └── 00_original_logo_reference.png
docs/                            # Documentación del proyecto
```

## Decisiones arquitectónicas clave

### 1. Datos mock con la misma forma que la DB real

Los datos mock en `src/lib/data/*` implementan exactamente los tipos de
`src/types/index.ts`. En la Fase 1, se sustituyen por funciones que consultan
Supabase, **sin cambiar la firma pública**. Esto permite iterar rápido y
migrar sin refactor masivo.

### 2. Sin ORM en el MVP

No se usa Prisma ni Drizzle todavía. Razones:

- El MVP no tiene DB real; un ORM añadiría complejidad sin beneficio.
- Los tipos TypeScript ya definen el modelo.
- En la Fase 1 se decidirá entre Supabase client directo (recomendado por
  simplicidad) o Drizzle (si se quiere control fino del SQL).

### 3. Abstracciones de proveedor

Tanto video como pagos tienen una interfaz única con múltiples implementaciones:

- `VideoProvider` → youtube, vimeo, cloudflare_stream, mux, custom.
- `PaymentProvider` → mock, mercadopago, stripe, conekta.

Esto desacopla la UI de la infraestructura y permite cambiar de proveedor sin
tocar componentes.

### 4. Renderizado: SSG + Client islands

- Páginas públicas (Home, Cursos, Detalle) → **SSG** (estáticas, generadas en build).
- Páginas privadas (Dashboard, Lección, Admin) → server shell + **client components**
  para el estado de sesión.
- 55 páginas se generan estáticamente en el build.

### 5. Auth mock client-side

La sesión se guarda en `localStorage` (solo demo). La interfaz de auth
(`getCurrentUser`, `signIn`, `signOut`) es la misma que tendrá la implementación
con Supabase, así el cambio es transparente para los componentes.

## Flujo de datos (MVP)

```
[Usuario] → [Next.js page] → [lib/data/* (mock)] → [types/*]
                                  ↓
                          (Fase 1: Supabase)
```

## Flujo de datos (Fase 1, objetivo)

```
[Usuario] → [Next.js page] → [lib/data/* (Supabase queries)] → [Supabase Postgres]
                                   ↓
                             [types/*] (sin cambios)
```

## Modelo de dominio (resumen)

Ver `src/types/index.ts` para la definición completa y tipada.

- `User` (roles: visitor, student, admin, instructor)
- `Instructor`
- `Course` → `Module` → `Lesson` → `VideoAsset`, `Resource`
- `Enrollment` (relación User ↔ Course)
- `LessonProgress` (por usuario, por lección)
- `Payment`, `Coupon`, `Certificate`
- `ActivityEvent`, `Testimonial`, `FaqItem`

## Rendimiento

- Imágenes con `next/image` (lazy, responsive, optimización automática).
- Fuentes con `next/font` (sin layout shift).
- Páginas estáticas (SSG) servidas por CDN en Vercel.
- First Load JS compartido: ~87 kB.
- Sin dependencias pesadas (sin UI kit completo, solo primitivos propios).

## SEO

- Metadata por página (`title`, `description`, `openGraph`).
- URLs limpias (`/cursos/fundamentos-marketing-digital`).
- `sitemap.xml` y `robots.txt` generados dinámicamente.
- HTML semántico (`<h1>`, `<nav>`, `<section>`, `<article>`).
- `lang="es"` en el root.

## Accesibilidad

- Contraste de color AA en texto.
- `focus-visible` con anillo de marca.
- Roles ARIA en `progressbar`, botones con `aria-label`.
- Teclado funcional en navegación móvil y tabs de admin.

## Límites del MVP (qué NO hace todavía)

- No persiste datos: al recargar, el progreso marcado en cliente se pierde.
- No procesa pagos reales.
- No envía correos (formularios son demo).
- No valida cupones de forma persistente.
- No genera certificados PDF reales.
- Auth no es segura (solo demostración).
