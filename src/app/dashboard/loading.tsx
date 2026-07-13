// Loading skeleton para /dashboard (ruta del alumno).
// AUDIT-004: SUPER_AUDIT_REMEDIATION_PROTOCOL.md Ola 2.

export default function DashboardLoading() {
  return (
    <div
      className="min-h-[60vh] w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      aria-busy="true"
      aria-label="Cargando tu panel"
    >
      <div className="space-y-3 mb-8">
        <div className="h-8 bg-gradient-to-r from-purple-100 to-purple-50 rounded animate-pulse w-1/2" />
        <div className="h-4 bg-gray-100 rounded animate-pulse w-1/3" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-40 bg-white border border-gray-200 rounded-lg p-5 space-y-3"
          >
            <div className="h-4 bg-purple-50 rounded animate-pulse w-1/2" />
            <div className="h-3 bg-gray-50 rounded animate-pulse w-full" />
            <div className="h-3 bg-gray-50 rounded animate-pulse w-4/5" />
            <div className="h-3 bg-gray-50 rounded animate-pulse w-3/5" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 bg-white border border-gray-200 rounded-lg animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
