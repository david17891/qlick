import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import {
  listHandoffs,
  getRecentEventForHandoff,
  type HandoffStatus,
} from "@/lib/crm/handoffs-server";
import { normalizePhone } from "@/lib/crm/phone-utils";
import { HandoffsClient } from "./HandoffsClient";

export const metadata: Metadata = {
  title: "Handoffs · Admin · Qlick",
  description:
    "Cola de leads que pidieron hablar con un humano desde el bot de WhatsApp.",
  robots: { index: false, follow: false },
};

/**
 * Página admin de `handoff_requests` (Fase 7a.3 → G-10).
 *
 * Server Component: hace el fetch inicial con `listHandoffs` y pasa las
 * filas a `<HandoffsClient>` (Client Component con tabla + acciones +
 * filtros via URL).
 *
 * Filters via query string (URL-driven, mismo patrón que
 * `/admin/system/audit-log`):
 *   - status: pending | contacted | closed (default all)
 *   - from / to: ISO date (created_at range)
 *   - page: 0-indexed para paginación (PAGE_SIZE = 50)
 *
 * `requireAdmin()` antes de servir datos (defensa en profundidad con el
 * middleware).
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUSES: { value: "" | HandoffStatus; label: string }[] = [
  { value: "", label: "Todos los status" },
  { value: "pending", label: "Pendiente" },
  { value: "contacted", label: "Contactado" },
  { value: "closed", label: "Cerrado" },
];

interface SearchParams {
  status?: string;
  from?: string;
  to?: string;
  page?: string;
}

export default async function AdminHandoffsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  const params = await searchParams;
  const statusRaw = (params.status ?? "").trim();
  const status: HandoffStatus | "" =
    statusRaw === "pending" ||
    statusRaw === "contacted" ||
    statusRaw === "closed"
      ? statusRaw
      : "";
  const page = Math.max(0, parseInt(params.page ?? "0", 10) || 0);

  const result = await listHandoffs({
    filters: {
      status,
      from: params.from?.trim() || undefined,
      to: params.to?.trim() || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
  });

  // Cross-table: por cada lead con phone, buscamos el evento más reciente
  // que confirmó (best-effort). Si falla, devolvemos `null` y la UI muestra
  // "—". Limitamos a los phones únicos para no abusar de la DB.
  const eventContextMap = new Map<
    string,
    Awaited<ReturnType<typeof getRecentEventForHandoff>>
  >();
  if (result.ok && result.rows.length > 0) {
    const seenPhones = new Set<string>();
    for (const row of result.rows) {
      const phoneNormalized = normalizePhone(row.lead_phone);
      if (!phoneNormalized || seenPhones.has(phoneNormalized)) continue;
      seenPhones.add(phoneNormalized);
      try {
        const ctx = await getRecentEventForHandoff(phoneNormalized);
        if (ctx) eventContextMap.set(phoneNormalized, ctx);
      } catch {
        // best-effort: sigue aunque falle
      }
    }
  }

  const totalPages = Math.max(1, Math.ceil((result.total || 0) / PAGE_SIZE));
  const pendingCount = result.rows.filter((r) => r.status === "pending").length;
  const contactedCount = result.rows.filter((r) => r.status === "contacted").length;
  const closedCount = result.rows.filter((r) => r.status === "closed").length;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-50/30 py-10">
        <Container size="wide">
          <div className="mb-6">
            <p className="text-sm text-ink-muted">Admin · WhatsApp</p>
            <h1 className="text-3xl font-bold text-ink">
              Handoffs a humano
            </h1>
            <p className="text-ink-muted text-sm mt-1">
              {result.total} {result.total === 1 ? "handoff" : "handoffs"} ·{" "}
              {pendingCount} pendientes en esta página
            </p>
          </div>

          {/* Header con métricas rápidas */}
          <Card className="p-4 mb-6">
            <div className="grid grid-cols-3 gap-4">
              <StatChip
                label="Pendientes"
                value={pendingCount}
                tone="warning"
                icon="🟡"
              />
              <StatChip
                label="Contactados"
                value={contactedCount}
                tone="info"
                icon="🔵"
              />
              <StatChip
                label="Cerrados"
                value={closedCount}
                tone="neutral"
                icon="⚪"
              />
            </div>
          </Card>

          {/* Filtros (URL-driven, no JS) */}
          <Card className="p-4 mb-6">
            <form
              action="/admin/handoffs"
              method="get"
              className="flex flex-wrap items-end gap-3"
            >
              <div>
                <label
                  htmlFor="status"
                  className="block text-xs font-semibold text-ink-muted mb-1"
                >
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={status}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value || "all"} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
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
              {(status || params.from || params.to) && (
                <a
                  href="/admin/handoffs"
                  className="text-sm text-ink-muted underline self-center"
                >
                  Limpiar
                </a>
              )}
            </form>
          </Card>

          {/* Tabla / empty state */}
          {!result.ok ? (
            <Card className="p-8">
              <EmptyState
                title="No se pudo cargar la lista"
                description={result.error ?? "Error desconocido."}
              />
            </Card>
          ) : result.rows.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="Sin handoffs"
                description={
                  status || params.from || params.to
                    ? "Ningún handoff matchea los filtros actuales. Limpiá los filtros para ver todos."
                    : "Cuando un lead cliquee \"Hablar con humano\" desde el bot de WhatsApp, aparecerá acá. La tabla es append-only: cada click crea un row nuevo."
                }
              />
            </Card>
          ) : (
            <HandoffsClient
              rows={result.rows}
              eventContextMap={Object.fromEntries(
                Array.from(eventContextMap.entries()).map(([k, v]) => [
                  k,
                  // Solo serializamos los campos necesarios para el client.
                  v
                    ? {
                        eventId: v.eventId,
                        eventTitle: v.eventTitle,
                        startsAt: v.startsAt,
                        confirmedAt: v.confirmedAt,
                      }
                    : null,
                ]),
              )}
              currentPage={page}
              totalPages={totalPages}
            />
          )}
        </Container>
      </main>
      <Footer />
    </>
  );
}

/** Stat chip compacto del header. Tipos tones coinciden con `<Badge>`. */
function StatChip({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "warning" | "info" | "neutral";
  icon: string;
}) {
  return (
    <div className="rounded-lg bg-white/60 p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <span aria-hidden="true">{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
          {label}
        </p>
      </div>
      <p className="text-2xl font-bold text-ink">{value}</p>
      <Badge tone={tone} className="mt-1">
        en esta página
      </Badge>
    </div>
  );
}
