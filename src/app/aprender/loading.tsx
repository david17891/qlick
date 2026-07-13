// Loading skeleton para /aprender (LMS del alumno, equivalente a /lms).
// AUDIT-004: SUPER_AUDIT_REMEDIATION_PROTOCOL.md Ola 2.

export default function AprenderLoading() {
  return (
    <div
      className="min-h-[60vh] w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      aria-busy="true"
      aria-label="Cargando tu curso"
    >
      <div className="space-y-3 mb-8">
        <div className="h-10 bg-gradient-to-r from-purple-100 to-purple-50 rounded animate-pulse w-2/5" />
        <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2" />
      </div>

      {/* Video player skeleton */}
      <div className="aspect-video bg-gray-900 rounded-lg mb-6 animate-pulse flex items-center justify-center">
        <div className="h-16 w-16 rounded-full bg-white/10" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <div className="h-6 bg-gray-100 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-gray-50 rounded animate-pulse w-full" />
          <div className="h-3 bg-gray-50 rounded animate-pulse w-5/6" />
          <div className="h-3 bg-gray-50 rounded animate-pulse w-4/5" />
        </div>
        <div className="space-y-2">
          <div className="h-5 bg-gray-100 rounded animate-pulse w-1/2 mb-3" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-12 bg-white border border-gray-200 rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
