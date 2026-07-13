// 404 branded para /admin/* (cubre /admin/dashboard, /admin/bot,
// /admin/eventos, /admin/handoffs, etc.).
// AUDIT-010: SUPER_AUDIT_REMEDIATION_PROTOCOL.md Ola 2.

import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-7xl mb-4 font-bold bg-gradient-to-r from-purple-600 to-fuchsia-500 bg-clip-text text-transparent">
        404
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
        No encontramos esa página
      </h1>
      <p className="mt-3 text-lg text-gray-600 max-w-md">
        Es posible que el enlace haya cambiado o que ya no esté disponible.
        Te dejamos algunas opciones para que sigas trabajando.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link
          href="/admin/eventos"
          className="inline-flex items-center justify-center px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-sm hover:bg-purple-700 transition"
        >
          Ir al panel de eventos
        </Link>
        <Link
          href="/admin/handoffs"
          className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition"
        >
          Ver handoffs
        </Link>
      </div>
    </div>
  );
}
