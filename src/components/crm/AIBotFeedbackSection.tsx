"use client";
/**
 * AIBotFeedbackSection — Sprint v15 PR #1.
 * Componente Cliente para que el operador "eduque al agente" desde el drawer
 * del lead en CRM. Inserta una regla en ai_bot_rules vía server action.
 *
 * Se monta dentro de LeadDetailDrawer debajo del historial de chat.
 * PR #1: el form se guarda pero el bot aún no consume la regla (eso es PR #2).
 */

import { useState, useTransition } from "react";
import { Button, Card, CardBody } from "@/components/ui";
import { createBotRuleAction } from "@/lib/ai/ai-bot-rules-actions";

interface AIBotFeedbackSectionProps {
  /** Slug o id del evento activo (opcional, para reglas con scope=event:X). */
  eventScope?: string;
}

export function AIBotFeedbackSection({ eventScope }: AIBotFeedbackSectionProps) {
  const [instruction, setInstruction] = useState("");
  const [priority, setPriority] = useState(5);
  const [scope, setScope] = useState(eventScope ? `event:${eventScope}` : "global");
  const [discountPercent, setDiscountPercent] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    setError(null);
    setFeedback(null);
    const instr = instruction.trim();
    if (!instr) {
      setError("La instrucción no puede estar vacía.");
      return;
    }
    const metadata: Record<string, unknown> = {};
    const dp = Number(discountPercent);
    if (discountPercent && Number.isFinite(dp) && dp > 0) {
      if (!validUntil) {
        setError("Para autorizar un descuento debes especificar la fecha de vigencia.");
        return;
      }
      metadata.discount_percent = dp;
      metadata.valid_until = validUntil;
    }
    startTransition(async () => {
      const res = await createBotRuleAction({
        scope,
        instruction: instr,
        priority,
        is_active: true,
        expires_at: null,
        metadata,
      });
      if (!res.ok) {
        setError(res.error ?? "Error al guardar la regla.");
        return;
      }
      setFeedback("✅ Regla guardada. Se inyectará al bot en PR #2.");
      setInstruction("");
      setDiscountPercent("");
      setValidUntil("");
    });
  };

  return (
    <Card>
      <CardBody className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            🧠 Educar al Agente en este caso
          </h3>
          <p className="text-xs text-ink-muted mt-1">
            Si el bot respondió mal a este lead, agregá una regla para que no
            vuelva a pasar. Las reglas se persisten y se inyectan en el prompt
            del agente en PR #2.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-muted">Instrucción</label>
          <textarea
            className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ej: Si preguntan por precio antes de la masterclass, no confirmes números; derivá a humano."
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-ink-muted">Alcance</label>
            <select
              className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="global">global</option>
              {eventScope && <option value={`event:${eventScope}`}>event:{eventScope}</option>}
              <option value="course:default">course:default</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-muted">Prioridad (0-10)</label>
            <input
              type="number"
              min={0}
              max={10}
              className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-ink-muted">
              Descuento % (opcional)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-muted">
              Vigente hasta {discountPercent ? "(requerido)" : ""}
            </label>
            <input
              type="date"
              className="w-full mt-1 p-2 border border-brand-200 rounded-md text-sm"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              required={Boolean(discountPercent)}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
            {error}
          </p>
        )}
        {feedback && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
            {feedback}
          </p>
        )}

        <Button onClick={onSubmit} disabled={pending} size="sm">
          {pending ? "Guardando..." : "Guardar regla"}
        </Button>
      </CardBody>
    </Card>
  );
}
