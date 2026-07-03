import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { AdminView } from "@/components/admin/AdminView";
import { ImmediateRedirect } from "@/components/auth/ImmediateRedirect";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Panel administrativo",
  description: "Gestión de cursos, alumnos, inscripciones y pagos.",
  alternates: { canonical: "/admin" }
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // FIX 2026-07-03 v6 (sesion David, agujero persistente): el matcher del
  // middleware de Next.js 14 NO matchea "/admin" exacto (probado en 5
  // variantes). El server component llama requireAdmin() y, si no hay
  // sesion, retorna ImmediateRedirect (client component) que ejecuta
  // window.location.replace() instantaneo al hidratar. Esto bypassea
  // completamente el meta-refresh que Next.js emite con delay 1s y
  // que en algunos browsers no se ejecuta.
  const admin = await requireAdmin();
  if (!admin) {
    return <ImmediateRedirect to="/admin/login?returnUrl=%2Fadmin" />;
  }

  return (
    <>
      <Navbar />
      <AdminView adminEmail={admin.email ?? "admin"} />
      <Footer />
    </>
  );
}
