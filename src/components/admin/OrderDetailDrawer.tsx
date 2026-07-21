"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Drawer,
  Tabs,
  Badge,
  Button,
  Input,
  Textarea,
  Field,
  Card,
  LucideIcon,
  Spinner,
} from "@/components/ui";
import { formatMXN, formatDateTime } from "@/lib/utils";
import {
  ORDER_STATUS_LABELS,
  ORDER_NOTE_TYPE_LABELS,
  ORDER_DOCUMENT_TYPE_LABELS,
  ORDER_PAYMENT_MODE_LABELS,
  type ServiceOrderWithRelations,
  type OrderStatus,
  type OrderNoteType,
  type OrderDocumentType,
} from "@/types/services";
import {
  CheckCircle2,
  Clock,
  MessageCircle,
  StickyNote,
  FileText,
  History,
  Phone,
  Mail,
  User,
  Calendar,
  Package,
  CreditCard,
  Link2,
  Copy,
  ExternalLink,
  Check,
} from "lucide-react";

/**
 * Drawer de detalle de pedido (Admin).
 *
 * Fetches /api/admin/orders/[id] cuando se abre.
 * Tabs internos: Info (status + acciones), Cliente (datos), Notas,
 * Documentos, Timeline (eventos).
 *
 * Acciones write van a las APIs PATCH /[id] y POST /[id]/{notes,documents}.
 */

type TabId = "info" | "cliente" | "notas" | "documentos" | "timeline";

const ORDER_STATUS_TONE: Record<OrderStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  pending_contact: "warning",
  contacted: "info",
  confirmed: "info",
  in_progress: "info",
  delivered: "success",
  closed: "neutral",
  cancelled: "danger",
};

export function OrderDetailDrawer({
  orderId,
  open,
  onClose,
  onUpdated,
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [order, setOrder] = useState<ServiceOrderWithRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("info");
  const [saving, setSaving] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Error cargando el pedido.");
        return;
      }
      setOrder(data.order as ServiceOrderWithRelations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (open && orderId) {
      setTab("info");
      void fetchOrder();
    } else if (!open) {
      setOrder(null);
      setError(null);
    }
  }, [open, orderId, fetchOrder]);

  async function patchOrder(payload: Record<string, unknown>) {
    if (!orderId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Error actualizando.");
        return;
      }
      await fetchOrder();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function addNote(body: string, noteType: OrderNoteType, isPinned: boolean) {
    if (!orderId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, noteType, isPinned }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Error guardando la nota.");
        return;
      }
      await fetchOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function addDocument(input: {
    fileName: string;
    fileUrl: string;
    fileType: OrderDocumentType;
    description?: string;
  }) {
    if (!orderId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Error guardando el documento.");
        return;
      }
      await fetchOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  // Render del body según tab
  const tabs = order
    ? [
        {
          id: "info",
          label: "Info",
          icon: <LucideIcon icon={Package} size="sm" />,
          content: (
            <InfoTab
              order={order}
              saving={saving}
              onChangeStatus={(s) => void patchOrder({ status: s })}
              onAssign={(email) => void patchOrder({ assignedTo: email })}
              onCancel={(reason) => void patchOrder({ status: "cancelled", cancellationReason: reason })}
              onPaymentLinkGenerated={() => {
                void fetchOrder();
                onUpdated?.();
              }}
            />
          ),
        },
        {
          id: "cliente",
          label: "Cliente",
          icon: <LucideIcon icon={User} size="sm" />,
          content: <ClienteTab order={order} />,
        },
        {
          id: "notas",
          label: `Notas${order.notes.length ? ` (${order.notes.length})` : ""}`,
          icon: <LucideIcon icon={StickyNote} size="sm" />,
          content: (
            <NotasTab
              order={order}
              saving={saving}
              onAdd={addNote}
            />
          ),
        },
        {
          id: "documentos",
          label: `Documentos${order.documents.length ? ` (${order.documents.length})` : ""}`,
          icon: <LucideIcon icon={FileText} size="sm" />,
          content: (
            <DocumentosTab
              order={order}
              saving={saving}
              onAdd={addDocument}
            />
          ),
        },
        {
          id: "timeline",
          label: `Timeline${order.events.length ? ` (${order.events.length})` : ""}`,
          icon: <LucideIcon icon={History} size="sm" />,
          content: <TimelineTab order={order} />,
        },
      ]
    : [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      position="right"
      title={
        order
          ? `Pedido ${order.orderNumber}`
          : loading
            ? "Cargando..."
            : "Pedido"
      }
      description={
        order
          ? `${order.service.displayName} — ${order.variant.label} · ${formatMXN(order.amountMXN)} ${order.currency}`
          : undefined
      }
    >
      {loading && !order ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="h-8 w-8 border-4" />
        </div>
      ) : error && !order ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : order ? (
        <>
          <div className="mb-4 flex items-center gap-2">
            <Badge tone={ORDER_STATUS_TONE[order.status]}>
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
            <Badge tone="neutral">
              {ORDER_PAYMENT_MODE_LABELS[order.paymentMode]}
            </Badge>
            {order.assignedTo && (
              <Badge tone="info">Asignado: {order.assignedTo}</Badge>
            )}
          </div>
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <Tabs
            tabs={tabs}
            activeTab={tab}
            onChange={(id: string) => setTab(id as TabId)}
          />
        </>
      ) : null}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-componentes de cada tab                                         */
/* ------------------------------------------------------------------ */

function InfoTab({
  order,
  saving,
  onChangeStatus,
  onAssign,
  onCancel,
  onPaymentLinkGenerated,
}: {
  order: ServiceOrderWithRelations;
  saving: boolean;
  onChangeStatus: (s: OrderStatus) => void;
  onAssign: (email: string | null) => void;
  onCancel: (reason: string) => void;
  onPaymentLinkGenerated: () => void;
}) {
  const [assignEmail, setAssignEmail] = useState(order.assignedTo ?? "");
  const [cancelReason, setCancelReason] = useState("");

  const nextStatuses: OrderStatus[] = (
    {
      pending_contact: ["contacted", "confirmed", "cancelled"],
      contacted: ["confirmed", "in_progress", "cancelled"],
      confirmed: ["in_progress", "cancelled"],
      in_progress: ["delivered", "cancelled"],
      delivered: ["closed"],
      closed: [],
      cancelled: [],
    } as Record<OrderStatus, OrderStatus[]>
  )[order.status];

  // El botón "Generar link de pago" aplica cuando:
  //   - El modo de pago es 'pending' (nadie generó un link todavía)
  //   - El status NO es terminal (delivered/closed/cancelled)
  //   - El método de pago del catálogo es stripe (o sea, la variante permite
  //     pago con tarjeta). Por ahora todos los servicios usan Stripe, pero
  //     dejamos la puerta abierta a "manual" en el futuro.
  const canGeneratePaymentLink =
    order.paymentMode === "pending" &&
    order.status !== "delivered" &&
    order.status !== "closed" &&
    order.status !== "cancelled";

  return (
    <div className="space-y-6">
      {/* Cobrar al cliente (1-click payment link) */}
      {canGeneratePaymentLink && (
        <PaymentLinkCard
          order={order}
          onGenerated={onPaymentLinkGenerated}
        />
      )}

      {/* Acciones de status */}
      <Card className="p-5">
        <h3 className="font-display text-base font-bold text-ink">
          Cambiar estado
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          Cada cambio se registra automáticamente en la timeline.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {nextStatuses.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Estado terminal — no se puede cambiar más.
            </p>
          ) : (
            nextStatuses.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === "cancelled" ? "outline" : "primary"}
                onClick={() => onChangeStatus(s)}
                disabled={saving}
              >
                → {ORDER_STATUS_LABELS[s]}
              </Button>
            ))
          )}
        </div>
      </Card>

      {/* Asignar */}
      <Card className="p-5">
        <h3 className="font-display text-base font-bold text-ink">
          Asignar a
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          Email del responsable (típicamente tú o un miembro del equipo).
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            type="email"
            value={assignEmail}
            onChange={(e) => setAssignEmail(e.target.value)}
            placeholder="email@ejemplo.com"
            disabled={saving}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={() => onAssign(assignEmail.trim() || null)}
            disabled={saving}
          >
            Guardar
          </Button>
        </div>
      </Card>

      {/* Cancelar */}
      {order.status !== "cancelled" && order.status !== "closed" && (
        <Card className="p-5 border-red-200 bg-red-50/30">
          <h3 className="font-display text-base font-bold text-red-700">
            Cancelar pedido
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            Esta acción es reversible solo manualmente desde la DB. Úsala
            cuando el cliente desiste o el pago no se concreta.
          </p>
          <Textarea
            className="mt-3"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Razón de la cancelación (ej. 'Cliente desistió por WhatsApp')"
            rows={2}
            disabled={saving}
          />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel(cancelReason.trim() || "Sin razón especificada")}
              disabled={saving || !cancelReason.trim()}
            >
              Cancelar pedido
            </Button>
          </div>
        </Card>
      )}

      {/* Metadata de creación/cierre */}
      <Card className="p-5">
        <h3 className="font-display text-base font-bold text-ink">
          Metadata
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-ink-muted">Creado</dt>
            <dd className="text-ink">{formatDateTime(order.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Última edición</dt>
            <dd className="text-ink">{formatDateTime(order.updatedAt)}</dd>
          </div>
          {order.scheduledAt && (
            <div>
              <dt className="text-xs text-ink-muted">Agendado</dt>
              <dd className="text-ink">{formatDateTime(order.scheduledAt)}</dd>
            </div>
          )}
          {order.deliveredAt && (
            <div>
              <dt className="text-xs text-ink-muted">Entregado</dt>
              <dd className="text-ink">{formatDateTime(order.deliveredAt)}</dd>
            </div>
          )}
          {order.cancelledAt && (
            <div>
              <dt className="text-xs text-ink-muted">Cancelado</dt>
              <dd className="text-ink">{formatDateTime(order.cancelledAt)}</dd>
            </div>
          )}
        </dl>
      </Card>
    </div>
  );
}

function ClienteTab({ order }: { order: ServiceOrderWithRelations }) {
  const waLink = order.customerPhone
    ? `https://wa.me/${order.customerPhone.replace(/[^\d]/g, "")}`
    : null;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <LucideIcon icon={User} size="md" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-ink">
              {order.customerName}
            </h3>
            <p className="text-xs text-ink-muted">Cliente del pedido</p>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <LucideIcon icon={Mail} size="sm" className="mt-0.5 text-ink-muted" />
          <div className="flex-1">
            <p className="text-xs text-ink-muted">Email</p>
            <a
              href={`mailto:${order.customerEmail}`}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              {order.customerEmail}
            </a>
          </div>
        </div>
        {order.customerPhone && (
          <div className="flex items-start gap-3">
            <LucideIcon
              icon={Phone}
              size="sm"
              className="mt-0.5 text-ink-muted"
            />
            <div className="flex-1">
              <p className="text-xs text-ink-muted">WhatsApp</p>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${order.customerPhone}`}
                  className="text-sm font-medium text-ink hover:underline"
                >
                  {order.customerPhone}
                </a>
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white"
                  >
                    <LucideIcon icon={MessageCircle} size="xs" />
                    Abrir chat
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        {order.scheduledAt && (
          <div className="flex items-start gap-3">
            <LucideIcon
              icon={Calendar}
              size="sm"
              className="mt-0.5 text-ink-muted"
            />
            <div className="flex-1">
              <p className="text-xs text-ink-muted">Agendado</p>
              <p className="text-sm font-medium text-ink">
                {formatDateTime(order.scheduledAt)}
              </p>
            </div>
          </div>
        )}
      </Card>

      {order.customerNotes && (
        <Card className="p-5">
          <h3 className="font-display text-base font-bold text-ink">
            Notas del cliente
          </h3>
          <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">
            {order.customerNotes}
          </p>
        </Card>
      )}

      {order.cancellationReason && (
        <Card className="p-5 border-red-200 bg-red-50/30">
          <h3 className="font-display text-base font-bold text-red-700">
            Razón de cancelación
          </h3>
          <p className="mt-3 text-sm text-ink-soft">
            {order.cancellationReason}
          </p>
        </Card>
      )}
    </div>
  );
}

function NotasTab({
  order,
  saving,
  onAdd,
}: {
  order: ServiceOrderWithRelations;
  saving: boolean;
  onAdd: (body: string, noteType: OrderNoteType, isPinned: boolean) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<OrderNoteType>("general");
  const [isPinned, setIsPinned] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await onAdd(body.trim(), noteType, isPinned);
    setBody("");
    setIsPinned(false);
    setNoteType("general");
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-display text-base font-bold text-ink">
          Nueva nota interna
        </h3>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribí lo que pasó. Ej: 'Cliente confirmó por WhatsApp, va a pagar mañana.'"
            rows={3}
            disabled={saving}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Field label="Tipo">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as OrderNoteType)}
                disabled={saving}
                className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {Object.entries(ORDER_NOTE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                disabled={saving}
                className="h-4 w-4 rounded border-brand-200 text-brand-500 focus:ring-brand-300"
              />
              Fijar
            </label>
            <Button type="submit" size="sm" disabled={saving || !body.trim()}>
              Agregar nota
            </Button>
          </div>
        </form>
      </Card>

      {order.notes.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          Aún no hay notas para este pedido.
        </p>
      ) : (
        <ul className="space-y-3">
          {order.notes.map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="whitespace-pre-line text-sm text-ink">
                    {n.body}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span>{ORDER_NOTE_TYPE_LABELS[n.noteType]}</span>
                    <span>·</span>
                    <span>{n.authorId ?? "sistema"}</span>
                    <span>·</span>
                    <span>{formatDateTime(n.createdAt)}</span>
                  </div>
                </div>
                {n.isPinned && (
                  <Badge tone="warning">Fijada</Badge>
                )}
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentosTab({
  order,
  saving,
  onAdd,
}: {
  order: ServiceOrderWithRelations;
  saving: boolean;
  onAdd: (input: {
    fileName: string;
    fileUrl: string;
    fileType: OrderDocumentType;
    description?: string;
  }) => Promise<void>;
}) {
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState<OrderDocumentType>("other");
  const [description, setDescription] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fileName.trim() || !fileUrl.trim()) return;
    await onAdd({
      fileName: fileName.trim(),
      fileUrl: fileUrl.trim(),
      fileType,
      description: description.trim() || undefined,
    });
    setFileName("");
    setFileUrl("");
    setDescription("");
    setFileType("other");
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-display text-base font-bold text-ink">
          Adjuntar documento
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          Pegá la URL del archivo (comprobante, certificado, brief, etc.). El
          archivo debe estar subido aparte (Supabase Storage, Google Drive, etc.).
        </p>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <Field label="Nombre del archivo" required>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="comprobante-pago-juan.pdf"
              disabled={saving}
            />
          </Field>
          <Field label="URL" required>
            <Input
              type="url"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://..."
              disabled={saving}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select
                value={fileType}
                onChange={(e) =>
                  setFileType(e.target.value as OrderDocumentType)
                }
                disabled={saving}
                className="w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {Object.entries(ORDER_DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descripción">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional"
                disabled={saving}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={saving || !fileName.trim() || !fileUrl.trim()}
            >
              Adjuntar
            </Button>
          </div>
        </form>
      </Card>

      {order.documents.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          Aún no hay documentos adjuntos.
        </p>
      ) : (
        <ul className="space-y-3">
          {order.documents.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {d.fileName}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <Badge tone="neutral">
                      {ORDER_DOCUMENT_TYPE_LABELS[d.fileType]}
                    </Badge>
                    {d.uploadedBy && <span>{d.uploadedBy}</span>}
                    <span>·</span>
                    <span>{formatDateTime(d.createdAt)}</span>
                  </div>
                  {d.description && (
                    <p className="mt-2 text-sm text-ink-soft">{d.description}</p>
                  )}
                </div>
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-ink-muted hover:text-ink"
                  aria-label="Abrir documento"
                >
                  <LucideIcon icon={FileText} size="sm" />
                </a>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}

function TimelineTab({ order }: { order: ServiceOrderWithRelations }) {
  if (order.events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        Aún no hay eventos en la timeline.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {order.events.map((e) => (
        <li key={e.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              {e.type === "status_change" ? (
                <LucideIcon icon={CheckCircle2} size="sm" />
              ) : e.type === "note" ? (
                <LucideIcon icon={StickyNote} size="sm" />
              ) : e.type === "document_uploaded" ? (
                <LucideIcon icon={FileText} size="sm" />
              ) : e.type === "payment_received" ? (
                <LucideIcon icon={CreditCard} size="sm" />
              ) : e.type === "email_sent" ? (
                <LucideIcon icon={Mail} size="sm" />
              ) : e.type === "whatsapp_sent" ? (
                <LucideIcon icon={MessageCircle} size="sm" />
              ) : e.type === "customer_contact" ? (
                <LucideIcon icon={User} size="sm" />
              ) : (
                <LucideIcon icon={Clock} size="sm" />
              )}
            </div>
            <div className="mt-1 h-full w-px bg-brand-100" />
          </div>
          <div className="flex-1 pb-4">
            <p className="text-sm font-semibold text-ink">
              {labelForEventType(e.type)}
            </p>
            <p className="text-xs text-ink-muted">
              {e.actorId ?? e.actorType} · {formatDateTime(e.createdAt)}
            </p>
            {Object.keys(e.payload).length > 0 && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-brand-50/50 p-2 text-xs text-ink-soft">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function labelForEventType(t: string): string {
  switch (t) {
    case "status_change":
      return "Cambio de estado";
    case "note":
      return "Nota agregada";
    case "document_uploaded":
      return "Documento adjuntado";
    case "payment_received":
      return "Pago recibido";
    case "email_sent":
      return "Email enviado";
    case "whatsapp_sent":
      return "WhatsApp enviado";
    case "customer_contact":
      return "Contacto del cliente";
    default:
      return t;
  }
}

/* ------------------------------------------------------------------ */
/* 1-click payment link (Cobrar al cliente)                          */
/* ------------------------------------------------------------------ */

/**
 * Card de "Cobrar al cliente" — genera un Stripe Checkout Session para
 * un `service_order` en estado `pending_contact` y le permite al admin:
 *   - copiar el link al portapapeles
 *   - enviarlo por WhatsApp pre-armado
 *   - abrirlo en una nueva pestaña
 *
 * Solo aparece cuando `order.paymentMode === 'pending'` (nadie generó
 * un link todavía) y el status NO es terminal. Una vez generado, el
 * estado se refresca via `onGenerated` y la card muestra la URL
 * resultante + acciones. Si el admin quiere regenerar (link viejo
 * expiró o cliente perdió el mensaje), cierra y reabre el drawer.
 *
 * Si el admin clickea "Generar" y ya había un link antes, el endpoint
 * crea uno NUEVO. El anterior queda en la timeline del order.
 */
function PaymentLinkCard({
  order,
  onGenerated,
}: {
  order: ServiceOrderWithRelations;
  onGenerated: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(
    order.paymentReference && order.paymentMode === "stripe"
      ? // Si ya teníamos un link previo (recargando el drawer), NO tenemos
        // la redirectUrl — solo el session_id. El admin debe regenerar
        // para tener la URL. Mostramos estado "pendiente de regenerar".
        null
      : null
  );
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${order.id}/payment-link`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Error generando el link.");
        return;
      }
      setPaymentLink(data.redirectUrl as string);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink() {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar. Copialo manualmente.");
    }
  }

  // WhatsApp pre-armado: si hay teléfono del cliente, le mandamos el link
  // con un mensaje corto y profesional.
  const waPhone = order.customerPhone?.replace(/[^\d]/g, "") ?? null;
  const waMessage = paymentLink
    ? encodeURIComponent(
        `Hola ${order.customerName}, te paso el link para que puedas pagar ${order.service.displayName} — ${order.variant.label} (${formatMXN(order.amountMXN)} ${order.currency}):\n\n${paymentLink}\n\nCualquier duda, me decís.`
      )
    : "";
  const waLink = waPhone ? `https://wa.me/${waPhone}?text=${waMessage}` : null;

  return (
    <Card className="p-5 border-brand-200 bg-gradient-to-br from-brand-50/60 to-white">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          <LucideIcon icon={CreditCard} size="md" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base font-bold text-ink">
            Cobrar al cliente
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            Generá un link de pago con tarjeta (Stripe) y mándaselo al
            cliente por WhatsApp. El pedido avanza a &quot;contactado&quot;
            automáticamente cuando el cliente paga.
          </p>

          {!paymentLink ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void generate()}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Spinner className="h-4 w-4 border-2" />
                    Generando...
                  </>
                ) : (
                  <>
                    <LucideIcon icon={Link2} size="sm" />
                    Generar link de pago
                  </>
                )}
              </Button>
              <span className="text-xs text-ink-muted">
                {formatMXN(order.amountMXN)} {order.currency}
              </span>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={paymentLink}
                  className="flex-1 font-mono text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyLink()}
                  aria-label="Copiar link"
                >
                  {copied ? (
                    <>
                      <LucideIcon icon={Check} size="sm" />
                      ¡Copiado!
                    </>
                  ) : (
                    <>
                      <LucideIcon icon={Copy} size="sm" />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={paymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-brand-500 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                >
                  <LucideIcon icon={ExternalLink} size="sm" />
                  Abrir link
                </a>
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                  >
                    <LucideIcon icon={MessageCircle} size="sm" />
                    Enviar por WhatsApp
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPaymentLink(null);
                    setError(null);
                  }}
                >
                  Regenerar
                </Button>
              </div>
              <p className="text-xs text-ink-muted">
                Cuando el cliente pague, este pedido avanza automáticamente
                a &quot;contactado&quot; y queda registrado en la timeline.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
