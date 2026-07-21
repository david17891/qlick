import Link from "next/link";

/**
 * Badge flotante que se muestra en los sitios demo de clientes.
 * Linkea a /diseno-paginas con la marca Qlick sutil.
 */
export function QlickBadge() {
  return (
    <Link
      href="/diseno-paginas"
      className="group fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-brand-500 px-3 py-2 text-xs font-semibold text-white shadow-glow transition hover:bg-brand-600"
      aria-label="Sitio demo hecho por Qlick Marketing Digital"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 fill-current"
        aria-hidden="true"
      >
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm-1-13h2v2h-2Zm0 4h2v6h-2Z" />
      </svg>
      <span className="hidden sm:inline">Hecho con Qlick</span>
      <span className="sm:hidden">Qlick</span>
    </Link>
  );
}
