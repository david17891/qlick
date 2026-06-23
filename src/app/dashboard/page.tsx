import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { DashboardView } from "@/components/dashboard/DashboardView";

export const metadata: Metadata = {
  title: "Mi panel",
  description: "Tu progreso, cursos inscritos, certificados y actividad.",
  alternates: { canonical: "/dashboard" }
};

export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <DashboardView />
      <Footer />
    </>
  );
}
