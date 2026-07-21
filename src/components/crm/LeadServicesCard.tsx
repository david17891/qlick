"use client";

import { useEffect, useState } from "react";
import { Card, Badge, Spinner, LucideIcon } from "@/components/ui";
import { formatMXN, formatDate } from "@/lib/utils";
import {
  ORDER_STATUS_LABELS,
  type ServiceOrderListItem,
} from "@/lib/services";
import { ShoppingBag } from "lucide-react";
import { OrderDetailDrawer } from "@/components/admin/OrderDetailDrawer";

/**
 * Sección "Servicios contratados" para el LeadDetailDrawer del CRM.
 *
 * Hace su propio fetch a `/api/admin/leads/[id]/orders` cuando se monta.
 * Lista los service_orders del lead (1 lead → N orders via lead_id FK).
 *
 * Click en una fila → abre el OrderDetailDrawer para gestión completa
 * (cambiar status, agregar notas, documentos, ver timeline).
 */

const ORDER_STATUS_TONE = {
  pending_contact: "warning",
  contacted: "info",
  confirmed: "info",
  in_progress: "info",
  delivered: "success",
  closed: "neutral",
  cancelled: "danger",
} as const;

export function LeadServicesCard({ leadId }: { leadId: string }) {
  const [orders, setOrders] = useState<ServiceOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderIdForDrawer, setOrderIdForDrawer] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/leads/${leadId}/orders`);
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error ?? "Error cargando los servicios contratados.");
          return;
        }
        setOrders(data.orders ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error de red");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  function openOrder(id: string) {
    setOrderIdForDrawer(id);
    setDrawerOpen(true);
  }

  function closeOrder() {
    setDrawerOpen(false);
    setOrderIdForDrawer(null);
  }

  // Total gastado por el lead (suma de orders no cancelados).
  const totalSpent = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((acc, o) => acc + Number(o.amountMXN), 0);
  const activeCount = orders.filter(
    (o) => !["cancelled", "closed"].includes(o.status),
  ).length;

  return (
    <>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <LucideIcon icon={ShoppingBag} size="sm" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">
                Servicios contratados
              </h3>
              <p className="text-xs text-ink-muted">
                {loading
                  ? "Cargando..."
                  : orders.length === 0
                    ? "Aún no contrató ningún servicio"
                    : `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"} · ${activeCount} activos`}
              </p>
            </div>
          </div>
          {!loading && orders.length > 0 && (
            <p className="text-sm font-bold text-ink">
              {formatMXN(totalSpent)}{" "}
              <span className="text-xs font-normal text-ink-muted">MXN</span>
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner className="h-5 w-5 border-2" />
          </div>
        ) : orders.length === 0 ? (
          <p className="rounded-lg bg-brand-50/50 p-3 text-center text-xs text-ink-muted">
            Cuando el lead complete el formulario de un servicio en{" "}
            <code className="text-[10px]">/servicios/[slug]</code>, el pedido
            aparece acá.
          </p>
        ) : (
          <ul className="divide-y divide-brand-50">
            {orders.map((o) => (
              <li
                key={o.id}
                className="cursor-pointer py-2.5 transition first:pt-0 last:pb-0 hover:bg-brand-50/30 -mx-2 px-2 rounded-lg"
                onClick={() => openOrder(o.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">
                      {o.serviceName}{" "}
                      <span className="font-normal text-ink-muted">— {o.variantLabel}</span>
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-muted">
                      <span className="font-mono">{o.orderNumber}</span>
                      <span>·</span>
                      <span>{formatDate(o.createdAt)}</span>
                      <span>·</span>
                      <span className="font-semibold text-ink">
                        {formatMXN(o.amountMXN)}
                      </span>
                    </div>
                  </div>
                  <Badge
                    tone={
                      ORDER_STATUS_TONE[
                        o.status as keyof typeof ORDER_STATUS_TONE
                      ]
                    }
                  >
                    {ORDER_STATUS_LABELS[o.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <OrderDetailDrawer
        orderId={orderIdForDrawer}
        open={drawerOpen}
        onClose={closeOrder}
        onUpdated={() => {
          // Refrescar la lista al cerrar el drawer de order.
          void (async () => {
            try {
              const res = await fetch(`/api/admin/leads/${leadId}/orders`);
              const data = await res.json();
              if (data.ok) setOrders(data.orders ?? []);
            } catch {
              // Silently fail.
            }
          })();
        }}
      />
    </>
  );
}
