import { Card, Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function PromoSuccessPage() {
  return (
    <main className="min-h-screen bg-brand-50/30 py-16">
      <Container>
        <Card className="mx-auto max-w-xl p-8 text-center">
          <div className="text-5xl">✅</div>
          <h1 className="mt-4 text-2xl font-bold text-ink">Recibimos tu pago</h1>
          <p className="mt-3 text-ink-soft">Estamos verificando la operación. En cuanto se confirme, enviaremos al correo de contacto las instrucciones y el QR compartido para las dos personas.</p>
          <a href="/eventos/desarrollo-estructura-curso-canaco" className="mt-6 inline-flex rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white">Volver al evento</a>
        </Card>
      </Container>
    </main>
  );
}
