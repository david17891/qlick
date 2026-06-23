import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui";
import {
  checkSupabaseConfig,
  realDataAdvisory,
} from "@/lib/supabase/health";

export const metadata: Metadata = {
  title: "Sistema · Supabase | Admin",
  description: "Diagnóstico de la conexión Supabase.",
  // No indexar: panel interno.
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin/system/supabase" },
};

/**
 * Panel interno de diagnóstico de Supabase.
 *
 * Server Component: lee variables de entorno en el servidor (nunca manda
 * secretos al cliente). Solo muestra presencia/ausencia y formato, nunca valores.
 *
 * Acceso: hoy es público en URL (no hay auth real todavía — D-004). Cuando se
 * active Supabase Auth, proteger esta ruta con middleware de admin.
 */
export default function SupabaseSystemPage() {
  const health = checkSupabaseConfig();
  const advisory = realDataAdvisory();

  return (
    <>
      <Navbar />
      <main className="bg-slate-50 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <header className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Sistema · Diagnóstico
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Estado de Supabase
            </h1>
            <p className="mt-2 text-slate-600 max-w-2xl">
              Panel interno que muestra si la conexión a Supabase está
              configurada. <strong>Nunca</strong> revela valores de claves, solo
              su presencia y formato.
            </p>
          </header>

          {/* Estado global */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  Estado global
                </h2>
                <Badge
                  tone={health.configured ? "success" : "warning"}
                  title={
                    health.configured
                      ? "Variables mínimas presentes"
                      : "Faltan variables — modo demo"
                  }
                >
                  {health.configured ? "Configurado" : "Demo / fallback"}
                </Badge>
              </div>
            </CardHeader>
            <CardBody className="pt-2">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <Field
                  label="Modo actual"
                  value={health.mode === "configured" ? "configured" : "demo"}
                  tone={health.mode === "configured" ? "success" : "warning"}
                />
                <Field
                  label="Listo para datos reales"
                  value={health.readyForRealData ? "sí (config)" : "no"}
                  tone={health.readyForRealData ? "info" : "neutral"}
                />
              </dl>
              <p className="mt-3 text-xs text-slate-500">
                &ldquo;Listo para datos reales&rdquo; refleja solo la
                configuración. Falta además <strong>RLS</strong> activo y{" "}
                <strong>aviso de privacidad</strong> publicado antes de capturar
                datos reales (ver aviso abajo).
              </p>
            </CardBody>
          </Card>

          {/* Variables */}
          <Card className="mb-6">
            <CardHeader>
              <h2 className="text-lg font-semibold text-slate-900">
                Variables detectadas
              </h2>
            </CardHeader>
            <CardBody className="pt-2">
              <ul className="divide-y divide-slate-100 text-sm">
                <VarRow
                  name="NEXT_PUBLIC_SUPABASE_URL"
                  present={health.url.present}
                  extra={
                    health.url.present
                      ? health.url.valid
                        ? "URL válida"
                        : "formato inválido"
                      : undefined
                  }
                  tone={
                    !health.url.present
                      ? "neutral"
                      : health.url.valid
                        ? "success"
                        : "danger"
                  }
                />
                <VarRow
                  name="NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
                  present={health.publishableKey.present}
                  extra={
                    health.publishableKey.present
                      ? health.publishableKey.wellFormed
                        ? "JWT bien formado"
                        : "formato dudoso"
                      : undefined
                  }
                  tone={
                    !health.publishableKey.present
                      ? "neutral"
                      : health.publishableKey.wellFormed
                        ? "success"
                        : "warning"
                  }
                />
                <VarRow
                  name="SUPABASE_SECRET_KEY"
                  present={health.secretKey.present}
                  extra={
                    health.secretKey.present
                      ? health.secretKey.wellFormed
                        ? "JWT bien formado"
                        : "formato dudoso"
                      : undefined
                  }
                  tone={
                    !health.secretKey.present
                      ? "neutral"
                      : health.secretKey.wellFormed
                        ? "success"
                        : "warning"
                  }
                  secret
                />
                <VarRow
                  name="SUPABASE_PROJECT_REF"
                  present={health.projectRef.present}
                  tone={health.projectRef.present ? "info" : "neutral"}
                />
                <VarRow
                  name="NEXT_PUBLIC_APP_URL"
                  present={health.appUrl.present}
                  extra={health.appUrl.present ? health.appUrl.value : undefined}
                  tone="info"
                />
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Los campos marcados como <Badge tone="neutral">secreto</Badge>{" "}
                nunca muestran su valor aquí, solo si están presentes.
              </p>
            </CardBody>
          </Card>

          {/* Avisos */}
          {health.warnings.length > 0 && (
            <Card className="mb-6 border-amber-200">
              <CardHeader>
                <h2 className="text-lg font-semibold text-slate-900">
                  Avisos ({health.warnings.length})
                </h2>
              </CardHeader>
              <CardBody className="pt-2">
                <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                  {health.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {/* Aviso de seguridad: datos reales */}
          <Card className="border-red-200">
            <CardHeader>
              <h2 className="text-lg font-semibold text-slate-900">
                ⚠️ Antes de usar datos reales
              </h2>
            </CardHeader>
            <CardBody className="pt-2">
              <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">
                {advisory}
              </pre>
              <p className="mt-4 text-xs text-slate-500">
                Ver{" "}
                <code className="bg-slate-100 px-1 py-0.5 rounded">
                  docs/SUPABASE_CONNECTION_BOOTSTRAP.md
                </code>{" "}
                y <code className="bg-slate-100 px-1 py-0.5 rounded">docs/AGENT_SUPABASE_PROTOCOL.md</code>.
              </p>
            </CardBody>
          </Card>
        </div>
      </main>
      <Footer />
    </>
  );
}

/** Fila label/valor con badge de tono. */
function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "info" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd>
        <Badge tone={tone}>{value}</Badge>
      </dd>
    </div>
  );
}

/** Fila de variable de entorno. */
function VarRow({
  name,
  present,
  extra,
  tone,
  secret,
}: {
  name: string;
  present: boolean;
  extra?: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
  secret?: boolean;
}) {
  return (
    <li className="py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <code className="text-xs sm:text-sm bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded truncate">
          {name}
        </code>
        {secret && (
          <Badge tone="neutral" title="Valor nunca revelado">
            secreto
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {extra && <span className="text-xs text-slate-500">{extra}</span>}
        <Badge tone={present ? tone : "neutral"}>
          {present ? "presente" : "ausente"}
        </Badge>
      </div>
    </li>
  );
}
