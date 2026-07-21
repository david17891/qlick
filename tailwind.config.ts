import type { Config } from "tailwindcss";

/**
 * Configuración Tailwind para Qlick Marketing Integral.
 * Paleta derivada de la guía de identidad visual:
 *  - Morado principal: #AB3FEA (dominante de marca)
 *  - Morado secundario: #A140DC
 *  - Naranja acento: #EF9F08 (acento visual, NO principal)
 *  - Blanco: contraste / fondos oscuros
 *
 * Para cambiar la marca, edita las variables CSS en src/app/globals.css
 * y los valores `brand.*` aquí.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx,mdx}",
    "./src/components/**/*.{ts,tsx,mdx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#faf3ff",
          100: "#f3e6ff",
          200: "#e6ccff",
          300: "#d4a8ff",
          400: "#c07bff",
          500: "#AB3FEA", // morado principal
          600: "#9b2bd6",
          700: "#7e22b0",
          800: "#671d8e",
          900: "#561a74",
          950: "#370a4f",
          secondary: "#A140DC", // morado secundario
          accent: "#EF9F08" // naranja acento
        },
        ink: {
          DEFAULT: "#0f0a1a",
          soft: "#2a2438",
          muted: "#6b6480"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"]
      },
      // Radio scale estandarizado: usar `rounded-sm/md/lg/xl/2xl` para
      // mantener jerarquía visual consistente entre primitivos.
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px"
      },
      boxShadow: {
        glow: "0 0 60px -15px rgba(171, 63, 234, 0.45)",
        "glow-accent": "0 0 60px -15px rgba(239, 159, 8, 0.45)",
        card: "0 8px 30px -12px rgba(15, 10, 26, 0.18)",
        soft: "0 4px 20px -8px rgba(15, 10, 26, 0.10)"
      },
      ringColor: {
        DEFAULT: "rgba(171, 63, 234, 0.4)"
      },
      ringOffsetColor: {
        DEFAULT: "#ffffff"
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #AB3FEA 0%, #A140DC 50%, #7e22b0 100%)",
        "brand-radial":
          "radial-gradient(circle at 20% 20%, rgba(171,63,234,0.25), transparent 50%), radial-gradient(circle at 80% 0%, rgba(239,159,8,0.18), transparent 45%)",
        "hero-mesh":
          "radial-gradient(circle at 15% 20%, rgba(171,63,234,0.35), transparent 40%), radial-gradient(circle at 85% 15%, rgba(161,64,220,0.30), transparent 40%), radial-gradient(circle at 50% 100%, rgba(239,159,8,0.20), transparent 45%)",
        "shimmer":
          "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" }
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" }
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" }
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "fade-in": "fade-in 0.4s ease-out both",
        "slide-in-right": "slide-in-right 0.3s ease-out both",
        "slide-in-left": "slide-in-left 0.3s ease-out both",
        "scale-in": "scale-in 0.2s ease-out both",
        "shimmer": "shimmer 2s linear infinite",
        float: "float 6s ease-in-out infinite",
        "pulse-soft": "pulse-soft 2.5s ease-in-out infinite"
      },
      // Delays escalonados para stagger animations.
      // Usar con Reveal o cualquier elemento que necesite `animation-delay`.
      transitionDelay: {
        0: "0ms",
        75: "75ms",
        100: "100ms",
        150: "150ms",
        200: "200ms",
        300: "300ms",
        400: "400ms",
        500: "500ms"
      }
    }
  },
  plugins: []
};

export default config;
