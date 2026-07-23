"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Badge, Input, EmptyState, Spinner, LucideIcon } from "@/components/ui";
import { OrderDetailDrawer } from "./OrderDetailDrawer";
import { formatMXN, formatDate } from "@/lib/utils";
import {
  ORDER_STATUS_LABELS,
  ORDER_PAYMENT_MODE_LABELS,
  type OrderStatus,
} from "@/types/services";
import type { ServiceOrderListItem } from "@/lib/services";
import { Search } from "lucide-react";

/**
 * Tab "Pedidos" del admin.
 *
 * Lista de service_orders con:
 * - Filtros: status (single), búsqueda libre (q).
 * - Click en row → abre OrderDetailDrawer.
 * - Refresh automático después de cambios en el drawer.
 *
 * El join con services + service_variants se hace server-side en
 * listOrders() para evitar N+1. Cada item ya trae `serviceName`,
 * `serviceSlug`, `variantLabel`, `variantSlug`.
 */

const STATUS_FILTERS: { value: "" | OrderStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "pending_contact", label: "Pendiente contacto" },
  { value: "contacted", label: "Contactado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "in_progress", label: "En curso" },
  { value: "delivered", label: "Entregado" },
  { value: "closed", label: "Cerrado" },
  { value: "cancelled", label: "Cancelado" },
];

const ORDER_STATUS_TONE: Record<
  OrderStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  pending_contact: "warning",
  contacted: "info",
  confirmed: "info",
  in_progress: "info",
  delivered: "success",
  closed: "neutral",
  cancelled: "danger",
};

export function OrdersTab() {
  const [orders, setOrders] = useState<ServiceOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");
  const [search, setSearch] = useState("");

  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Error cargando los pedidos.");
        return;
      }
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  function openDrawer(id: string) {
    setDrawerOrderId(id);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerOrderId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Pedidos</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {total} {total === 1 ? "pedido" : "pedidos"} en total
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchOrders()}
          disabled={loading}
          className="rounded-full border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-brand-50 disabled:opacity-50"
        >
          {loading ? "Actualizando..." : "Refrescar"}
        </button>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <LucideIcon
              icon={Search}
              size="sm"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email o teléfono..."
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => {
              const isActive = statusFilter === f.value;
              return (
                <button
                  key={f.value || "all"}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                    (isActive
                      ? "bg-brand-500 text-white shadow-sm"
                      : "border border-brand-100 bg-white text-ink-soft hover:bg-brand-50")
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Lista */}
      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="h-8 w-8 border-4" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No hay pedidos"
          description={
            statusFilter || search
              ? "Prueba limpiar los filtros para ver más."
              : "Cuando un cliente complete el formulario en /servicios, el pedido aparece acá."
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-50/50 text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Servicio</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3">Creado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => openDrawer(o.id)}
                    className="cursor-pointer transition hover:bg-brand-50/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">
                      {o.orderNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">
                        {o.customerName}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {o.customerEmail}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      <div className="font-medium text-ink">
                        {o.serviceName}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {o.variantLabel}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {formatMXN(o.amountMXN)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ORDER_STATUS_TONE[o.status]}>
                        {ORDER_STATUS_LABELS[o.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      {ORDER_PAYMENT_MODE_LABELS[o.paymentMode]}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      {formatDate(o.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <OrderDetailDrawer
        orderId={drawerOrderId}
        open={drawerOpen}
        onClose={closeDrawer}
        onUpdated={() => void fetchOrders()}
      />
    </div>
  );
}
