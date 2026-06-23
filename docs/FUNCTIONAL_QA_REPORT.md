# QA funcional — Qlick Marketing Integral (MVP Fase 0)

**Fecha:** 2026-06-23
**Alcance:** revisión de todos los elementos interactivos (links, botones,
formularios, CTAs) en las 14 rutas de la plataforma. Objetivo: cero elementos que
"parezcan funcionar pero no hagan nada".
**Servidor de prueba:** `http://localhost:3000` (dev).

---

## Resumen ejecutivo

| Tipo | Revisados | Problemas | Estado |
| ---- | --------- | --------- | ------ |
| Links internos (`/ruta`) | ~60 | 0 | ✅ Todos navegables |
| Links externos (`wa.me`, `mailto:`, `tel:`) | ~15 | 0 | ✅ Reales o fallback claro |
| Botones con acción | ~25 | 0 | ✅ Todos tienen handler o `disabled` explícito |
| Formularios | 2 (login, contacto) | 0 | ✅ Validan y muestran feedback |
| `href="#"` / `action="#"` residuales | — | 0 | ✅ Script `audit:links` pasa limpio |

**Resultado:** la plataforma no contiene botones/links "muertos". Los elementos
no funcionales del MVP están **marcados explícitamente** como demo/pendiente.

---

## Hallazgos y correcciones

### 1. Formulario de contacto apuntaba a `action="#"` — CORREGIDO

**Antes:** `src/app/contacto/page.tsx` usaba un `<form action="#">` sin backend.
El botón "Enviar" pareciera funcionar pero no hacía nada.

**Después:** la página renderiza `<ContactForm />` (client component) que valida,
previene doble envío, llama a `getContactProvider().sendMessage()` (mock activo) y
muestra estados loading/success/error con badge "demo".

**Archivo:** `src/app/contacto/page.tsx`, `src/components/contact/ContactForm.tsx`.

### 2. Botones de admin sin acción — CORREGIDO

**Antes:** tres botones en `AdminView` ("+ Nuevo curso", "Editar", "+ Invitar")
se veían funcionales pero no tenían `onClick`.

**Después:** los tres llevan `disabled` + `title` + etiqueta "(demo)" explícita.
El estilo `disabled:` del `Button` los atenúa visualmente.

**Archivo:** `src/components/admin/AdminView.tsx` (líneas ~199, ~225, ~251).

### 3. Recursos descargables con `url: "#"` — CORREGIDO

**Antes:** 4 recursos en `courses.ts` con `url: "#"` se mostraban como items
clickables sin descarga real.

**Después:** la sección de recursos detecta si `url` es real o `#`. Si es `#`,
muestra badge "próximamente" + sección con badge "demo". Si una URL real se añade
en el futuro, automáticamente se vuelve un enlace descargable.

**Archivos:** `src/components/course/LessonView.tsx`, `src/lib/data/courses.ts`.

### 4. Links de teléfono y email eran texto plano — CORREGIDO

**Antes:** el teléfono y email en `/contacto` eran texto sin `href`.

**Después:** `tel:` y `mailto:` reales apuntando a los valores de marca
(`hola@qlick.mx`).

### 5. WhatsApp sin configurar se mostraba como link a `#` — CORREGIDO

**Antes:** los botones de WhatsApp podían renderizar un `href="#"` cuando faltaban
env vars.

**Después:** `WhatsAppButton` lee `configured` del helper. Si `false`, se muestra
**deshabilitado** con etiqueta "próximamente" (nunca un link falso). Si `true`,
abre `wa.me` con mensaje preconfigurado.

**Archivo:** `src/components/contact/WhatsAppButton.tsx`, `src/lib/contact/whatsapp.ts`.

---

## Rutas verificadas (14)

| Ruta | Tipo | Estado |
| ---- | ---- | ------ |
| `/` | Pública | ✅ Hero, cursos, CTA, WhatsApp (sales) funcionan |
| `/cursos` | Pública | ✅ Catálogo navega a detalle |
| `/cursos/[slug]` | Pública | ✅ Inscripción, WhatsApp (enroll) |
| `/acerca` | Pública | ✅ Contenido estático |
| `/beneficios` | Pública | ✅ Contenido estático |
| `/faq` | Pública | ✅ Acordeones funcionan |
| `/contacto` | Pública | ✅ Formulario + datos reales |
| `/login` | Pública | ✅ Login mock con 3 roles |
| `/dashboard` | Privada | ✅ Progreso, WhatsApp (support) |
| `/aprender` | Privada | ✅ Mis cursos |
| `/aprender/[c]/[l]` | Privada | ✅ Reproductor, recursos, navegación prev/next |
| `/admin` | Privada | ✅ Tabs, métricas (botones CRUD = demo) |
| `/not-found` | Error | ✅ 404 de marca |
| `sitemap.xml` / `robots.txt` | SEO | ✅ Generados |

---

## Cuentas de prueba usadas

| Rol | Email | Contraseña |
| --- | ----- | ---------- |
| Alumno | `alumno@qlick.com` | `qlick1234` |
| Admin | `admin@qlick.com` | `qlick1234` |
| Instructor | `instructor@qlick.com` | `qlick1234` |

> Los emails pasaron de `@click.com` a `@qlick.com` para coherencia con la marca
> (D-001, D-011).

---

## Flujos completos recorridos

1. **Compra/información:** Home → CTA WhatsApp (demo) → /cursos → detalle →
   WhatsApp enroll (demo) → /login.
2. **Aprendizaje:** Login alumno → /aprender → lección → reproducir →
   marcar completada → siguiente.
3. **Acceso restringido:** Lección sin login → preview o bloqueo con CTA a
   inscribirse.
4. **Admin:** Login admin → /admin → tabs (resumen, cursos, alumnos,
   inscripciones, pagos, futuro).
5. **Contacto:** /contacto → rellenar formulario → estado de éxito.

---

## Herramienta de verificación continua

Se añadió `npm run audit:links` (`scripts/audit-links.mjs`) que escanea `src/app`
y `src/components` buscando `href="#"`, `href=""` y `action="#"`. Es intencionalmente
un escáner textual (regex) sin dependencias, para correrlo en CI.

```
$ npm run audit:links
🔍 Auditoría de links y botones (src/app, src/components)
✅ Sin anchors vacíos ni forms sin backend.
```

No sustituye a una auditoría con Playwright sobre el DOM renderizado, pero cubre
el caso más común de regresión (alguien añade un `href="#"`).

---

## Pendientes no bloqueantes

- **Botones del admin:** siguen siendo demo por diseño (no hay backend CRUD hasta
  Fase 1). La corrección los marca, no los implementa.
- **Recursos:** las URLs reales se añaden cuando Qlick entregue los PDFs/plantillas.
- **Auditoría con Playwright** (opcional): validar el DOM renderizado, no solo el
  fuente. Fuera del alcance del MVP.
