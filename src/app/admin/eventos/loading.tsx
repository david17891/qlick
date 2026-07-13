// Loading skeleton para /admin/eventos (gestión administrativa de eventos,
// equivalente al /admin/bot del protocolo en alcance de admin).
// AUDIT-004: SUPER_AUDIT_REMEDIATION_PROTOCOL.md Ola 2.

export default function AdminEventosLoading() {
  return (
    <div
      className="min-h-[60vh] w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      aria-busy="true"
      aria-label="Cargando eventos del panel"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <div className="h-8 bg-gradient-to-r from-purple-100 to-purple-50 rounded animate-pulse w-1/3" />
          <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
        </div>
        <div className="h-10 w-40 bg-purple-100 rounded animate-pulse" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-lg overflow-hidden"
          >
            <div className="h-32 bg-gradient-to-br from-purple-50 to-gray-50 animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-5 bg-gray-100 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-gray-50 rounded animate-pulse w-full" />
              <div className="h-3 bg-gray-50 rounded animate-pulse w-1/2" />
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="h-12 bg-gray-50 rounded animate-pulse" />
                <div className="h-12 bg-gray-50 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
