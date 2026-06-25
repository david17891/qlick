import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container } from "@/components/ui";
import { getAdminAllowlist } from "@/lib/auth/admin-auth";
import { DevLoginClient } from "./DevLoginClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Dev Login · Qlick",
  robots: { index: false, follow: false },
};

/**
 * Página de login dev: solo se renderiza si NODE_ENV !== "production".
 *
 * Devuelve 404 (notFound) en producción para que no aparezca ni como ruta
 * accesible. Esto evita que builds deployados expongan el endpoint dev.
 */
export default function DevLoginPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const allowlist = getAdminAllowlist();
  // Mostramos el allowlist (sin secretos) solo para que el developer sepa
  // qué emails puede usar en esta UI. En dev eso es OK.
  const allowlistHint = allowlist.length > 0 ? allowlist.join(", ") : "(vacío)";

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-12">
        <Container>
          <DevLoginClient allowlistHint={allowlistHint} />
        </Container>
      </main>
      <Footer />
    </>
  );
}