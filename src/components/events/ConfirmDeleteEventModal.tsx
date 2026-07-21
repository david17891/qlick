"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { LucideIcon } from "@/components/ui/Icon";
import { AlertTriangle } from "lucide-react";

/**
 * Modal de confirmación simple para borrado de evento (hard delete,
 * irreversible).
 *
 * FIX 2026-07-21 (FASE 7C plan estético): refactorizado al primitivo
 * <Modal> de `src/components/ui/Modal.tsx`. Antes era un overlay + dialog
 * custom con z-[60]/z-[70] hardcoded. Ahora usa la animación scale-in y
 * el comportamiento consistente con los otros modals del sitio.
 *
 * Usado por:
 * - `EventDrawer` (modo editar, al fondo del footer)
 * - `AdminEventosClient` (botón directo en cada card del listado)
 *
 * Comportamiento:
 * - Escape para cancelar (manejado por Modal primitivo, solo si no pending).
 * - Backdrop clickeable para cancelar.
 * - Botón "Sí, eliminar" disabled mientras `pending=true`.
 */
export function ConfirmDeleteEventModal({
  eventTitle,
  onCancel,
  onConfirm,
  pending,
}: {
  eventTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const [open] = useState(true);

  const trimmedTitle = eventTitle.trim() || "(sin título)";

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="md"
      persistent={pending}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Eliminando…" : "Sí, eliminar"}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
          <LucideIcon icon={AlertTriangle} size="md" tone="inherit" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-red-700 mb-2">
            ¿Eliminar este evento?
          </h3>
          <p className="text-sm text-ink-soft mb-1">
            Evento:{" "}
            <span className="font-semibold text-ink">{trimmedTitle}</span>
          </p>
          <p className="text-sm text-ink-soft mb-3">
            Esta acción{" "}
            <strong className="text-red-700">NO se puede deshacer</strong>. Se
            eliminan también los confirmados, asistentes, encuestas y links
            asociados (cascade en DB).
          </p>
          <p className="text-xs text-ink-muted italic">
            Si solo quieres ocultarlo temporalmente, usa{" "}
            <strong>Archivar</strong> en su lugar.
          </p>
        </div>
      </div>
    </Modal>
  );
}
