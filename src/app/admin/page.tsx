import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { AdminView } from "@/components/admin/AdminView";
import { HotLeadsPanel } from "@/components/crm/HotLeadsPanel";
import { ImmediateRedirect } from "@/components/auth/ImmediateRedirect";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Panel administrativo",
  description: "Gestión de cursos, alumnos, inscripciones y pagos.",
  alternates: { canonical: "/admin" }
};

export const dynamic = "force-dynamic";

interface AdminPageProps {
  searchParams: {
    tab?: string;
    leadId?: string;
  };
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
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

  // FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, commit 12): mostramos
  // el widget "Hot Leads" arriba del AdminView cuando el tab es CRM. Solo
  // se carga server-side (no afecta al client bundle del AdminView).
  const showHotLeads = searchParams.tab === "crm";

  return (
    <>
      <Navbar />
      {showHotLeads && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <HotLeadsPanel />
        </div>
      )}
      <AdminView adminEmail={admin.email ?? "admin"} />
      <Footer />
    </>
  );
}
