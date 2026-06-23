# Qlick Marketing Integral — Plataforma LMS

Plataforma de cursos en línea para **Qlick Marketing Integral**, agencia de
marketing. Permite publicar cursos, módulos y lecciones; que los alumnos
estudien con video, sigan su progreso y obtengan certificados; y deja preparada
la arquitectura para pagos reales en México.

> **Estado:** MVP (Fase 0) — navegable, con datos de demostración y pagos
> simulados. Listo para iterar hacia producción.

---

## ✨ Lo que incluye

- 🏠 **Home** comercial con hero, cursos destacados, beneficios y prueba social.
- 📚 **Catálogo** con 4 cursos completos (módulos, lecciones, videos).
- 🎥 **Reproductor de video** con abstracción de proveedor (YouTube activo;
  Vimeo, Cloudflare Stream, Mux y custom preparados).
- 🎓 **Dashboard de alumno** con progreso, actividad, certificados y pagos.
- 🛠️ **Panel admin** con métricas, gestión de cursos, alumnos, inscripciones y
  pagos simulados.
- 🔐 **Login mock** con 3 roles (admin, alumno, instructor).
- 💳 **Arquitectura de pagos** para Mercado Pago, Stripe y Conekta (mock activo).
- 🎨 **Diseño alineado** a la identidad visual de Qlick (morado + naranja).
- 📄 **SEO** básico: metadata, sitemap, robots, Open Graph.

---

## 🧱 Stack

- **Next.js 14** (App Router) + **TypeScript** estricto
- **Tailwind CSS 3**
- **Fuentes**: Inter + Space Grotesk (`next/font`)
- **Datos mock** en memoria (misma forma que la DB real futura)
- **Sin ORM** en el MVP (decisión documentada en `docs/DECISIONS.md`)
- Preparado para **Supabase** (Fase 1) y **Vercel** (deploy)

---

## 🚀 Instalación

Requisitos: **Node 18+** (probado con Node 22) y npm.

```bash
npm install
cp .env.example .env.local   # opcional: el MVP funciona sin variables
npm run dev
```

Abre <http://localhost:3000>.

### Comandos

| Comando              | Descripción                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo                       |
| `npm run build`      | Build de producción (genera 55 páginas SSG)  |
| `npm run start`      | Sirve el build de producción                 |
| `npm run lint`       | ESLint                                       |
| `npm run type-check` | Verificación de tipos sin emitir             |

---

## 👤 Cuentas de demostración

El MVP usa autenticación simulada. En <http://localhost:3000/login> puedes hacer
clic en cualquier cuenta demo para autocompletar:

| Rol         | Email                  | Contraseña   |
| ----------- | ---------------------- | ------------ |
| Alumno      | `alumno@click.com`     | `qlick1234`  |
| Admin       | `admin@click.com`      | `qlick1234`  |
| Instructor  | `instructor@click.com` | `qlick1234`  |

> ⚠️ Esto **no** es auth real. No hay hashes ni sesiones seguras. Es solo para
> recorrer la plataforma. La autenticación real se activa en la Fase 1 con
> Supabase Auth.

---

## 🗺️ Rutas principales

### Públicas
- `/` — Home
- `/cursos` — Catálogo
- `/cursos/[slug]` — Detalle de curso
- `/acerca` — Acerca de Qlick
- `/beneficios` — Beneficios de la plataforma
- `/faq` — Preguntas frecuentes
- `/contacto` — Contacto
- `/login` — Acceso alumnos

### Privadas (requieren sesión mock)
- `/dashboard` — Panel del alumno
- `/aprender` — Mis cursos inscritos
- `/aprender/[courseSlug]/[lessonSlug]` — Lección con reproductor
- `/admin` — Panel administrativo (roles admin/instructor)

---

## 📁 Estructura

```
src/
├── app/            # Rutas (App Router)
├── components/     # ui, brand, layout, course, video, dashboard, admin
├── lib/            # auth, video, payments, data (mock), brand-manifest, utils
└── types/          # Tipos del dominio (fuente de verdad)
public/brand/       # Assets de marca (no modificar originales)
docs/               # Documentación
```

Detalle completo en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🔧 Variables de entorno

Copia `.env.example` a `.env.local`. **El MVP funciona sin ninguna variable**;
todas son para fases posteriores. Las más relevantes:

| Variable                          | Fase   | Descripción                      |
| --------------------------------- | ------ | -------------------------------- |
| `NEXT_PUBLIC_AUTH_MODE`           | 1      | `mock` (actual) o `supabase`     |
| `NEXT_PUBLIC_PAYMENT_PROVIDER`    | 2      | `mock` (actual), `mercadopago`, `stripe`, `conekta` |
| `NEXT_PUBLIC_SUPABASE_URL`        | 1      | URL del proyecto Supabase        |
| `MERCADOPAGO_ACCESS_TOKEN`        | 2      | Token de Mercado Pago            |
| `STRIPE_SECRET_KEY`               | 2      | Secret key de Stripe             |
| `CONEKTA_API_KEY`                 | 2      | API key de Conekta               |
| `CLOUDFLARE_STREAM_CUSTOMER_CODE` | 3      | Código de Cloudflare Stream      |

---

## 🎥 Notas sobre video

El MVP usa **YouTube no listado**. Esto **no es protección real**: cualquiera
con el enlace puede ver y descargar el video. Es aceptable para demos y
contenido gratuito, pero **no** para cursos de pago.

Para protección real está preparada la migración a Cloudflare Stream o Mux con
signed URLs (Fase 3). Ver [`docs/VIDEO_STRATEGY.md`](docs/VIDEO_STRATEGY.md).

---

## 💳 Notas sobre pagos

El MVP usa un **proveedor mock** que simula todos los estados (aprobado,
pendiente, rechazado). **No se procesan pagos reales.**

La integración con Mercado Pago, Stripe o Conekta se activa en la Fase 2
cambiando una variable de entorno. Ver
[`docs/PAYMENTS_MEXICO_STRATEGY.md`](docs/PAYMENTS_MEXICO_STRATEGY.md).

---

## 📈 Roadmap

| Fase | Objetivo                              | Estado |
| ---- | ------------------------------------- | ------ |
| 0    | Landing + catálogo + mock + reproductor | ✅ Done |
| 1    | Auth real + DB real + admin funcional | 🔜     |
| 2    | Pagos reales en México + webhooks     | 🔜     |
| 3    | Video hosting pro + signed URLs       | 🔜     |
| 4    | Certificados + comunidad + CRM        | 🔜     |

Detalle en [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## 📚 Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitectura y estructura
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — fases del proyecto
- [`docs/VIDEO_STRATEGY.md`](docs/VIDEO_STRATEGY.md) — estrategia de video
- [`docs/PAYMENTS_MEXICO_STRATEGY.md`](docs/PAYMENTS_MEXICO_STRATEGY.md) — pagos
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — registro de decisiones (ADRs)
- [`docs/GITHUB_WORKFLOW.md`](docs/GITHUB_WORKFLOW.md) — Git y GitHub

---

## 🏗️ Deploy en Vercel

1. Sube el repo a GitHub.
2. En <https://vercel.com/new> importa el repo.
3. Framework preset: **Next.js** (autodetectado).
4. Añade las variables de entorno que necesites.
5. Deploy. Build pasa automáticamente (`next build`).

---

## 📝 Licencia

Propiedad de Qlick Marketing Integral. Uso interno.
