/**
 * Manifiesto de assets de marca — Qlick Marketing Integral.
 * Referencia central para todos los componentes de marca.
 *
 * Resultado de la auditoría técnica de transparencia (docs/BRAND_ASSET_AUDIT.md):
 *  - Los assets "original" (morados) tienen canal alfa real → transparencia limpia.
 *  - Los assets "white"  (blancos) NO tienen canal alfa → son rectángulos opacos.
 *
 * ⚠️ Por eso, sobre fondos oscuros NO se debe usar el PNG blanco directo: se ve
 * como una caja/rectángulo. En su lugar usar:
 *   - El isotipo original (morado, transparente) que mantiene buen contraste
 *     sobre fondos oscuros (#0f0a1a), o
 *   - El componente <BrandLockup variant="dark"> que combina isotipo + texto.
 *
 * Reglas vigentes (ajustadas tras auditoría):
 *  - Fondos claros   → assets "original" (transparentes). ✅ seguro.
 *  - Fondos oscuros  → isotipo "original" o <BrandLockup variant="dark">. ⚠️
 *  - Espacio pequeño → isotipo (icon).
 *  - NO deformar, NO recolorear los originales.
 */

export type BrandVariant = "original" | "white";
export type Background = "transparent" | "opaque";

export interface BrandAssetMeta {
  /** Ruta pública del archivo. */
  src: string;
  /** Si el PNG declara transparencia real (canal alfa). */
  background: Background;
  /** Ancho/alto reales en px (para preservar proporciones). */
  width: number;
  height: number;
  /** Cuándo es seguro usarlo. */
  recommendedUse: string[];
  /** Cuándo NO usarlo. */
  avoidUse: string[];
  /** Notas adicionales de la auditoría. */
  notes?: string;
}

export const brandManifest = {
  name: "Qlick Marketing Integral",
  shortName: "Qlick",
  tagline: "Marketing Integral",
  colors: {
    primary: "#AB3FEA",
    secondary: "#A140DC",
    accent: "#EF9F08"
  },
  /** Veredicto de la auditoría de transparencia. */
  audit: {
    originalTransparent: true,
    whiteTransparent: false,
    summary:
      "Los assets 'white' son rectángulos opacos (sin canal alfa). No usar el PNG blanco directo sobre fondos oscuros."
  },
  assets: {
    full: {
      original: {
        src: "/brand/original/01_qlick_full_logo_transparent_canvas_500.png",
        background: "transparent",
        width: 500,
        height: 500,
        recommendedUse: ["fondos claros", "branding formal"],
        avoidUse: ["fondos oscuros con texto pequeño"]
      },
      // ⚠️ NO transparente: rectángulo opaco. Ver BrandLockup dark en su lugar.
      white: {
        src: "/brand/white/10_qlick_full_logo_white_with_tagline.png",
        background: "opaque",
        width: 1448,
        height: 1086,
        recommendedUse: ["NO usar directo sobre fondo oscuro"],
        avoidUse: ["navbar", "footer", "hero oscuro", "CTA oscuro"],
        notes:
          "Sin canal alfa. Reemplazar por BrandLockup dark o isotipo original."
      }
    },
    fullTight: {
      original: {
        src: "/brand/original/02_qlick_full_logo_tight_transparent.png",
        background: "transparent",
        width: 500,
        height: 361,
        recommendedUse: ["fondos claros", "layouts ajustados"],
        avoidUse: ["fondos oscuros"]
      },
      white: {
        src: "/brand/white/10_qlick_full_logo_white_with_tagline.png",
        background: "opaque",
        width: 1448,
        height: 1086,
        recommendedUse: ["NO usar directo sobre fondo oscuro"],
        avoidUse: ["footer", "hero oscuro"]
      }
    },
    noTagline: {
      original: {
        src: "/brand/original/03_qlick_logo_no_tagline_transparent.png",
        background: "transparent",
        width: 2624,
        height: 1632,
        recommendedUse: ["encabezados", "branding compacto"],
        avoidUse: ["fondos oscuros con bajo contraste"]
      },
      white: {
        src: "/brand/white/11_qlick_full_logo_white_no_tagline.png",
        background: "opaque",
        width: 1448,
        height: 1086,
        recommendedUse: ["NO usar directo sobre fondo oscuro"],
        avoidUse: ["navbar", "footer"]
      }
    },
    icon: {
      original: {
        src: "/brand/original/05_qlick_icon_q_mouse_square_transparent.png",
        background: "transparent",
        width: 366,
        height: 366,
        recommendedUse: [
          "favicon",
          "avatar",
          "fondos claros Y oscuros (morado brillante)",
          "navbar",
          "footer"
        ],
        avoidUse: []
      },
      white: {
        src: "/brand/white/13_qlick_icon_q_mouse_white_v2.png",
        background: "opaque",
        width: 1254,
        height: 1254,
        recommendedUse: ["NO usar directo sobre fondo oscuro"],
        avoidUse: ["footer", "hero oscuro"]
      },
      cable: {
        src: "/brand/original/04_qlick_icon_q_mouse_cable_transparent.png",
        background: "transparent",
        width: 240,
        height: 330,
        recommendedUse: ["marca de agua", "detalle gráfico"],
        avoidUse: ["espacios cuadrados pequeños"]
      }
    },
    wordmark: {
      original: {
        src: "/brand/original/07_qlick_wordmark_lick_dot_transparent.png",
        background: "transparent",
        width: 315,
        height: 160,
        recommendedUse: ["composición horizontal en fondos claros"],
        avoidUse: ["fondos oscuros"]
      },
      white: {
        src: "/brand/white/14_qlick_wordmark_qlick_white.png",
        background: "opaque",
        width: 2172,
        height: 724,
        recommendedUse: ["NO usar directo sobre fondo oscuro"],
        avoidUse: ["footer", "hero oscuro"]
      }
    },
    tagline: {
      original: {
        src: "/brand/original/08_qlick_tagline_marketing_integral_transparent.png",
        background: "transparent",
        width: 302,
        height: 47,
        recommendedUse: ["subtítulo en fondos claros"],
        avoidUse: ["fondos oscuros"]
      },
      white: {
        src: "/brand/white/15_qlick_tagline_marketing_integral_white.png",
        background: "opaque",
        width: 2172,
        height: 724,
        recommendedUse: ["NO usar directo sobre fondo oscuro"],
        avoidUse: ["footer", "hero oscuro"]
      }
    },
    accentDot: {
      src: "/brand/original/09_qlick_orange_dot_transparent.png",
      background: "transparent",
      width: 52,
      height: 45,
      recommendedUse: ["acento visual", "bullets", "highlights"],
      avoidUse: []
    },
    reference: {
      src: "/brand/00_original_logo_reference.png",
      background: "opaque",
      width: 500,
      height: 500,
      recommendedUse: ["referencia interna", "NO producción"],
      avoidUse: ["cualquier uso面向 al usuario"]
    }
  }
} as const;

export type BrandAssetKey = keyof typeof brandManifest.assets;
