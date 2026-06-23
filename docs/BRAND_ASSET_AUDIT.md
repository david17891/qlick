# Auditoría de assets de marca — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Alcance:** los 16 archivos PNG bajo `public/brand/original/`, `public/brand/white/`
y `public/brand/00_original_logo_reference.png`.
**Método:** inspección determinista con Node (`zlib` + parseo manual de chunks IHDR/IDAT)
sobre los bytes reales del archivo. No es inspección visual.

---

## Resumen ejecutivo

| Hallazgo | Severidad | Estado |
| -------- | --------- | ------ |
| Los assets `white/*` **NO** tienen canal alfa: son rectángulos opacos. | Crítico (marca) | Documentado y mitigado en UI |
| Los assets `original/*` **SÍ** tienen canal alfa (transparencia limpia). | — | ✅ Uso seguro |
| Los assets `white/*` pesan 850–970 KB (sin optimizar). | Menor | Pendiente (fase de optimización) |
| No se dispone de versiones vectoriales (SVG). | Medio | Pedir a diseño |

**Regla crítica de marca derivada:**

> Sobre fondos oscuros **NUNCA** usar el PNG `white/*` directo: se ve como una caja
> opaca. Usar el isotipo `original` (morado transparente, mantiene contraste sobre
> `#0f0a1a`) o el componente `<BrandLockup variant="dark">` (isotipo morado +
> texto "Qlick" en blanco).

---

## Método de la auditoría

Cada PNG se leyó como buffer y se inspeccionó:

1. **`colorType`** (chunk IHDR, byte 25):
   - `6` = RGBA → transparencia real (canal alfa).
   - `2` = RGB → **sin** canal alfa (rectángulo opaco).
2. **Dimensiones** (`width`/`height` del chunk IHDR).
3. **Tamaño en disco**.

El `colorType` es determinante: un `colorType: 2` **garantiza** que el archivo no
declara transparencia, sin importar cómo se vea en un visor con fondo claro.

---

## Tabla de assets

| # | Archivo | colorType | Transparencia | Dim (px) | Uso actual |
| - | ------- | --------- | ------------- | -------- | ---------- |
| 00 | `00_original_logo_reference.png` | 2 (RGB) | ❌ Opaco | 500×500 | Solo referencia interna |
| 01 | `original/01_qlick_full_logo_transparent_canvas_500.png` | 6 (RGBA) | ✅ | 500×500 | Logo completo (fondos claros) |
| 02 | `original/02_qlick_full_logo_tight_transparent.png` | 6 (RGBA) | ✅ | 500×361 | Logo compacto (fondos claros) |
| 03 | `original/03_qlick_logo_no_tagline_transparent.png` | 6 (RGBA) | ✅ | 500×300 | Logo sin tagline (fondos claros) |
| 04 | `original/04_qlick_icon_q_mouse_cable_transparent.png` | 6 (RGBA) | ✅ | 240×330 | Marca de agua / detalle gráfico |
| 05 | `original/05_qlick_icon_q_mouse_square_transparent.png` | 6 (RGBA) | ✅ | 366×366 | **Isotipo — uso universal (claros y oscuros)** |
| 07 | `original/07_qlick_wordmark_lick_dot_transparent.png` | 6 (RGBA) | ✅ | 315×160 | Wordmark (fondos claros) |
| 08 | `original/08_qlick_tagline_marketing_integral_transparent.png` | 6 (RGBA) | ✅ | 302×47 | Tagline (fondos claros) |
| 09 | `original/09_qlick_orange_dot_transparent.png` | 6 (RGBA) | ✅ | 52×45 | Punto de acento naranja |
| 10 | `white/10_qlick_full_logo_white_with_tagline.png` | 2 (RGB) | ❌ Opaco | 1448×1086 | **NO usar directo** |
| 11 | `white/11_qlick_full_logo_white_no_tagline.png` | 2 (RGB) | ❌ Opaco | 1448×1086 | **NO usar directo** |
| 13 | `white/13_qlick_icon_q_mouse_white_v2.png` | 2 (RGB) | ❌ Opaco | 1254×1254 | **NO usar directo** |
| 14 | `white/14_qlick_wordmark_qlick_white.png` | 2 (RGB) | ❌ Opaco | 2172×724 | **NO usar directo** |
| 15 | `white/15_qlick_tagline_marketing_integral_white.png` | 2 (RGB) | ❌ Opaco | 2172×724 | **NO usar directo** |

> No existe archivo `06` en el set original; la numeración salta de 05 a 07. No es
> un error de la auditoría.

---

## Estado de uso en la plataforma

### Assets en uso (producción)

- **`05_qlick_icon_q_mouse_square_transparent.png`** (isotipo morado): uso intensivo.
  Navbar, footer, CTA final del home, `BrandLockup` (fondos oscuros). Es el asset
  más versátil porque el morado `#AB3FEA` mantiene contraste sobre fondos claros y
  oscuros.
- **`01`, `02`, `03`** (logos completos morados): páginas con fondos claros.
- **`07`, `08`, `09`** (wordmark, tagline, dot): composiciones puntuales.

### Assets **NO** usados directamente (los `white/*`)

Los cinco archivos `white/*` son todos `colorType: 2` (RGB opaco). **Ninguno se
renderiza directo** sobre la UI. Su función visual (marca blanca sobre fondo oscuro)
se cumple mediante:

- `<BrandLockup variant="dark">` → isotipo morado + texto "Qlick" tipográfico blanco.
- `<Isotipo>` (morado transparente) cuando solo hace falta el ícono.

Esto evita el "rectángulo opaco" que aparecía antes en footer y CTA.

---

## Cambios aplicados en esta auditoría

1. `src/lib/brand-manifest.ts` reescrito: cada asset es ahora un objeto con
   `background`, `width`, `height`, `recommendedUse`, `avoidUse`, `notes` + bloque
   `audit` con el veredicto.
2. `src/components/brand/Logo.tsx`: `resolveAssetSrc()` adaptado a la nueva
   estructura; añadido `BrandLockup` (forma segura para fondos oscuros).
3. `src/components/layout/Footer.tsx`: ya **no** usa `Logo variant="white"` opaco;
   usa `<BrandLockup variant="dark" showTagline>`.
4. `src/app/page.tsx`: CTA final ya **no** usa `Logo variant="white"`; usa
   `<Isotipo size={48}>`.
5. Verificado: `grep variant="white"` en `src/` → 0 coincidencias.

---

## Recomendaciones (no bloqueantes para el MVP)

1. **Pedir a diseño los assets en SVG** (o como mínimo, los `white/*` reexportados
   con canal alfa real). Un SVG del isotipo pesaría <2 KB vs 1254×1254 px PNG.
2. **Optimizar PNGs** con `oxipng`/`pngcrush` antes de producción: los `white/*`
   de 850–970 KB son innecesariamente grandes (y ni siquiera se usan directo).
3. **Generar favicon** a partir del isotipo cuadrado (`05`) en múltiples tamaños
   (16/32/180/192/512) en lugar de servir el PNG de 366×366.
4. Mantener la regla de marca documentada en `DECISIONS.md` (D-012) para que
   cualquier añadido futuro respete el patrón `BrandLockup dark` sobre fondos
   oscuros.
