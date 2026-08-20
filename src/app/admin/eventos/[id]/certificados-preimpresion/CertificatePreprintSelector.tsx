"use client";

import { useMemo, useState } from "react";

export interface CertificatePreprintSelectorRow {
  id: string;
  name: string;
  paymentStatus: string;
  kind: "attendee" | "pre_attendee";
}

interface Props {
  eventId: string;
  rows: CertificatePreprintSelectorRow[];
  defaultSelectedIds: string[];
  selectedIds: string[];
  hasExplicitSelection: boolean;
  blockSize: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  partial: "Apartado",
  paid: "Pagado",
  paid_manual: "Pagado manual",
  not_required: "Becado · sin pago",
  attendee: "Check-in manual",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  partial: "bg-sky-50 text-sky-800 border-sky-200",
  paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
  paid_manual: "bg-emerald-50 text-emerald-800 border-emerald-200",
  not_required: "bg-violet-50 text-violet-800 border-violet-200",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? "bg-slate-50 text-slate-700 border-slate-200";
}

function kindLabel(kind: CertificatePreprintSelectorRow["kind"]): string {
  return kind === "attendee" ? "Asistente" : "Pre-asistente";
}

export function CertificatePreprintSelector({
  eventId,
  rows,
  defaultSelectedIds,
  selectedIds,
  hasExplicitSelection,
  blockSize,
}: Props) {
  const initialIds = hasExplicitSelection ? selectedIds : defaultSelectedIds;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | CertificatePreprintSelectorRow["kind"]>("all");

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const row of rows) result.set(row.paymentStatus, (result.get(row.paymentStatus) ?? 0) + 1);
    return result;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-MX");
    return rows.filter((row) => {
      const matchesQuery = !normalizedQuery || row.name.toLocaleLowerCase("es-MX").includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || row.paymentStatus === statusFilter;
      const matchesKind = kindFilter === "all" || row.kind === kindFilter;
      return matchesQuery && matchesStatus && matchesKind;
    });
  }, [kindFilter, query, rows, statusFilter]);

  const selectedCount = selected.size;
  const filteredIds = filteredRows.map((row) => row.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFiltered() {
    setSelected((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function resetToDefault() {
    setSelected(new Set(defaultSelectedIds));
    setQuery("");
    setStatusFilter("all");
    setKindFilter("all");
  }

  function selectByKind(kind: CertificatePreprintSelectorRow["kind"] | "all") {
    setSelected(new Set(rows.filter((row) => kind === "all" || row.kind === kind).map((row) => row.id)));
  }

  function prepareSelection() {
    const params = new URLSearchParams();
    params.set("tamano", String(blockSize));
    params.set("seleccion", Array.from(selected).join(","));
    window.location.href = `/admin/eventos/${eventId}/certificados-preimpresion?${params.toString()}`;
  }

  return (
    <section className="no-print mb-5 rounded-xl border border-brand-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Armar lote de impresión</h2>
          <p className="mt-1 max-w-3xl text-xs text-ink-muted">
            Selecciona exactamente a quién quieres generar. Por defecto están marcados los pagados,
            apartados y becados; los pendientes también están disponibles para incluirlos manualmente.
          </p>
        </div>
        <div className="rounded-lg bg-brand-50 px-3 py-2 text-right">
          <div className="text-lg font-bold text-brand-700">{selectedCount}</div>
          <div className="text-[11px] text-brand-700">seleccionados</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre…"
          aria-label="Buscar confirmados por nombre"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filtrar por estado de pago"
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        >
          <option value="all">Todos los estados ({rows.length})</option>
          <option value="paid">Pagados ({counts.get("paid") ?? 0})</option>
          <option value="paid_manual">Pagados manual ({counts.get("paid_manual") ?? 0})</option>
          <option value="partial">Apartados ({counts.get("partial") ?? 0})</option>
          <option value="not_required">Becados / sin pago ({counts.get("not_required") ?? 0})</option>
          <option value="pending">Pendientes ({counts.get("pending") ?? 0})</option>
          <option value="attendee">Check-in manual ({counts.get("attendee") ?? 0})</option>
        </select>
        <select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as "all" | CertificatePreprintSelectorRow["kind"])}
          aria-label="Filtrar asistentes o pre-asistentes"
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        >
          <option value="all">Asistentes y pre-asistentes ({rows.length})</option>
          <option value="attendee">Solo asistentes ({rows.filter((row) => row.kind === "attendee").length})</option>
          <option value="pre_attendee">Solo pre-asistentes ({rows.filter((row) => row.kind === "pre_attendee").length})</option>
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => selectByKind("attendee")} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100">
          Imprimir asistentes ({rows.filter((row) => row.kind === "attendee").length})
        </button>
        <button type="button" onClick={() => selectByKind("pre_attendee")} className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 font-semibold text-sky-800 hover:bg-sky-100">
          Imprimir pre-asistentes ({rows.filter((row) => row.kind === "pre_attendee").length})
        </button>
        <button type="button" onClick={() => selectByKind("all")} className="rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 font-semibold text-violet-800 hover:bg-violet-100">
          Imprimir todos ({rows.length})
        </button>
        <button type="button" onClick={toggleFiltered} className="rounded-md border border-brand-200 px-3 py-1.5 font-semibold text-brand-700 hover:bg-brand-50">
          {allFilteredSelected ? "Quitar visibles" : "Seleccionar visibles"}
        </button>
        <button type="button" onClick={resetToDefault} className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
          Restablecer selección recomendada
        </button>
        <span className="text-ink-muted">Mostrando {filteredRows.length} de {rows.length}</span>
      </div>

      <div className="mt-3 max-h-[min(55vh,520px)] overflow-y-auto rounded-lg border border-slate-100">
        {filteredRows.length === 0 ? (
          <p className="p-5 text-center text-sm text-ink-muted">No hay confirmados con ese filtro.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredRows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  aria-label={`Seleccionar ${row.name}`}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{row.name}</span>
                <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 sm:inline">
                  {kindLabel(row.kind)}
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${statusStyle(row.paymentStatus)}`}>
                  {statusLabel(row.paymentStatus)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={prepareSelection}
          disabled={selectedCount === 0}
          className="rounded-md bg-gradient-to-r from-brand-500 to-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Preparar impresión ({selectedCount})
        </button>
        <span className="text-xs text-ink-muted">Después podrás elegir el bloque y usar Ctrl+P → Guardar como PDF.</span>
      </div>
    </section>
  );
}
