# HANDOFF — Sprint Certificados Concept C (v0.9.1)

> **Rama:** `feat/certificados-concept-c`
> **Commits de cierre:** `8454577` (base) → `338a4f6` (admin) → `6553e6d` (cleanup) → `b0ac503` (márgenes) → `e2418a9` (margen blanco) → `511d15c` (`@page` 297mm + PrintCertButton)
> **Deploy:** `https://www.qlick.digital` (production, alias actualizado al último deploy)
> **Fecha:** 2026-07-08
> **Estado:** ✅ Validado en prod. **Pendiente:** cleanup DB (DDDDDDD attendee + QLK-2026-68558) y decisión Paso 2 (script bulk + envío por correo).

---

## 🎯 Qué cambió

Sprint que cierra la **emisión de certificados de asistencia** end-to-end. El cert es la pieza "evidencia para el alumno" del funnel de eventos — sin esto, el evento cierra sin constancia.

**Antes:** Los eventos no emitían constancia alguna. Los confirmados que asistían se quedaban sin certificado.

**Ahora:**
1. **Cert imprimible 1:1 con el design Concept C aprobado** (`docs/qlick-cert-system/03-concept-c-dynamic-authority.html`).
2. **Emisión bajo demanda** desde el admin (check-in tab), con auth admin + idempotencia por (event_id, attendee_id).
3. **URL pública `/cert/[folio]`** que cualquiera con el link puede abrir y guardar como PDF (Ctrl+P → "Guardar como PDF").
4. **Layout exacto A4 horizontal** sin margen blanco en print.

---

## 📁 Archivos del cambio

### Nuevos (14 archivos)

| Path | Propósito |
|---|---|
| `src/app/cert/[folio]/page.tsx` | Server component que renderiza el cert. Lee folio, busca en `event_certificates` + join `events` + `event_attendees`. Auth con `requireAdmin()`. |
| `src/app/cert/[folio]/cert.css` | CSS con tokens del Concept C (paleta, tipografías, layout diagonal). `@media print` con `@page { size: 297mm 210mm; margin: 0 }`. |
| `src/app/cert/[folio]/_components/PrintCertButton.tsx` | Client Component con botón "🖨️ Imprimir". Espera `document.fonts.ready` antes de `window.print()`. |
| `src/lib/certificates/types.ts` | Types: `EventCertificate`, `CertificateRenderData`, `AssetDataUrlMap`. |
| `src/lib/certificates/folio.ts` | Genera folios con formato `QLK-YYYY-NNNNN` (5 dígitos, padded). |
| `src/lib/certificates/format-helpers.ts` | `formatDateLong()` (es-MX, America/Phoenix), `htmlEscape()`. |
| `src/lib/certificates/qr-helper.ts` | `generateQrPngDataUrl()` (PNG data URL vía `qrcode` lib), `getCertQrUrl()` (link público). |
| `src/lib/certificates/asset-loader.ts` | `loadAssetAsDataUrl()` lee signature PNG + Q icon + wordmark SVG y los embebe como data URLs (evita 404 en print). |
| `src/lib/certificates/issue-certificate.ts` | Server action core: valida, valida idempotencia, INSERT en `event_certificates`, audit log. |
| `public/certificates/paul-signature.png` | Firma PNG restaurada (binary-safe, no UTF-16). |
| `public/certificates/qlick-q-icon.png` | Isotipo Q PNG restaurado. |
| `public/certificates/qlick-wordmark-compact.svg` | Wordmark vector. |
| `public/certificates/fonts/*.ttf` | 12 TTF: Plus Jakarta Sans (var), Inter (var), JetBrains Mono (var). |
| `src/app/admin/eventos/[id]/_components/IssueCertButton.tsx` | Client Component del botón "✨ Emitir cert" con `useTransition` + feedback inline. |

### Modificados (3 archivos)

| Path | Cambio |
|---|---|
| `src/app/admin/eventos/[id]/_actions.ts` | Nueva server action `issueCertificateAction` con auth, validaciones (attendee existe, event existe, attendee no duplicado) e idempotencia. |
| `src/app/admin/eventos/[id]/_components/CheckInTab.tsx` | Folio map (para mostrar "📜 Certificado (folio)" si ya existe), botón "✨ Emitir cert" condicional. |
| `src/app/api/events/[id]/certificate/[attendeeId]/route.ts` | Deprecado: ahora devuelve redirect HTML informativo al cert público. |

---

## 🧪 Validación corrida

```bash
npm run type-check    # ✅ 0 errores
npm run lint          # ✅ 0 warnings/errors
npm test              # ✅ (los tests existentes no tocaban cert)
npm run build         # ✅ Compila, /cert/[folio] registrada
```

**Validación E2E en prod (David):**
- Emisión desde admin → folio `QLK-2026-68558` para attendee `dddddddd-dddd-dddd-dddd-dddddddddddd` (Mavis Demo Nivel1).
- `/cert/QLK-2026-68558` → renderiza layout 1:1 con design Concept C.
- Ctrl+P → márgenes "Predeterminado" y "Ninguno" → **cert ocupa A4 horizontal exacto sin margen blanco**.

---

## 🔑 Decisiones técnicas

### 1. HTML imprimible, NO PDF server-side

**Decisión:** renderizar HTML y que David imprima localmente con Ctrl+P, en lugar de generar PDF en server.

**Por qué:**
- `@react-pdf/renderer` fallaba con errores opacos de `pdfkit` en CI local (binary deps en Windows).
- Vercel Hobby no aguanta headless browsers (`@sparticuz/chromium`, puppeteer) — excede el límite de function size.
- HTML imprimible = fidelidad 100% al design aprobado, 0 compute en Vercel, 0 dependencias nuevas.

**Trade-off:** David tiene que hacer Ctrl+P local. Asumible: el caso de uso es 1 cert por evento, no escala industrial todavía.

### 2. `@page { size: 297mm 210mm }` — NO keyword `A4 landscape`

**Decisión:** declarar dimensiones absolutas en mm, no el keyword.

**Por qué:** Chrome en algunos drivers (y especialmente cuando el system printer driver es Letter 8.5×11") **NO resuelve** el keyword `A4 landscape` y cae al page-size del system driver. Resultado: con márgenes "Predeterminado" Chrome escala al page-size Letter con márgenes laterales (espacios a los lados), con márgenes "Ninguno" intenta meter el cert a 297×210mm dentro de una página Letter → overflow vertical (espacio abajo).

**Lección:** siempre `@page { size: 297mm 210mm; margin: 0 }` (o la dimensión exacta), nunca `A4 landscape` o `Letter`.

### 3. `PrintCertButton` con `document.fonts.ready`

**Decisión:** botón que espera a que carguen las Google Fonts antes de disparar `window.print()`.

**Por qué:** Chrome a veces dispara el dialog de print antes de que las fonts web (Plus Jakarta Sans, Inter, JetBrains Mono) terminen de cargar, lo que produce layout shift en el cert impreso (texto reflowea con fallback fonts).

**Implementación:** `document.fonts.ready` Promise + 200ms de buffer. Si el browser no soporta `document.fonts`, fallback a `setTimeout(800)`.

### 4. `eventLocation` removido del cert

**Decisión:** el cert NO muestra la dirección/lugar del evento.

**Por qué:** `eventLocation` es info logística (cómo llegar), no es parte de la constancia. Mezclar logística con certificación ensucia el cert.

**Validación:** David lo pidió explícitamente — "no quiero que el cert diga dónde fue el evento, sólo que se otorgó la constancia".

### 5. QR centrado, sin URL visible

**Decisión:** el QR se muestra centrado bajo la palabra "ESCANEA" + fecha de emisión pequeña. NO se muestra la URL completa (`qlick.digital/...`) porque se cortaba.

**Razón:** David pidió QR minimalista. La URL va embebida en el QR pero no en texto visible.

### 6. Assets como data URLs (no `<img src="/path">`)

**Decisión:** la firma PNG y el isotipo se embeben como data URLs en el HTML.

**Por qué:** Chrome a veces falla al cargar assets externos durante print, especialmente si la sesión estática del service worker no los tiene en cache. Data URLs viajan inline y nunca fallan.

**Costo:** HTML más pesado (~13KB por cert) — irrelevante para 1 cert por evento.

### 7. Idempotencia por (event_id, attendee_id)

**Decisión:** si ya existe cert para (event, attendee), `issueCertificateAction` retorna el folio existente sin crear duplicado.

**Por qué:** David puede re-emitir sin miedo a duplicar. El folio es estable.

---

## 🚨 Pendiente pre-fase-2 (David)

### 1. Cleanup DB

```sql
-- Dev artifacts que dejamos para validación. NO borrar antes de
-- que David confirme visualmente que el cert en prod está OK.
DELETE FROM event_certificates WHERE folio = 'QLK-2026-68558';
DELETE FROM event_attendees WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
DELETE FROM leads WHERE phone = '+525555555099';
```

### 2. Decidir Paso 2

**Pregunta abierta:** ¿queremos script bulk para generar certs de TODOS los asistentes de eventos pasados (no solo on-demand)?

**Si sí:** scope = `scripts/bulk-issue-certificates.mjs` que itera eventos finalizados, genera cert para cada attendee checked-in, opcionalmente envía email con link al cert.

**Si no:** el sprint queda en "emitir cert on-demand desde admin" como flujo mínimo.

---

## 🔗 Referencias cruzadas

- **Ground truth del design:** `docs/qlick-cert-system/03-concept-c-dynamic-authority.html` (NO TOCAR — es la plantilla visual aprobada).
- **Source HTML server:** `src/app/cert/[folio]/page.tsx`.
- **CSS:** `src/app/cert/[folio]/cert.css`.
- **Server action:** `src/lib/certificates/issue-certificate.ts` + `src/app/admin/eventos/[id]/_actions.ts` (`issueCertificateAction`).
- **Tabla DB:** `event_certificates` (folio UNIQUE, event_id FK, attendee_id FK, issued_at, issued_by).
- **Audit log:** inserta en `audit_logs` con `action='certificate.issued'`, `actor_id`, `target_id=attendee_id`, `metadata={event_id, folio}`.
- **Predecesor:** rama de hotfix #2 bot register mergeada a main (`6b37fa0` revertido por `2415544` para no contaminar este sprint).