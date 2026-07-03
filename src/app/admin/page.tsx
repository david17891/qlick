import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { AdminView } from "@/components/admin/AdminView";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Panel administrativo",
  description: "Gestión de cursos, alumnos, inscripciones y pagos.",
  alternates: { canonical: "/admin" }
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // FIX 2026-07-03 (sesion David, agujero de seguridad): defensa en
  // profundidad. El middleware YA deberia bloquear /admin sin sesion, pero
  // si por algun motivo el matcher no matchea (caso reportado: el matcher
  // anterior "/admin/:path*" no cubria "/admin" exacto), la pagina misma
  // valida con requireAdmin(). Si no hay sesion admin, redirect a login.
  const admin = await requireAdmin();
  if (!admin) {
    redirect("/admin/login?returnUrl=%2Fadmin");
  }

  return (
    <>
      <Navbar />
      <AdminView adminEmail={admin.email ?? "admin"} />
      <Footer />
    </>
  );
}
