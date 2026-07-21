import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Diseño de páginas que atraen clientes",
  description:
    "Diseño y desarrollo de páginas web profesionales para negocios en México. Dos paquetes con precios claros, entrega rápida y diseño con asistencia de IA.",
  alternates: { canonical: "/diseno-paginas" },
  openGraph: {
    title: "Diseño de páginas para tu negocio · Qlick Marketing Integral",
    description:
      "Dos paquetes con precios claros: desde $2,500 MXN. Diseño con IA, entrega en 5-10 días, dominio propio.",
    url: "/diseno-paginas",
    type: "website",
  },
};

export default function DisenoPaginasLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
