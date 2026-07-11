# Recomendación del Director Creativo · v2

> Iteración tras feedback de David: pulir conceptos B y C, vectorizar la firma y usar el logo Q oficial de Qlick. Resultado abajo.

---

## ✅ Lo que cambió en v2

### Activos reales (vectorizados desde los originales)

| Activo | Antes | Ahora |
| --- | --- | --- |
| **Firma de Paul** | SVG inventado con strokes genéricos | **`paul-signature.svg` · 13.2 KB** — Vectorizada pixel-perfect del original. Sin fondo blanco, sin manchas de agua. Cada trazo, loop y la "V" superior preservados. |
| **Logo Q** | Q genérica dibujada a mano en SVG | **`qlick-q-icon.svg` · 2.2 KB** — Vectorizada del PNG oficial de Qlick (la Q con antena/cable, idéntica). Color forzado a `#A855F7`. |
| **Wordmark** | Texto "Qlick" + dot CSS | **`qlick-wordmark.svg`** + **`qlick-wordmark-compact.svg`** — Q icon real + "lick" en Plus Jakarta 800 + dot amarillo spark `#FBBF24` en la `i`. |

Pipeline técnico documentado en `assets/vectorize-signature.py` y `assets/vectorize-q-logo.py` — reproducible y actualizable si David cambia la firma o el logo en el futuro.

### Concepto B · Swiss Academic · v2
- Reflow del layout central: ya no hay overlap entre la línea de meta y la firma.
- La línea "DURACIÓN 12 HORAS · IMPARTIDO POR..." se movió al footer donde tiene más sentido (junto a la verificación).
- Firma real de Paul al pie, no SVG inventado.
- Q icon real en el wordmark superior izquierdo.
- Sello dorado central ahora usa la Q real invertida a blanco (no un círculo con "Q" tipográfica).

### Concepto C · Dynamic Marketing Authority · v2
- Q icon real en el panel púrpura izquierdo (no Q genérica).
- Wordmark "Ql.spark.ck" oficial con dot amarillo.
- Firma real al pie en lugar del placeholder.
- Verify card con QR + URL + fecha, balance perfecto con el nombre hero.

---

## 🏆 Mi recomendación se mantiene: **Concepto C**

No cambió mi lectura. El C sigue siendo el que mejor cumple los 3 objetivos:

1. **Identidad institucional** sobre marca personal — el logo Qlick pesa más que el rostro del讲师.
2. **El alumno como héroe** — el nombre a 78px es lo primero que se ve y lo primero que se comparte en redes.
3. **Premium imprimible Y digital** — funciona en LinkedIn, Instagram, y enmarcado en una oficina.

**Pero ahora con activos reales, la diferencia visual entre C y B es más clara:**
- B es elegante, sobrio, executive-suite.
- C es vibrante, energético, hero-name — el que va a generar FOMO en redes.

---

## 🎬 Si elegimos C

1. Dame el visto bueno y procedo con Sprint 1 del blueprint (`04-TECH-BLUEPRINT.md`).
2. Activos ya están listos, no se necesitan más archivos de tu lado (la firma y el logo ya están vectorizados).
3. Primer certificado de prueba renderizado en PDF + PNG: ~30 minutos de trabajo.

## 🎬 Si elegimos B

1. Mismo flujo, pero con menos trabajo de pulido visual (ya está más cerca de "production-ready").
2. La pregunta es: ¿la audiencia meta de Qlick es más "ejecutivo sobrio" o más "creator/entrepreneur hero"? Eso define B vs C.

## 🎬 Si quieres los dos como variantes

El blueprint técnico ya está diseñado para `template_variant` en la DB. Emitir mitad B y mitad C según el programa o el segmento del alumno es trivial. **Esta es mi opción preferida si David no quiere decidir.**

---

*— Mavis, Head of Brand & UI/UX · Qlick Marketing Digital · 2026*