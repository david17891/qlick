import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { AdminView } from "@/components/admin/AdminView";

export const metadata: Metadata = {
  title: "Panel administrativo",
  description: "Gestión de cursos, alumnos, inscripciones y pagos.",
  alternates: { canonical: "/admin" }
};

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <>
      <Navbar />
      <AdminView />
      <Footer />
    </>
  );
}
