/**
 * Manifiesto de assets de marca — Qlick Marketing Integral.
 * Referencia central para todos los componentes de marca.
 *
 * Reglas (de la guía de identidad visual):
 *  - Fondos claros  → usar assets "original" (morados).
 *  - Fondos oscuros → usar assets "white".
 *  - Espacio pequeño → usar icon o no-tagline.
 *  - NO deformar, NO recolorear.
 */

export const brandManifest = {
  name: "Qlick Marketing Integral",
  shortName: "Qlick",
  tagline: "Marketing Integral",
  colors: {
    primary: "#AB3FEA",
    secondary: "#A140DC",
    accent: "#EF9F08"
  },
  assets: {
    full: {
      original: "/brand/original/01_qlick_full_logo_transparent_canvas_500.png",
      white: "/brand/white/10_qlick_full_logo_white_with_tagline.png"
    },
    fullTight: {
      original: "/brand/original/02_qlick_full_logo_tight_transparent.png",
      white: "/brand/white/10_qlick_full_logo_white_with_tagline.png"
    },
    noTagline: {
      original: "/brand/original/03_qlick_logo_no_tagline_transparent.png",
      white: "/brand/white/11_qlick_full_logo_white_no_tagline.png"
    },
    icon: {
      original: "/brand/original/05_qlick_icon_q_mouse_square_transparent.png",
      white: "/brand/white/13_qlick_icon_q_mouse_white_v2.png",
      cable: "/brand/original/04_qlick_icon_q_mouse_cable_transparent.png"
    },
    wordmark: {
      original: "/brand/original/07_qlick_wordmark_lick_dot_transparent.png",
      white: "/brand/white/14_qlick_wordmark_qlick_white.png"
    },
    tagline: {
      original: "/brand/original/08_qlick_tagline_marketing_integral_transparent.png",
      white: "/brand/white/15_qlick_tagline_marketing_integral_white.png"
    },
    accentDot: "/brand/original/09_qlick_orange_dot_transparent.png",
    reference: "/brand/00_original_logo_reference.png"
  }
} as const;

export type BrandVariant = "original" | "white";
export type BrandAssetKey = keyof typeof brandManifest.assets;
