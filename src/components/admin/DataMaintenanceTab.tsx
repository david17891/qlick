"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Database, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";

interface Snapshot {
  cleanup: {
    lms: { courses: number; payments: number };
    eventTestPayments: number;
    serviceTestOrders: number;
  };
  crm: {
    leads: number;
    withoutOwner: number;
    withoutConsent: number;
    duplicateEmailRows: number;
    duplicatePhoneRows: number;
    openTasks: number;
    overdueTasks: number;
    staleLeadsWithoutOpenTask: number;
    interactions: number;
    conversations: number;
    notes: number;
    orphanHandoffs: number;
  };
}

type Scope = "lms" | "lms_payments" | "event_test_payments";

const confirmations: Record<Scope, string> = {
  lms: "ELIMINAR LMS",
  lms_payments: "ELIMINAR PAGOS LMS",
  event_test_payments: "ELIMINAR PAGOS DE PRUEBA",
};

export function DataMaintenanceTab() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<Scope | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/data-cleanup", { cache: "no-store" });
      const body = await response.json() as { ok?: boolean; error?: string } & Partial<Snapshot>;
      if (!response.ok || !body.ok || !body.cleanup || !body.crm) throw new Error(body.error ?? "No se pudo leer la auditoría.");
      setSnapshot({ cleanup: body.cleanup, crm: body.crm });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer la auditoría.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function clean(scope: Scope) {
    const confirmation = window.prompt(
      `Esta acción es destructiva y se registrará en auditoría.\n\nEscribe exactamente: ${confirmations[scope]}`,
    );
    if (confirmation !== confirmations[scope]) return;

    setWorking(scope);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/data-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, confirmation }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; deleted?: Record<string, number> };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "No se pudo completar la limpieza.");
      const total = Object.values(body.deleted ?? {}).reduce((sum, value) => sum + value, 0);
      setMessage(`Limpieza completada: ${total} registros afectados. La acción quedó auditada.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la limpieza.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) return <Card className="p-6 text-sm text-ink-muted">Leyendo auditoría de datos…</Card>;
  if (error && !snapshot) return <EmptyState icon="⚠️" title="No se pudo leer la auditoría" description={error} />;
  if (!snapshot) return null;

  const crmChecks = [
    ["Leads totales", snapshot.crm.leads, "neutral"],
    ["Sin responsable", snapshot.crm.withoutOwner, snapshot.crm.withoutOwner ? "warning" : "success"],
    ["Tareas abiertas", snapshot.crm.openTasks, "info"],
    ["Tareas vencidas", snapshot.crm.overdueTasks, snapshot.crm.overdueTasks ? "danger" : "success"],
    ["Leads estancados", snapshot.crm.staleLeadsWithoutOpenTask, snapshot.crm.staleLeadsWithoutOpenTask ? "danger" : "success"],
    ["Marketing pendiente (etiqueta interna)", snapshot.crm.withoutConsent, "warning"],
    ["Interacciones internas", snapshot.crm.interactions, snapshot.crm.interactions ? "success" : "warning"],
    ["Handoffs huérfanos", snapshot.crm.orphanHandoffs, snapshot.crm.orphanHandoffs ? "warning" : "success"],
  ] as const;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5 text-brand-600" />
              <h2 className="text-xl font-bold text-ink">Auditoría y mantenimiento</h2>
            </div>
            <p className="text-sm text-ink-muted">Controles de limpieza para datos de prueba y revisión operativa del CRM.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
          </Button>
        </div>
        {message && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </Card>

      <Card className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <Database className="h-5 w-5 text-brand-600 mt-0.5" />
          <div>
            <h3 className="font-bold text-ink">LMS y pagos de prueba</h3>
            <p className="text-sm text-ink-muted">No se toca el CRM, los eventos ni los pedidos de servicios.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <CleanupCard title="Catálogo LMS completo" detail={`${snapshot.cleanup.lms.courses} cursos · incluye dependencias`} scope="lms" working={working} onClean={clean} />
          <CleanupCard title="Pagos LMS" detail={`${snapshot.cleanup.lms.payments} registros`} scope="lms_payments" working={working} onClean={clean} />
          <CleanupCard title="Pagos de eventos identificados como prueba" detail={`${snapshot.cleanup.eventTestPayments} registros`} scope="event_test_payments" working={working} onClean={clean} />
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-ink-muted">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          La eliminación requiere escribir una frase exacta, queda registrada con el administrador y no permite borrar pagos live por referencia.
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold text-ink mb-1">Diagnóstico operativo del CRM</h3>
        <p className="text-sm text-ink-muted mb-4">El CRM tiene datos reales, pero necesita asignación, seguimiento y depuración de tareas.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {crmChecks.map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-brand-100 p-4">
              <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <strong className="text-2xl text-ink">{value}</strong>
                <Badge tone={tone}>{tone === "success" ? "OK" : tone === "danger" ? "Atención" : tone === "warning" ? "Revisar" : "Dato"}</Badge>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Button href="/admin?tab=crm" variant="outline">Revisar CRM</Button>
          <Button href="/admin/system/audit-log" variant="outline">Ver auditoría de acciones</Button>
        </div>
      </Card>
    </div>
  );
}

function CleanupCard({
  title,
  detail,
  scope,
  working,
  onClean,
}: {
  title: string;
  detail: string;
  scope: Scope;
  working: Scope | null;
  onClean: (scope: Scope) => void;
}) {
  return (
    <div className="rounded-xl border border-brand-100 p-4">
      <h4 className="font-semibold text-ink">{title}</h4>
      <p className="text-xs text-ink-muted mt-1 min-h-8">{detail}</p>
      <Button
        className="mt-3"
        size="sm"
        variant="danger"
        onClick={() => onClean(scope)}
        disabled={working !== null}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        {working === scope ? "Limpiando…" : "Eliminar"}
      </Button>
    </div>
  );
}
