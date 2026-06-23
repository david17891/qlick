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
      boxShadow: {
        glow: "0 0 60px -15px rgba(171, 63, 234, 0.45)",
        card: "0 8px 30px -12px rgba(15, 10, 26, 0.18)"
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #AB3FEA 0%, #A140DC 50%, #7e22b0 100%)",
        "brand-radial":
          "radial-gradient(circle at 20% 20%, rgba(171,63,234,0.25), transparent 50%), radial-gradient(circle at 80% 0%, rgba(239,159,8,0.18), transparent 45%)",
        "hero-mesh":
          "radial-gradient(circle at 15% 20%, rgba(171,63,234,0.35), transparent 40%), radial-gradient(circle at 85% 15%, rgba(161,64,220,0.30), transparent 40%), radial-gradient(circle at 50% 100%, rgba(239,159,8,0.20), transparent 45%)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        float: "float 6s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
