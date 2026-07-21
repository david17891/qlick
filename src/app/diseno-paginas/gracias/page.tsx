import Link from "next/link";

type SearchParams = {
  test?: string;
  paquete?: string;
  monto?: string;
  email?: string;
};

export const metadata = {
  title: "Pago recibido · Qlick Web",
  description: "Confirmación de pago del servicio de páginas web de Qlick Marketing Digital.",
};

const PACKAGE_LABELS: Record<string, string> = {
  esencial: "Esencial",
  negocio: "Negocio",
};

export default function GraciasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const isTest = searchParams.test === "1";
  const paqueteLabel = PACKAGE_LABELS[searchParams.paquete ?? ""] ?? "—";
  const monto = searchParams.monto ? `$${searchParams.monto} MXN` : null;
  const email = searchParams.email ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f4f8f8] via-white to-white">
      <header className="border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold text-neutral-800">
            ← Volver a Qlick Marketing Digital
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="rounded-3xl border border-[#0f4c4c]/15 bg-white p-8 shadow-sm sm:p-12">
          {isTest ? (
            <div className="mb-6 inline-block rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-900">
              Modo test
            </div>
          ) : null}

          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#0f4c4c]/10">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 fill-[#0f4c4c]"
              aria-hidden="true"
            >
              <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />
            </svg>
          </div>

          <h1 className="font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            {isTest
              ? "Simulación de pago exitosa"
              : "¡Gracias! Recibimos tu pago"}
          </h1>

          <p className="mt-3 text-neutral-700">
            {isTest
              ? "Esto es una simulación en modo test. Cuando cableemos Stripe real, este flujo procesará el cargo de verdad. Por ahora, la pantalla confirma que el journey funciona end-to-end."
              : "Te contactamos por WhatsApp en menos de 2 horas para arrancar."}
          </p>

          <dl className="mt-8 space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-500">Paquete</dt>
              <dd className="font-semibold text-neutral-950">{paqueteLabel}</dd>
            </div>
            {monto ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-neutral-500">Monto</dt>
                <dd className="font-semibold text-neutral-950">{monto}</dd>
              </div>
            ) : null}
            {email ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-neutral-500">Email</dt>
                <dd className="font-semibold text-neutral-950">{email}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-500">Estado</dt>
              <dd className="font-semibold text-[#0f4c4c]">
                {isTest ? "Test mode" : "Pagado"}
              </dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/diseno-paginas"
              className="inline-flex items-center justify-center rounded-full bg-[#0f4c4c] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0a3939]"
            >
              Ver los demos
            </Link>
            <a
              href="https://wa.me/5215512345678?text=Hola%20Qlick%2C%20acabo%20de%20contratar%20el%20paquete%20y%20quiero%20arrancar"
              className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800 transition hover:border-neutral-400"
            >
              Escríbenos por WhatsApp
            </a>
          </div>

          <p className="mt-8 text-xs text-neutral-500">
            ¿Dudas? Mándanos WhatsApp o responde el email de confirmación.
            Horario de atención: Lun a Vie 9-19.
          </p>
        </div>
      </main>
    </div>
  );
}
