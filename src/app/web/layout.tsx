import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Páginas web que atraen clientes",
  description:
    "Diseño y desarrollo de páginas web profesionales para negocios en México. Tres paquetes con precios claros, entrega rápida y diseño con asistencia de IA.",
  alternates: { canonical: "/web" },
  openGraph: {
    title: "Páginas web para tu negocio · Qlick Marketing Digital",
    description:
      "Tres paquetes con precios claros: desde $2,500 MXN. Diseño con IA, entrega en 5-10 días, dominio propio.",
    url: "/web",
    type: "website",
  },
};

export default function WebServiceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
