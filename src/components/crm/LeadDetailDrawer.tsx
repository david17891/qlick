"use client";

import { useEffect, useState } from "react";
import type { Lead, LeadStatus, SalesOwner } from "@/types";
import { Card, Badge, Button } from "@/components/ui";
import {
  leadStatusLabel,
  statusTone,
  leadSourceLabel,
  leadIntentLabel,
  intentTone,
  calculateLeadResponseRisk,
  riskTone,
  riskLabel
} from "@/lib/crm/lead-utils";
import { getLeadInteractions, getLeadNotes } from "@/lib/crm/crm-service";
import {
  getLeadConversation,
  changeLeadStatus
} from "@/lib/crm/crm-service";
import { getAppointmentsForLead } from "@/lib/crm/appointments";
import { getAISuggestionsForLead, getAgentReplyTemplate } from "@/lib/crm/agent-utils";
import { getWhatsAppConfigStatus } from "@/lib/contact/whatsapp";
import { formatDate, formatMXN } from "@/lib/utils";
import { WhatsAppButton } from "@/components/contact/WhatsAppButton";

/**
 * Drawer (panel lateral) con el detalle completo de un lead.
 *
 * Muestra datos, historial, conversación, sugerencias IA y citas.
 * Las acciones que cambian estado son DEMO (no persisten): muestran etiqueta.
 * Los botones de WhatsApp usan WhatsAppButton (wa.me si hay número configurado,
 * "próximamente" si no).
 */
export function LeadDetailDrawer({
  lead,
  owners,
  onClose
}: {
  lead: Lead;
  owners: SalesOwner[];
  onClose: () => void;
}) {
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // Cerrar con tecla Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const risk = calculateLeadResponseRisk(lead);
  const interactions = getLeadInteractions(lead.id);
  const notes = getLeadNotes(lead.id);
  const conversation = getLeadConversation(lead.id);
  const suggestions = getAISuggestionsForLead(lead.id);
  const appts = getAppointmentsForLead(lead.id);
  const owner = owners.find((o) => o.id === lead.ownerId);
  const waConfigured = getWhatsAppConfigStatus().anyConfigured;

  function handleStatusChange(next: LeadStatus, label: string) {
    const res = changeLeadStatus(lead.id, next);
    setStatusNote(`${label}: ${res.note}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer */}
      <aside
        className="relative h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
        role="dialog"
        aria-label={`Detalle de ${lead.name}`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-brand-100 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge tone={statusTone[lead.status]}>{leadStatusLabel[lead.status]}</Badge>
              <Badge tone={riskTone[risk.level]} title={risk.reasons.join(", ")}>
                Riesgo {riskLabel[risk.level].toLowerCase()}
              </Badge>
              <Badge tone="warning">demo</Badge>
            </div>
            <h2 className="text-xl font-bold text-ink truncate">{lead.name}</h2>
            <p className="text-sm text-ink-muted truncate">
              {lead.courseOfInterest ?? "Sin curso de interés"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 h-9 w-9 rounded-full hover:bg-brand-50 text-ink-muted text-xl flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Datos */}
          <section className="grid sm:grid-cols-2 gap-3 text-sm">
            <Info label="Email" value={lead.email} />
            <Info label="Teléfono" value={lead.phone ?? "—"} />
            <Info label="Fuente" value={leadSourceLabel[lead.source]} />
            <Info label="Intención" value={leadIntentLabel[lead.intent]} />
            <Info
              label="Responsable"
              value={owner ? `${owner.name}` : "Sin asignar"}
            />
            <Info
              label="Próximo seguimiento"
              value={lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt) : "—"}
            />
            {lead.estimatedValueMXN !== undefined && lead.estimatedValueMXN > 0 && (
              <Info label="Valor estimado" value={formatMXN(lead.estimatedValueMXN)} />
            )}
            <Info
              label="Consentimiento"
              value={lead.consentToContact ? "Sí" : "No"}
            />
          </section>

          {lead.summary && (
            <p className="text-sm text-ink-soft bg-brand-50/50 rounded-xl p-3">
              {lead.summary}
            </p>
          )}

          {/* Riesgo detallado */}
          <Card className="p-4">
            <h3 className="text-sm font-bold text-ink mb-2">Riesgo de respuesta</h3>
            <ul className="space-y-1 text-xs text-ink-muted">
              {risk.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </Card>

          {/* Acciones WhatsApp */}
          <section>
            <h3 className="text-sm font-bold uppercase text-brand-600 mb-2">
              Acciones de WhatsApp
            </h3>
            <div className="flex flex-wrap gap-2">
              <WhatsAppButton intent="course_interest" name={lead.name} courseTitle={lead.courseOfInterest} customMessage={getAgentReplyTemplate(lead.intent, lead)} size="sm" variant="accent" label="Información" />
              <WhatsAppButton intent="enroll" name={lead.name} courseTitle={lead.courseOfInterest} size="sm" variant="accent" label="Inscripción" />
              <WhatsAppButton intent="payment_reminder" name={lead.name} courseTitle={lead.courseOfInterest} size="sm" variant="accent" label="Pago pendiente" />
              <WhatsAppButton intent="follow_up" name={lead.name} courseTitle={lead.courseOfInterest} size="sm" variant="accent" label="Seguimiento" />
              <WhatsAppButton intent="group" size="sm" variant="accent" label="Grupo" />
              <WhatsAppButton intent="support" size="sm" variant="accent" label="Soporte" />
            </div>
            {!waConfigured && (
              <p className="mt-2 text-xs text-ink-muted">
                Configura NEXT_PUBLIC_WHATSAPP_SALES_NUMBER para habilitar los botones.
              </p>
            )}
          </section>

          {/* Acciones de estado (demo) */}
          <section>
            <h3 className="text-sm font-bold uppercase text-brand-600 mb-2">
              Cambiar etapa (demo)
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("contacted", "Marcar contactado")}>
                Contactado
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("payment_pending", "Pago pendiente")}>
                Pago pendiente
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("enrolled", "Inscrito")}>
                Inscrito
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleStatusChange("lost", "Perdido")}>
                Perdido
              </Button>
            </div>
            {statusNote && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                {statusNote}
              </p>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              Acción demo: el cambio no se persiste. En producción se guarda y dispara notificaciones.
            </p>
          </section>

          {/* Historial */}
          <Section title="Historial de interacciones">
            {interactions.length === 0 ? (
              <Empty text="Sin interacciones registradas." />
            ) : (
              <ul className="space-y-3">
                {interactions.map((it) => (
                  <li key={it.id} className="text-sm">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge tone={it.direction === "inbound" ? "info" : "brand"}>
                        {it.direction === "inbound" ? "Entrante" : "Saliente"}
                      </Badge>
                      <span className="text-xs text-ink-muted">
                        {channelLabel(it.channel)} · {formatDate(it.at)}
                      </span>
                    </div>
                    <p className="text-ink-soft">{it.content}</p>
                    {it.author && (
                      <p className="text-xs text-ink-muted">— {it.author}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Notas */}
          <Section title="Notas internas">
            {notes.length === 0 ? (
              <Empty text="Sin notas." />
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="text-sm bg-brand-50/40 rounded-lg p-3">
                    <p className="text-ink-soft">{n.body}</p>
                    <p className="text-xs text-ink-muted mt-1">
                      {n.author} · {formatDate(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Conversación */}
          <Section title="Conversación (WhatsApp · demo)">
            {!conversation ? (
              <Empty text="Sin conversación registrada." />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Badge tone={conversation.status === "escalated" ? "danger" : "info"}>
                    {conversation.status}
                  </Badge>
                  {conversation.summary && (
                    <span className="text-xs text-ink-muted">{conversation.summary}</span>
                  )}
                </div>
                {conversation.messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm " +
                      (m.direction === "inbound"
                        ? "bg-brand-50 text-ink-soft"
                        : "bg-brand-500 text-white ml-auto")
                    }
                  >
                    {m.aiSuggested && (
                      <span className="block text-[10px] uppercase opacity-80 mb-0.5">
                        Sugerencia IA (demo)
                      </span>
                    )}
                    {m.body}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Sugerencias IA */}
          <Section title="Sugerencias del agente IA (demo)">
            {suggestions.length === 0 ? (
              <Empty text="Sin sugerencias." />
            ) : (
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s.id} className="text-sm border border-brand-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone="brand">{s.type.replace(/_/g, " ")}</Badge>
                      {s.needsReview && <Badge tone="warning">requiere revisión</Badge>}
                      <span className="text-xs text-ink-muted">
                        confianza {Math.round(s.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-ink-soft">{s.content}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              Agente IA demo, sin conexión a API. Las sugerencias son mock y siempre pasan por revisión humana.
            </p>
          </Section>

          {/* Citas */}
          <Section title="Citas relacionadas">
            {appts.length === 0 ? (
              <Empty text="Sin citas." />
            ) : (
              <ul className="space-y-2">
                {appts.map((a) => (
                  <li key={a.id} className="text-sm flex justify-between gap-2">
                    <span className="text-ink-soft">{a.title}</span>
                    <span className="text-xs text-ink-muted">{formatDate(a.startsAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </aside>
    </div>
  );
}

/* ----------------------- Helpers de presentación ----------------------- */

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
      <p className="text-ink">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-bold uppercase text-brand-600 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-ink-muted italic">{text}</p>;
}

function channelLabel(channel: string): string {
  const map: Record<string, string> = {
    whatsapp: "WhatsApp",
    email: "Email",
    call: "Llamada",
    form: "Formulario",
    internal_note: "Nota interna",
    ai_suggestion: "IA",
    system: "Sistema"
  };
  return map[channel] ?? channel;
}
