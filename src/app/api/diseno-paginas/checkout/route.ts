import { NextRequest, NextResponse } from "next/server";

/**
 * Checkout en modo test para el servicio de páginas web.
 *
 * NO procesa dinero real. Solo simula el flujo de Stripe Checkout y
 * devuelve una URL de "pago recibido" para que David pueda validar
 * el journey end-to-end antes de cablear Stripe real.
 *
 * Modos:
 *   - Si env STRIPE_SECRET_KEY empieza con "sk_test_" o no existe → modo test
 *   - Si empieza con "sk_live_" → modo producción (TODO: cablear Stripe real)
 *
 * Body esperado: { paquete: "esencial" | "negocio", email?: string }
 */

const PACKAGE_PRICES: Record<string, { name: string; amount: number; currency: string }> = {
  "mi-pagina": { name: "Mi página", amount: 250000, currency: "mxn" },
  "mi-sitio": { name: "Mi sitio", amount: 550000, currency: "mxn" },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const paquete = String(body.paquete ?? "").toLowerCase();
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!(paquete in PACKAGE_PRICES)) {
      return NextResponse.json(
        { error: "Paquete inválido. Usa 'mi-pagina' o 'mi-sitio'." },
        { status: 400 }
      );
    }

    const pkg = PACKAGE_PRICES[paquete];
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
    const isTestMode =
      !stripeKey.startsWith("sk_live_") || stripeKey === "" || stripeKey.startsWith("sk_test_");

    if (isTestMode) {
      // Modo test: simular checkout exitoso y devolver URL de gracias.
      const graciasUrl = new URL("/diseno-paginas/gracias", req.nextUrl.origin);
      graciasUrl.searchParams.set("test", "1");
      graciasUrl.searchParams.set("paquete", paquete);
      graciasUrl.searchParams.set("monto", String(pkg.amount / 100));
      if (email) graciasUrl.searchParams.set("email", email);
      return NextResponse.json({
        mode: "test",
        ok: true,
        message: `Simulación de pago ${pkg.name} ($${pkg.amount / 100} MXN). En producción esto iría a Stripe Checkout.`,
        redirect: graciasUrl.toString(),
      });
    }

    // TODO: cuando se cablee Stripe real, aquí se crea la Checkout Session.
    return NextResponse.json(
      {
        error:
          "Stripe en modo live detectado pero el flujo real aún no está cableado. Avisa a David.",
      },
      { status: 501 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Body inválido o error inesperado." },
      { status: 400 }
    );
  }
}
