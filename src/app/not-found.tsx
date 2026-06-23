import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { Container, Button } from "@/components/ui";
import { Logo } from "@/components/brand";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <Container className="py-24 text-center">
        <Logo lockup="icon" height={64} className="mx-auto mb-6 opacity-80" />
        <p className="text-7xl font-bold text-brand-gradient font-display">404</p>
        <h1 className="mt-4 text-2xl font-bold text-ink">
          Esta página se hizo un click fuera del radar.
        </h1>
        <p className="mt-2 text-ink-muted">
          Lo buscamos, pero no está. Quizá lo movimos o el enlace está mal.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button href="/">Volver al inicio</Button>
          <Button href="/cursos" variant="outline">Ver cursos</Button>
        </div>
      </Container>
      <Footer />
    </>
  );
}
