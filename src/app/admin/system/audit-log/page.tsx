import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/crm/audit-server";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Audit log · Admin · Qlick",
  description: "Registro de cambios hechos por admins en el panel.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin/system/audit-log" },
};

/**
 * Página de auditoría de acciones admin (Fase 5 Bloque 2).
 *
 * Lista entries de `admin_audit_log` con filtros básicos:
 * - actor_email (query string)
 * - entity_type (query string)
 * - action (query string, partial match)
 * - rango de fecha via from / to (query string, ISO date)
 *
 * Paginación via `page` (default 0, 50 por page).
 *
 * Por ahora: vista de solo lectura con diff JSON expandible. Próxima
 * iteración: filtros UI (dropdowns + date picker) en vez de query strings.
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ENTITY_TYPES = [
  { value: "", label: "Todas las entidades" },
  { value: "event", label: "Eventos" },
  { value: "lead", label: "Leads" },
  { value: "survey", label: "Encuestas" },
  { value: "interaction", label: "Interacciones" },
  { value: "note", label: "Notas" },
  { value: "task", label: "Tareas" },
];

interface SearchParams {
  actorEmail?: string;
  entityType?: string;
  action?: string;
  /** Búsqueda libre (Fase 6 Hito C). */
  q?: string;
  from?: string;
  to?: string;
  page?: string;
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdmin();
  if (!admin) {
    return null;
  }

  const params = await searchParams;
  const page = Math.max(0, parseInt(params.page ?? "0", 10) || 0);

  const result = await listAuditLogs({
    actorEmail: params.actorEmail?.trim() || undefined,
    entityType: params.entityType?.trim() || undefined,
    action: params.action?.trim() || undefined,
    q: params.q?.trim() || undefined,
    from: params.from?.trim() || undefined,
    to: params.to?.trim() || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  if (!result.ok) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-slate-50">
          <Container size="wide" className="py-10">
            <h1 className="text-3xl font-bold text-ink">Audit log</h1>
            <Card className="p-6 mt-6">
              <EmptyState
                title="No se pudo cargar el log"
                description={result.error ?? "Error desconocido."}
              />
            </Card>
          </Container>
        </main>
        <Footer />
      </>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-slate-50">
        <Container size="wide" className="py-10">
          <div className="mb-4 text-xs text-ink-muted flex items-center gap-2">
            <Link href="/admin" className="hover:text-ink">
              ← Panel principal
            </Link>
          </div>
          {/* Header */}
          <div className="mb-6">
            <p className="text-sm text-ink-muted">Sistema · Diagnóstico</p>
            <h1 className="text-3xl font-bold text-ink">Audit log</h1>
            <p className="text-ink-muted text-sm mt-1">
              {result.total} {result.total === 1 ? "entry" : "entries"} registradas.
              {params.actorEmail || params.entityType || params.action || params.q ? (
                <> Filtrado.</>
              ) : null}
            </p>
          </div>

          {/* Filtros (URL-driven, no JS) */}
          <Card className="p-4 mb-6">
            <form
              action="/admin/system/audit-log"
              method="get"
              className="flex flex-wrap items-end gap-3"
            >
              <div className="flex-1 min-w-[200px]">
                <label
                  htmlFor="q"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Búsqueda libre
                </label>
                <input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={params.q ?? ""}
                  placeholder="lead, david@, event_clone…"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="actorEmail"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Admin (email)
                </label>
                <input
                  id="actorEmail"
                  name="actorEmail"
                  type="email"
                  defaultValue={params.actorEmail ?? ""}
                  placeholder="david@qlick.mx"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="entityType"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Entidad
                </label>
                <select
                  id="entityType"
                  name="entityType"
                  defaultValue={params.entityType ?? ""}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                >
                  {ENTITY_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="action"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Acción
                </label>
                <input
                  id="action"
                  name="action"
                  defaultValue={params.action ?? ""}
                  placeholder="event.create"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="from"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Desde
                </label>
                <input
                  id="from"
                  name="from"
                  type="date"
                  defaultValue={params.from ?? ""}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="to"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Hasta
                </label>
                <input
                  id="to"
                  name="to"
                  type="date"
                  defaultValue={params.to ?? ""}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-brand-500 text-white px-4 py-1.5 text-sm font-semibold hover:bg-brand-600"
              >
                Filtrar
              </button>
              {(params.actorEmail || params.entityType || params.action || params.q || params.from || params.to) && (
                <Link
                  href="/admin/system/audit-log"
                  className="text-sm text-ink-muted underline self-center"
                >
                  Limpiar
                </Link>
              )}
            </form>
          </Card>

          {/* Tabla */}
          {result.entries.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="Sin cambios registrados"
                description="Cuando un admin cree, edite o archive un evento, aparecerá acá. Si la tabla admin_audit_log no existe todavía, aplicá la migration 20260629000000_admin_audit_log_diff.sql."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-4 py-3 font-semibold text-ink">Fecha</th>
                      <th className="text-left px-4 py-3 font-semibold text-ink">Admin</th>
                      <th className="text-left px-4 py-3 font-semibold text-ink">Acción</th>
                      <th className="text-left px-4 py-3 font-semibold text-ink">Entidad</th>
                      <th className="text-left px-4 py-3 font-semibold text-ink">Cambios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                          {formatDate(entry.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                          {entry.actorEmail}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              entry.action.endsWith("create")
                                ? "success"
                                : entry.action.includes("archive") ||
                                    entry.action.includes("delete")
                                  ? "warning"
                                  : "info"
                            }
                          >
                            {entry.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                          {entry.entityType}
                          <br />
                          <code className="text-xs text-ink-muted">
                            {entry.entityId ? `${entry.entityId.slice(0, 8)}…` : "—"}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <DiffView entry={entry} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-sm">
              <p className="text-ink-muted">
                Página {page + 1} de {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 0 && (
                  <Link
                    href={`/admin/system/audit-log?${new URLSearchParams({
                      ...(params.actorEmail && { actorEmail: params.actorEmail }),
                      ...(params.entityType && { entityType: params.entityType }),
                      ...(params.action && { action: params.action }),
                      ...(params.q && { q: params.q }),
                      ...(params.from && { from: params.from }),
                      ...(params.to && { to: params.to }),
                      page: String(page - 1),
                    })}`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-ink hover:bg-slate-50"
                  >
                    ← Anterior
                  </Link>
                )}
                {page < totalPages - 1 && (
                  <Link
                    href={`/admin/system/audit-log?${new URLSearchParams({
                      ...(params.actorEmail && { actorEmail: params.actorEmail }),
                      ...(params.entityType && { entityType: params.entityType }),
                      ...(params.action && { action: params.action }),
                      ...(params.q && { q: params.q }),
                      ...(params.from && { from: params.from }),
                      ...(params.to && { to: params.to }),
                      page: String(page + 1),
                    })}`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-ink hover:bg-slate-50"
                  >
                    Siguiente →
                  </Link>
                )}
              </div>
            </div>
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}

/**
 * Sub-componente: muestra diff inline (before → after) para entrys con
 * snapshots. Si no hay snapshots, muestra el metadata si existe.
 */
function DiffView({
  entry,
}: {
  entry: { before: Record<string, unknown> | null; after: Record<string, unknown> | null; metadata: Record<string, unknown> | null };
}) {
  if (entry.before || entry.after) {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-brand-700 font-semibold">
          Ver diff
        </summary>
        <div className="mt-2 space-y-2">
          {entry.before && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2">
              <p className="text-[10px] font-bold uppercase text-red-700 mb-1">
                Antes
              </p>
              <pre className="whitespace-pre-wrap break-words text-ink-soft">
                {JSON.stringify(entry.before, null, 2)}
              </pre>
            </div>
          )}
          {entry.after && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
              <p className="text-[10px] font-bold uppercase text-emerald-700 mb-1">
                Después
              </p>
              <pre className="whitespace-pre-wrap break-words text-ink-soft">
                {JSON.stringify(entry.after, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </details>
    );
  }
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    return (
      <code className="text-xs text-ink-muted">
        {JSON.stringify(entry.metadata)}
      </code>
    );
  }
  return <span className="text-xs text-ink-muted">—</span>;
}