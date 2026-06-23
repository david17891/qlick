# Roadmap — Qlick Marketing Integral

El roadmap está organizado en fases incrementales. Cada fase entrega valor
autónomo y deja la base preparada para la siguiente.

---

## Fase 0 — MVP (✅ Completado)

**Objetivo:** plataforma navegable, con catálogo, lecciones, dashboards y datos
mock. Lista para demostrar el producto y validar flujos.

**Entregables**
- ✅ Home con hero, beneficios, cursos destacados, testimonios y CTA.
- ✅ Catálogo de cursos (4 cursos completos: módulos, lecciones, videos).
- ✅ Página de detalle de curso.
- ✅ Página de lección con reproductor de video (YouTube).
- ✅ Vista previa de lecciones sin login.
- ✅ Acceso restringido a lecciones de pago si no hay inscripción.
- ✅ Dashboard de alumno (progreso, actividad, certificados simulados, pagos).
- ✅ Panel administrativo (resumen, cursos, alumnos, inscripciones, pagos).
- ✅ Login mock con 3 roles (admin, alumno, instructor).
- ✅ Abstracción de video (5 proveedores, YouTube activo).
- ✅ Abstracción de pagos (4 proveedores, mock activo).
- ✅ Abstracción de contacto (`ContactProvider` mock + stubs resend/crm).
- ✅ Botones de WhatsApp centralizados con fallback "próximamente".
- ✅ CRM en modo demo: tipos, datos mock, servicios, UI completa (kanban, leads,
  conversaciones, calendario, agente IA, configuración WhatsApp).
- ✅ Abstracción de proveedor de WhatsApp (`WhatsAppProvider`: manual activo +
  stubs Cloud API/BSP) y agente IA en modo sugerencia con guardrails.
- ✅ Formulario de contacto con curso de interés y consentimiento obligatorio.
- ✅ Diseño alineado a la identidad visual de Qlick.
- ✅ Auditoría técnica, funcional y de marca (ver `docs/AUDIT_REPORT.md` y
  relacionados).
- ✅ Documentación (architecture, video, payments, contact, audit, decisions, github workflow).
- ✅ SEO básico (metadata, sitemap, robots, Open Graph).
- ✅ Build pasa, sin errores de tipos ni lint.
- ✅ `npm run audit:links` limpio (sin anchors vacíos ni forms sin backend).

**Criterios de salida**
- `npm run build` genera 55 páginas estáticas.
- Se puede recorrer el flujo completo: home → curso → login → lección → dashboard.

---

## Fase 1 — Auth y DB real

**Objetivo:** persistencia real de usuarios, inscripciones y progreso.

**Tareas**
- [ ] Configurar proyecto Supabase (auth + Postgres).
- [ ] Crear esquema de tablas mapeado a `src/types/index.ts`.
- [ ] Reemplazar `lib/data/*` por queries a Supabase (misma firma pública).
- [ ] Reemplazar `mock-auth` por Supabase Auth (`signIn`, `signOut`, `getCurrentUser`).
- [ ] Proteger rutas privadas con middleware de Next.js.
- [ ] Sincronizar progreso de lecciones en tiempo real.
- [ ] Activar registro de nuevos alumnos.
- [ ] Panel admin funcional (CRUD real de cursos, módulos, lecciones).
- [ ] Migrar assets de imágenes a Supabase Storage (opcional).

**Entregable**
- Plataforma con cuentas reales, progreso persistente y admin que guarda.

---

## Fase 2 — Pagos reales en México

**Objetivo:** vender cursos con dinero real.

**Tareas**
- [ ] Elegir proveedor inicial (recomendado: Mercado Pago).
- [ ] Implementar `createCheckout` real en el provider elegido.
- [ ] Implementar `parseWebhook` validando firma.
- [ ] Crear endpoint `/api/webhooks/payments` para recibir notificaciones.
- [ ] Conceder acceso automáticamente tras webhook aprobado.
- [ ] Página de checkout propia (`/checkout/[courseId]`).
- [ ] Página de estado post-pago (`/pago/[paymentId]`).
- [ ] Gestión real de cupones (validación, límites, conteo).
- [ ] Historial de pagos persistente.
- [ ] Facturación CFDI (Conekta o solución complementaria).
- [ ] MSI (meses sin intereses) si el proveedor lo soporta.

**Entregable**
- Alumno puede comprar, pagar y obtener acceso automáticamente.

---

## Fase 3 — Video hosting profesional

**Objetivo:** proteger el contenido de pago con restricción real.

**Tareas**
- [ ] Migrar videos a Cloudflare Stream (o Mux).
- [ ] Backend para firmar URLs de video.
- [ ] Restricción por dominio + expiración.
- [ ] Migrar lecciones existentes al nuevo proveedor.
- [ ] Analíticas de reproducción (heatmap de abandono).
- [ ] Subtítulos y transcripciones.
- [ ] Calidad adaptativa (ABR).

**Entregable**
- Videos de pago no reproducibles fuera de la plataforma.

---

## Fase 4 — Certificados, comunidad y automatización

**Objetivo:** convertir la plataforma en un producto completo.

**Tareas**
- [ ] Generación real de certificados PDF con código verificable.
- [ ] Página pública de verificación de certificados (`/certificado/[code]`).
- [ ] Comunidad (foro o canal integrado).
- [x] Foundation del CRM lista (modo demo): tipos, servicios, UI y formulario con
  consentimiento. Falta persistencia (Fase 1) y CRM externo.
- [x] Abstracción `WhatsAppProvider` (manual activo + Cloud API/BSP como stubs).
- [x] Agente IA en modo sugerencia con guardrails (proveedor mock activo).
- [ ] WhatsApp Business Cloud API real: plantillas, opt-in, ventana 24h, webhook
  (ver `docs/WHATSAPP_OFFICIAL_INTEGRATION_PLAN.md`).
- [ ] Agente IA con LLM real (OpenRouter), manteniendo `needsReview`.
- [ ] Activar proveedor `resend`/`crm` de contacto (completar stubs de `src/lib/contact/`).
- [ ] Automatizaciones de email marketing (bienvenida, abandono, follow-up).
- [ ] Programa de afiliados.
- [ ] Notificaciones push / in-app.
- [ ] App móvil (React Native o PWA avanzada).

**Entregable**
- Plataforma completa lista para escalar y fidelizar.

---

## Backlog (sin fase asignada)

- [ ] Búsqueda y filtros avanzados en el catálogo.
- [ ] Recomendaciones con ML según progreso.
- [ ] Modo offline para lecciones descargables.
- [ ] Exámenes y evaluaciones con calificación automática.
- [ ] Gamificación (puntos, rachas, insignias).
- [ ] Multi-idioma (inglés para LATAM).
- [ ] Tema oscuro nativo.
- [ ] Integración con calendario para sesiones en vivo.
