# Blueprint Técnico · Motor de Certificados Qlick

> Arquitectura para emisión **100% automatizada y masiva** de certificados Qlick Award en Next.js 14 + Supabase + Vercel.

---

## 1. Decisión de stack para generación PDF/Imagen en Vercel Serverless

### El problema con Chromium en Vercel
Puppeteer-core y Playwright funcionan, pero arrastran ~280MB de Chromium → cold start de 5-10s + límites de memoria del bundle. En Vercel Hobby esto revientamemory limit (1024MB) en cuanto escalas a 10+ generaciones concurrentes.

### La decisión: dos librerías complementarias

| Librería | Output | Uso | Por qué |
| --- | --- | --- | --- |
| **`@react-pdf/renderer`** | PDF vector | Email + descarga dashboard | Vector real, imprime perfecto a 300dpi, JSX-like API, ~5MB bundle, sin Chromium |
| **`satori` + `@resvg/resvg-js`** | PNG/SVG/WebP | WhatsApp preview + OG image | Vercel-native, ~150ms render, JSX-like API, perfecto para mensajería |

**Resultado:** PDF oficial por correo (imprimible, vectorial, 297×210mm exacto) + PNG de WhatsApp (1080×764px, lightweight, mensaje instantáneo) generado en el mismo pipeline.

> **Por qué NO Puppeteer/Playwright:** demasiado pesado para Vercel. Reservar solo si necesitas HTML/CSS exótico que Satori no soporta (no es nuestro caso — nuestros templates son JSX puro).

---

## 2. Variables dinámicas (contrato del template)

Todos los templates aceptan este mismo payload TypeScript:

```typescript
// src/types/certificate.ts
export type CertificatePayload = {
  student_name: string;              // "María Fernanda Castillo Reyes"
  student_email?: string;           // "maria@example.com" (opcional, para delivery)
  course_or_event_title: string;     // "Masterclass · Marketing Digital & IA 2026"
  course_or_event_kind: 'course' | 'event' | 'masterclass' | 'diplomado';
  completion_date: string;           // ISO "2026-07-10T00:00:00Z" → formateado a "10 de julio de 2026"
  duration_hours?: number;           // 12
  instructor_name: string;           // "Paul Velásquez"
  instructor_title?: string;         // "CEO & Fundador"
  verification_id: string;           // "QLK-2026-8849"
  qr_verification_url: string;       // "https://www.qlick.digital/verify/QLK-2026-8849"
  template_variant: 'concept-a' | 'concept-b' | 'concept-c';
  brand_lockup: 'qlick-purple' | 'qlick-dark';
  issued_at: string;                 // ISO timestamp
};
```

**Generador de folio** (`src/lib/cert/folio.ts`):
```typescript
import { randomInt } from 'crypto';

export function generateFolio(year: number = new Date().getFullYear()): string {
  const digits = randomInt(0, 100000).toString().padStart(5, '0');
  return `QLK-${year}-${digits}`;
}
```

---

## 3. Estructura de archivos (nuevo módulo)

```
src/
├── lib/cert/
│   ├── folio.ts              # generador QLK-YYYY-XXXXX
│   ├── format-date.ts        # ISO → "10 de julio de 2026" (es-MX)
│   ├── fonts.ts              # registra Plus Jakarta, Inter, Fraunces para Satori/PDF
│   ├── qr.ts                 # wrapper de `qrcode` npm
│   ├── upload.ts             # sube PDF/PNG a Supabase Storage
│   ├── notify.ts             # orquesta email (Resend) + WhatsApp (Cloud API)
│   └── render/
│       ├── render-pdf.ts     # @react-pdf/renderer → Buffer PDF
│       ├── render-png.ts     # satori → SVG → @resvg/resvg-js → Buffer PNG
│       └── templates/        # un sub-archivo por concepto
│           ├── ConceptAPdf.tsx
│           ├── ConceptBPdf.tsx
│           ├── ConceptCPdf.tsx
│           ├── ConceptASatori.tsx
│           ├── ConceptBSatori.tsx
│           └── ConceptCSatori.tsx
├── components/cert/
│   ├── QlickSeal.tsx         # isotipo Q + spark (SVG inline)
│   ├── PaulSignature.tsx     # <img src="/signatures/paul.png" />
│   ├── FolioBadge.tsx
│   └── VerifyQR.tsx
├── app/api/certificates/
│   ├── generate/route.ts     # POST trigger (interno)
│   ├── [id]/route.ts         # GET descarga PDF
│   └── verify/[folio]/route.ts # GET JSON público para /verify page
└── app/verify/[folio]/page.tsx # landing de verificación (público)
```

---

## 4. Pipeline end-to-end (server action)

```typescript
// src/lib/cert/issue.ts
import { createClient } from '@/lib/supabase/server';
import { renderPdf, renderPng } from './render';
import { uploadCertificate } from './upload';
import { sendCertificateEmail, sendCertificateWhatsapp } from './notify';
import { generateFolio } from './folio';
import { formatDateEsMX } from './format-date';

export async function issueCertificate(input: {
  student_name: string;
  student_email?: string;
  student_phone?: string;       // +52...
  course_or_event_title: string;
  course_or_event_id: string;
  course_or_event_kind: 'course' | 'event' | 'masterclass';
  completion_date: Date;
  duration_hours?: number;
  template_variant?: 'concept-a' | 'concept-b' | 'concept-c';
}) {
  const supabase = createClient();
  const folio = generateFolio();
  const qrUrl = `https://www.qlick.digital/verify/${folio}`;
  const variant = input.template_variant ?? 'concept-c';

  // 1. Insert row (idempotent — DB enforces unique folio)
  const { data: cert, error } = await supabase
    .from('certificates')
    .insert({
      folio,
      student_name: input.student_name,
      student_email: input.student_email,
      course_or_event_id: input.course_or_event_id,
      course_or_event_title: input.course_or_event_title,
      completion_date: input.completion_date.toISOString(),
      duration_hours: input.duration_hours,
      template_variant: variant,
      verification_url: qrUrl,
    })
    .select()
    .single();
  if (error) throw error;

  const payload = {
    student_name: input.student_name,
    course_or_event_title: input.course_or_event_title,
    completion_date: formatDateEsMX(input.completion_date),
    duration_hours: input.duration_hours,
    instructor_name: 'Paul Velásquez',
    instructor_title: 'CEO & Fundador',
    verification_id: folio,
    qr_verification_url: qrUrl,
    template_variant: variant,
    brand_lockup: 'qlick-purple' as const,
    issued_at: new Date().toISOString(),
  };

  // 2. Render PDF + PNG in parallel
  const [pdfBuf, pngBuf] = await Promise.all([
    renderPdf(variant, payload),
    renderPng(variant, payload),
  ]);

  // 3. Upload to Supabase Storage
  const { pdfUrl, pngUrl } = await uploadCertificate(folio, pdfBuf, pngBuf);

  // 4. Update row with URLs
  await supabase
    .from('certificates')
    .update({ pdf_url: pdfUrl, png_url: pngUrl })
    .eq('id', cert.id);

  // 5. Notify alumno (fire-and-forget; no bloqueamos la respuesta)
  if (input.student_email) {
    void sendCertificateEmail({
      to: input.student_email,
      studentName: input.student_name,
      courseTitle: input.course_or_event_title,
      pdfUrl,
      pngUrl,
      folio,
      verifyUrl: qrUrl,
    });
  }
  if (input.student_phone) {
    void sendCertificateWhatsapp({
      to: input.student_phone,
      studentName: input.student_name,
      courseTitle: input.course_or_event_title,
      pngUrl,
      verifyUrl: qrUrl,
    });
  }

  return { folio, pdfUrl, pngUrl, verifyUrl: qrUrl };
}
```

---

## 5. Esquema de base de datos (Supabase)

```sql
-- supabase/migrations/20260707_certificates.sql

create table certificates (
  id uuid primary key default gen_random_uuid(),
  folio text unique not null check (folio ~ '^QLK-[0-9]{4}-[0-9]{5}$'),
  student_id uuid references auth.users(id) on delete set null,
  student_name text not null,
  student_email text,
  student_phone text,
  course_or_event_id uuid not null,  -- sin FK para flexibilidad LMS/Eventos
  course_or_event_title text not null,
  course_or_event_kind text not null check (course_or_event_kind in ('course','event','masterclass','diplomado')),
  template_variant text not null check (template_variant in ('concept-a','concept-b','concept-c')),
  completion_date date not null,
  duration_hours numeric(5,1),
  instructor_name text not null default 'Paul Velásquez',
  pdf_url text,
  png_url text,
  verification_url text not null,
  email_sent boolean not null default false,
  whatsapp_sent boolean not null default false,
  revoked boolean not null default false,
  revoked_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  issued_at timestamp with time zone not null default now()
);

-- RLS: lectura pública SOLO por folio (para verify page)
alter table certificates enable row level security;

create policy "public can verify by folio"
  on certificates for select
  to anon
  using (true);  -- folio es opaco y unguessable; select limitado por API

-- Mejor: vista pública con campos no sensibles
create view public_certificate_verify as
  select folio, student_name, course_or_event_title, completion_date,
         template_variant, revoked, issued_at
  from certificates;

-- Admins leen todo
create policy "admins read all"
  on certificates for select
  to authenticated
  using (
    auth.jwt() ->> 'email' = any (string_to_array(current_setting('app.admin_allowlist', true), ','))
  );

-- Storage bucket
insert into storage.buckets (id, name, public) values ('certificates', 'certificates', true)
  on conflict do nothing;

create policy "public read cert files"
  on storage.objects for select
  to anon
  using (bucket_id = 'certificates');

create policy "service role writes cert files"
  on storage.objects for insert
  to service_role
  using (bucket_id = 'certificates');

-- Indices
create index certificates_student_idx on certificates (student_id);
create index certificates_folio_idx on certificates (folio);
create index certificates_event_idx on certificates (course_or_event_id);
```

---

## 6. Trigger de emisión

### A) Desde el LMS (al terminar curso)

```typescript
// src/app/api/lms/course-completed/route.ts
import { issueCertificate } from '@/lib/cert/issue';

export async function POST(req: Request) {
  const body = await req.json();  // { user_id, course_id, completed_at }
  const supabase = createClient();

  const { data: student } = await supabase.from('profiles').select('full_name, email, phone').eq('id', body.user_id).single();
  const { data: course } = await supabase.from('courses').select('title, duration_hours').eq('id', body.course_id).single();

  const result = await issueCertificate({
    student_name: student.full_name,
    student_email: student.email,
    student_phone: student.phone,
    course_or_event_title: course.title,
    course_or_event_id: course.id,
    course_or_event_kind: 'course',
    completion_date: new Date(body.completed_at),
    duration_hours: course.duration_hours,
  });

  return Response.json(result);
}
```

Llamar desde `src/app/aprender/[course]/[lesson]/page.tsx` cuando se completa la última lección + quiz final aprobado.

### B) Desde el funnel de eventos (asistencia a masterclass)

Reutilizar la webhook de asistencia existente (`/api/webhooks/whatsapp` o similar) y al detectar asistencia confirmada → `issueCertificate({ ..., course_or_event_kind: 'masterclass' })`.

---

## 7. Endpoint público de verificación

```typescript
// src/app/api/certificates/verify/[folio]/route.ts
export async function GET(_: Request, { params }: { params: { folio: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from('public_certificate_verify')
    .select('*')
    .eq('folio', params.folio)
    .single();

  if (!data) return Response.json({ valid: false }, { status: 404 });
  if (data.revoked) return Response.json({ valid: false, reason: 'Revocado' }, { status: 410 });

  return Response.json({
    valid: true,
    student_name: data.student_name,
    course: data.course_or_event_title,
    completion_date: data.completion_date,
    issued_at: data.issued_at,
    template: data.template_variant,
    issuer: 'Qlick Marketing Digital',
    verify_url: `https://www.qlick.digital/verify/${params.folio}`,
  });
}
```

El QR del certificado apunta a esta URL → la página `/verify/[folio]/page.tsx` muestra un render responsivo del certificado + datos de verificación. **Esto convierte cada certificado emitido en una landing pública que indexa Google** → SEO gratis.

---

## 8. Activos estáticos (ya listos, vectorizados)

| Archivo | Formato | Estado | Uso |
| --- | --- | --- | --- |
| `assets/paul-signature.svg` | SVG vector 13.2 KB | ✅ Listo | Firma de Paul, vectorizada del original |
| `assets/paul-signature.png` | PNG transparente | ✅ Listo | Fallback para motores que no soportan SVG |
| `assets/qlick-q-icon.svg` | SVG vector 2.2 KB | ✅ Listo | Isotipo Q con antena, color `#A855F7` |
| `assets/qlick-q-icon.png` | PNG transparente | ✅ Listo | Fallback isotipo |
| `assets/qlick-wordmark.svg` | SVG wordmark full | ✅ Listo | Lockup Q + "lick" + spark amarillo |
| `assets/qlick-wordmark-compact.svg` | SVG wordmark compacto | ✅ Listo | Versión horizontal pequeña |

**Pipeline de vectorización reproducible** en `assets/vectorize-signature.py` y `assets/vectorize-q-logo.py`. Si David actualiza la firma o el logo en el futuro, regenerar es trivial (correr los scripts).

**Destino final en el repo de Qlick** (cuando se integre al LMS):
- `public/signatures/paul.svg` ← `assets/paul-signature.svg`
- `public/brand/qlick-q.svg` ← `assets/qlick-q-icon.svg`
- `public/brand/qlick-wordmark.svg` ← `assets/qlick-wordmark.svg`

---

## 9. Variables de entorno nuevas

```bash
# .env.local (agregar)
CERTIFICATE_DEFAULT_VARIANT=concept-c     # cuál usar si no se especifica
CERTIFICATE_PUBLIC_BASE_URL=https://www.qlick.digital
RESEND_API_KEY=re_xxx                     # ya existe
WHATSAPP_TOKEN=xxx                         # ya existe para funnel
WHATSAPP_PHONE_ID=xxx                      # ya existe
REMOVE_BG_API_KEY=xxx                      # opcional, para limpiar firma
```

---

## 10. Tests (vitest/node test runner)

```
tests/
├── cert-folio.test.mjs          # generateFolio formato + unicidad
├── cert-format-date.test.mjs    # ISO → "10 de julio de 2026"
├── cert-render.test.mjs         # renderPng no throwea con payload mínimo
└── cert-issue.test.mjs          # mock supabase + verifica que emite PDF/PNG
```

---

## 11. Estimación de costos por emisión

| Recurso | Costo unitario | Por 1000 certs/mes |
| --- | --- | --- |
| Vercel Function (satori+resvg, ~300ms) | $0.0000024/GB-s × 256MB × 0.3s ≈ $0.0000002 | ~$0.0002 |
| Supabase Storage (PDF+PNG, ~500KB total) | $0.021/GB | ~$0.01 |
| Resend email (1 con attachment) | gratis hasta 50/día, luego $0.40/1000 | ~$0.40 |
| WhatsApp Cloud API (1 mensaje utility) | $0.005 | ~$5 |
| **TOTAL** | | **~$5.41/1000 certs** |

A 10,000 certs/mes ≈ $54 USD/mes. Coste totalmente manejable.

---

## 12. Roadmap de implementación

| Sprint | Entregable | Dependencias |
| --- | --- | --- |
| **S1** | Activos + 1 template funcional (recomendado: Concept C) + render PDF/PNG | Firma PNG, logo SVG, decisión de concepto |
| **S2** | DB migration + `issueCertificate()` + endpoint `/verify/[folio]` | Aprobación del concepto + assets |
| **S3** | Trigger LMS (course completed) + delivery email + WhatsApp | SMTP/Resend + WhatsApp Cloud API (ya configurados) |
| **S4** | Trigger eventos (asistencia masterclass) + retry queue | webhook existente |
| **S5** | Tests E2E (Playwright MCP tour) + monitoring | E2E_TESTS_PLAN.md |

---

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Satori limita CSS (no `backdrop-filter`, no `@font-face` custom sin `weight`) | Verificar fonts registradas en `lib/cert/fonts.ts`; usar solo CSS subset soportado |
| Firma PNG con fondo no removido | Pedir a David nueva foto limpia o usar `remove.bg` API |
| Folio colisiona | `randomInt(0, 100000)` da 100k combos × retry en DB con unique constraint |
| WhatsApp rechaza PNG > 5MB | Limitar PNG a 1080×764px ~150KB; servir PDF via link en mensaje |
| Alumno con nombre muy largo | CSS `font-size: clamp()` + `text-overflow: ellipsis`; auto-fit |
| Qlik cambia paleta de marca | Tokens centralizados en `src/lib/cert/tokens.ts` |

---