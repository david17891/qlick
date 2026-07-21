import type { ReactNode } from "react";
import { Navbar, Footer } from "@/components/layout";

/**
 * Layout de /servicios — Navbar + Footer globales.
 *
 * Las páginas internas (catálogo y detalle) usan Server Components
 * para fetchear el catálogo. Los modales (checkout) son Client Components
 * anidados en /servicios/[slug]/page.tsx.
 */
export default function ServiciosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
