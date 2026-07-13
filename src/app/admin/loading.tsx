// Loading skeleton para /admin/* (cubre /admin/dashboard, /admin/bot,
// /admin/eventos, /admin/handoffs, /admin/system, etc.).
//
// AUDIT-004: SUPER_AUDIT_REMEDIATION_PROTOCOL.md Ola 2 (Nivel 2).
// Skeleton premium con animate-pulse, español neutro, jerarquía visual
// coherente con el branding de Qlick.

export default function AdminLoading() {
  return (
    <div
      className="min-h-[60vh] w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      aria-busy="true"
      aria-label="Cargando panel administrativo"
    >
      {/* Header skeleton */}
      <div className="space-y-3 mb-8">
        <div className="h-8 bg-gradient-to-r from-purple-100 to-purple-50 rounded animate-pulse w-1/3" />
        <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 bg-white border border-gray-200 rounded-lg p-4 space-y-2"
          >
            <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
            <div className="h-7 bg-gradient-to-r from-purple-50 to-gray-50 rounded animate-pulse w-2/3" />
            <div className="h-2 bg-gray-50 rounded animate-pulse w-full" />
          </div>
        ))}
      </div>

      {/* Tabla de datos */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="h-5 bg-gray-100 rounded animate-pulse w-1/4 mb-4" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-9 w-9 bg-purple-50 rounded-full animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
              <div className="h-2 bg-gray-50 rounded animate-pulse w-1/2" />
            </div>
            <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
