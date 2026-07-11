# Sistema de Certificados Qlick — Análisis Crítico & Brand Guide

> Documento de trabajo del Director Creativo. Define el *bridge* entre el certificado actual de Paul (marca personal) y la nueva identidad institucional Qlick (plataforma tecnológica premium).

---

## 1. Lectura de los adjuntos

### 📜 Certificado actual de Paul (`74314A3A-...png`)
**Lo que sirve:**
- Estructura institucional clásica "Se otorga la presente a → Por haber asistido a → Impartido por → Duración". Hay que conservarla textual: comunica formalidad sin esfuerzo.
- Pie de firma "Estratega de negocios y marketing" — bueno como descriptor de rol.

**Lo que cambia:**
- La **foto grande de Paul a la derecha** reduce el certificado a "diploma de un profesor". Para que sea plataforma, la autoridad debe venir del **sello Qlick**, no del rostro del讲师.
- El **color naranja `#EA580C`** no existe en el sistema Qlick. Es ruido cromático contra el púrpura de marca.
- Las **vinetas decorativas doradas con rombos** se sienten pre-2010 (estética Canva 2017). Hay que reemplazarlas por líneas de marca Qlick.
- El certificado se llena **a mano** (líneas vacías para Fecha/Firma). No es un sistema — es una plantilla estática.

### 🎨 Logo Qlick (`40450bca-...png`)
**ADN que NO se toca:**
- **Púrpura vibrante `#A855F7`** como firma cromática.
- **Punto amarillo `#FBBF24`** sobre la `i` = spark de marca.
- **La Q con antena/cable** = metáfora visual de "Q-click" (señal + interacción). Es nuestro hook icónico, único en el mercado mexicano de marketing digital.
- **Brillo/sparkle** al pie de la `k` = tech + magia + transformación.
- Letterforms **redondos, gruesos, amigables** = la marca no es fría ni intimidante.

### 🔠 Isotipo Q (`2d04c881-...png`)
- La Q con antena aíslada funciona como **sello/badge institucional** — perfecto para usar como marca de agua o sello dorado en el certificado.

### ✍️ Firma de Paul (`a9e7f795-...png`)
- Tinta negra sobre papel con marcas de agua/gotas.
- **Acción técnica:** necesitamos un PNG con **canal alfa real** (fondo transparente), recortado limpio, ~600px de ancho. La firma es un activo de marca personal que se conserva como elemento de autoridad humana dentro del sistema institucional. En el blueprint se explica cómo normalizarla.

### 🏆 Referencia Shutterstock (`1783476273578-image.png`)
**Patrones que adoptamos:**
- **Panel geométrico izquierdo** con chevrons/triángulos = energía direccional, movimiento.
- **Contraste dark panel + cream body** = autoridad + claridad.
- **Script font dorada para el nombre** = toque humano y memorable.
- **Sello "Premium Quality" al centro inferior** = ancla visual + trust signal.
- **Folio numérico visible** = verificación implícita.
- Tipografía **sans-serif bold** para "CERTIFICATE OF APPRECIATION" = autoridad moderna.

---

## 2. Design System Qlick Award — Tokens

### 🎨 Paleta de color institucional

| Token | Hex | Uso |
| --- | --- | --- |
| `qlick-purple-500` | `#A855F7` | Color de marca primario, acentos vibrantes |
| `qlick-purple-600` | `#9333EA` | Hover, elementos interactivos |
| `qlick-purple-700` | `#7E22CE` | Profundidad, sombras de marca |
| `qlick-purple-900` | `#3B0764` | Tinta sobre fondos claros (texto autoridad) |
| `qlick-spark-400` | `#FBBF24` | Punto de la i, sparks, highlights |
| `qlick-spark-500` | `#F59E0B` | Dorado acento, sellos, marcos premium |
| `qlick-obsidian-950` | `#0A0B14` | Fondo dark mode premium |
| `qlick-ink-900` | `#0F172A` | Texto principal dark |
| `qlick-ivory-50` | `#FAFAF7` | Fondo light premium |
| `qlick-cream-100` | `#F5F2EA` | Papel cálido (conceptos B/C) |
| `qlick-slate-700` | `#334155` | Texto secundario |
| `qlick-slate-500` | `#64748B` | Metadata, folios |

### 🔤 Tipografía (Google Fonts, libre y de carga rápida)

| Rol | Fuente | Por qué |
| --- | --- | --- |
| Display headings | **Plus Jakarta Sans** (700/800) | Geométrica, moderna, perfecta para tech-premium |
| Body / metadata | **Inter** (400/500) | Legibilidad probada, neutral |
| Script del nombre (toque humano) | **Dancing Script** o **Great Vibes** | Estilo manuscrito elegante — el nombre se siente "escrito para ti" |
| Acentos serif (variante) | **Fraunces** | Serif con personalidad, para detalles de autoridad |

### 🏷️ Elementos de confianza obligatorios
- **Sello Qlick dorado** (isotipo Q con spark) — esquina superior izquierda de cada certificado.
- **Folio único** formato `QLK-2026-XXXXX` (5 dígitos aleatorios, no secuencial para evitar enumeración).
- **QR dinámico** que apunta a `https://www.qlick.digital/verify/{folio}`.
- **Firma de Paul** en canal alfa, debajo de "Firma del Director Fundador".
- **Línea de verificación** "Verifica la autenticidad en qlick.digital/verify".

---

## 3. Conceptos propuestos

Los tres conceptos viven en archivos HTML reales, no en mockups de imagen. Abre cada uno en tu navegador para verlos a tamaño real A4 landscape.

- **Concepto A — Tech Vanguard & Glassmorphism** → `01-concept-a-tech-vanguard.html`
  Estética dark mode premium. Glassmorphism, gradientes neón, vibes de SaaS top-tier (tipo Linear, Vercel, Stripe Atlas). Para audiencia 100% digital nativa.

- **Concepto B — Swiss Academic & Minimalist** → `02-concept-b-swiss-academic.html`
  Estética light premium limpia. Inspirado en diplomas ejecutivos y certificados Apple/Google. Para audiencias tradicionales que valoran formalidad sobria.

- **Concepto C — Dynamic Marketing Authority** → `03-concept-c-dynamic-authority.html`
  Híbrido de alto impacto. Panel diagonal geométrico púrpura + cream body. El **nombre del alumno es el héroe absoluto**. Para máximo engagement en redes sociales del egresado.

Cada HTML es **una maqueta 1:1 del layout A4 landscape (297×210mm)** con datos placeholder realistas. Incluye todos los placeholders dinámicos (`{{student_name}}`, `{{verification_id}}`, etc.) marcados en el código para que el equipo de dev pueda conectar el motor de generación.

---

## 4. Próximos pasos

1. **Decisión de concepto** → recomendado en `05-RECOMMENDATION.md` (sección final del directorio).
2. **Activos pendientes** que necesito de ti:
   - Firma de Paul en PNG con canal alfa (la foto tiene manchas de agua — necesito una limpia).
   - Logo Qlick en SVG vectorial (el PNG actual sirve para preview pero para impresión necesitamos vector).
   - Confirmación del nombre legal que debe aparecer: ¿"Paul Velásquez" / "Paul Velásquez — CEO & Fundador" / "Dirección Académica Qlick"?
3. **Aprobación → integración técnica**: ver `04-TECH-BLUEPRINT.md` para el motor Satori/React-PDF.

---