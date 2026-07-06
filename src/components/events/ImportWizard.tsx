"use client";

import { useState } from "react";
import { Card, Button, Badge, EmptyState } from "@/components/ui";
import {
  runEventImport,
  type ImportInput,
  type ImportSummaryClient,
} from "@/lib/crm/ops-client";

/**
 * Wizard de import de Excel para un evento.
 *
 * Flujo (single-page, sin navegación entre rutas):
 * 1. Subís el .xlsx + elegís el tipo (confirmation/attendee/survey) +
 *    marcás/desmarcás "Dry-run".
 * 2. Click "Parsear" o "Importar".
 * 3. Mostramos el summary: inserted / duplicates / invalid / warnings.
 *
 * El parseo del Excel (headers, mapeo, normalización de filas) lo hace
 * el server lib `runEventImport`. El cliente solo manda el archivo.
 *
 * El server ya devuelve warnings de data quality (rows con email inválido,
 * phone no normalizable, consent sin parsear, etc.). Los mostramos
 * inline para que el admin sepa qué se saltó.
 */
export function ImportWizard({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<ImportInput["type"]>("confirmation");
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummaryClient | null>(null);

  async function handleRun() {
    if (!file) {
      setError("Subí un archivo .xlsx primero.");
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const s = await runEventImport(eventId, { file, type, dryRun });
      setSummary(s);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error importando el Excel.",
      );
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setSummary(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <FormatSpecPanel activeType={type} />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Columna 1: Form */}
        <Card className="p-6">
          <h2 className="font-bold text-ink mb-4">1. Elegí el archivo y tipo</h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="xlsx"
                className="block text-sm font-semibold text-ink mb-1.5"
              >
                Archivo Excel (.xlsx)
              </label>
              <input
                id="xlsx"
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={busy}
                className="block w-full text-sm text-ink file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-brand-500 file:text-white file:font-semibold hover:file:bg-brand-600 file:cursor-pointer"
              />
              {file && (
                <p className="mt-2 text-xs text-ink-muted">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="type"
                className="block text-sm font-semibold text-ink mb-1.5"
              >
                Tipo de import
              </label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as ImportInput["type"])}
                disabled={busy}
                className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              >
                <option value="confirmation">Confirmaciones (RSVPs)</option>
                <option value="attendee">Asistentes (check-ins)</option>
                <option value="survey">Encuestas post-evento</option>
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Cada tipo usa un set diferente de columnas y reglas de dedup.
              </p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={busy}
                className="mt-1"
              />
              <div>
                <span className="text-sm font-semibold text-ink">Dry-run</span>
                <p className="text-xs text-ink-muted">
                  Simula el import sin tocar la base de datos. Útil para
                  validar headers y ver cuántas filas se insertarían.
                </p>
              </div>
            </label>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleRun} disabled={busy || !file}>
                {busy
                  ? dryRun
                    ? "Parseando…"
                    : "Importando…"
                  : dryRun
                    ? "Parsear (dry-run)"
                    : "Importar de verdad"}
              </Button>
              {summary && (
                <Button variant="outline" onClick={reset} disabled={busy}>
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Columna 2: Resultado */}
        <Card className="p-6">
          <h2 className="font-bold text-ink mb-4">2. Resultado</h2>

          {!summary ? (
            <EmptyState
              title="Sin resultado todavía"
              description="Subí un archivo y corré el import para ver el reporte acá."
            />
          ) : (
            <SummaryReport summary={summary} eventTitle={eventTitle} />
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Renderiza el prompt copy-paste ready con un botón "Copiar" para que
 * el admin lo mande directo a ChatGPT/Gemini. Texto preserva saltos de
 * línea para que se vea bien al pegarlo en el chat.
 */
function PromptBlock({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select + copy manual no es necesario si la API falla —
      // el admin puede seleccionar el texto manualmente.
    }
  }

  return (
    <div className="mt-2 relative">
      <pre className="text-[10px] leading-snug font-mono whitespace-pre-wrap break-words bg-white border border-brand-100 rounded-lg p-2 pr-14 max-h-48 overflow-y-auto text-ink-soft">
        {prompt}
      </pre>
      <button
        type="button"
        onClick={copyToClipboard}
        className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-brand-500 text-white hover:bg-brand-600 transition"
      >
        {copied ? "✓ Copiado" : "Copiar"}
      </button>
    </div>
  );
}

/**
 * Panel con la spec del formato esperado por tipo. Resalta el activo
 * para que el admin sepa qué columnas necesita antes de subir.
 */
function FormatSpecPanel({
  activeType,
}: {
  activeType: "confirmation" | "attendee" | "survey";
}) {
  const specs = {
    confirmation: {
      title: "Confirmaciones (RSVPs)",
      emoji: "✉️",
      columns: [
        { name: "Nombre", required: true, hint: "2+ palabras, sin números" },
        { name: "Email", required: false, hint: "Requerido si no hay teléfono" },
        { name: "Teléfono", required: false, hint: "10 dígitos MX (se prefija +52)" },
        { name: "Fuente", required: false, hint: "messenger/whatsapp/form/manual" },
      ],
      note: "Sin email ni phone → fila rechazada.",
      prompt: `Tengo este Excel de confirmaciones/RSVPs del evento "X" de Qlick Marketing. Necesito que lo limpies a la spec de Qlick antes de subirlo al wizard.

**Columnas exactas** (en español, header en una sola fila, datos desde fila 2):
- Nombre
- Email
- Teléfono
- Fuente

**Reglas de limpieza:**
- Emails en lowercase, sin espacios al inicio/fin
- Teléfonos en 10 dígitos sin espacios ni guiones (ej: 6861234567). Si el Excel tiene "+52 686 123 4567" → "6861234567"
- Nombres con capitalización correcta: cada palabra empieza con mayúscula
- Eliminá filas completamente vacías
- Si una fila no tiene Email NI Teléfono → marcala con "#" al inicio del nombre para descartarla
- "Fuente" es texto libre (messenger, whatsapp, form, manual, etc.)

**Lo que NO debes hacer:**
- NO inventes teléfonos ni emails faltantes (es PII inventada — ilegal)
- NO corrijas lo que no estés seguro (mejor dejar y que yo revise)

Devolveme el Excel limpio en la misma estructura de columnas.`,
    },
    attendee: {
      title: "Asistentes (check-ins)",
      emoji: "✅",
      columns: [
        { name: "Nombre", required: false, hint: "Opcional si hay email o phone" },
        { name: "Email", required: false, hint: "" },
        { name: "Teléfono", required: false, hint: "" },
        { name: "Asistió", required: false, hint: "Sí/No/✓/✗" },
        { name: "Fuente", required: false, hint: "check_in/zoom/manual" },
      ],
      note: "Al menos uno de (Nombre, Email, Phone). Walk-ins válidos sin nombre.",
      prompt: `Tengo este Excel de lista de asistencia/check-in del evento "X" de Qlick Marketing. Necesito que lo limpies a la spec de Qlick.

**Columnas exactas** (en español, header en una sola fila, datos desde fila 2):
- Nombre
- Email
- Teléfono
- Asistió (Sí/No/✓/✗)
- Fuente

**Reglas:**
- Emails en lowercase
- Teléfonos en 10 dígitos sin espacios (ej: 6861234567)
- Asistió: solo Sí/No. Si tienes duda (ej: "tal vez", "no sé"), deja la celda vacía. NO asumas.
- Fuente: check_in, zoom, manual, etc. (texto libre)
- Walk-ins (gente que vino sin confirmar antes): son válidos sin Nombre si tienen Email o Teléfono

**Lo que NO debes hacer:**
- NO inventes teléfonos ni emails
- NO asumas Asistió si el Excel no lo dice explícito

Devolveme el Excel limpio.`,
    },
    survey: {
      title: "Encuestas post-evento",
      emoji: "📝",
      columns: [
        { name: "Nombre", required: false, hint: "" },
        { name: "Email", required: false, hint: "Requerido si no hay teléfono" },
        { name: "Teléfono", required: false, hint: "" },
        { name: "Consent", required: true, hint: "Sí/No — determina promoción a lead" },
        { name: "Interés", required: false, hint: "Texto libre" },
      ],
      note: "Sin email/phone o sin consent parseable → fila rechazada.",
      prompt: `Tengo este Excel de encuestas post-evento de Qlick Marketing. Necesito que lo limpies para importar al CRM.

**Columnas exactas** (en español, header en una sola fila, datos desde fila 2):
- Nombre
- Email
- Teléfono
- Consent
- Interés

**Reglas CRÍTICAS (consent es lo más delicado):**
- **Consent** solo acepta: Sí, No, ✓, ✗. Si el Excel tiene "sí plis", "ok", "tal vez", "supongo" → marcalo con "#CONSENT-AMBIGUOUS" al inicio del nombre para que yo lo revise manualmente. NUNCA asumas consentimiento.
- **Interés** es texto libre (ej: "info de curso", "precio"). Si el Excel tiene respuestas largas, dejalas tal cual.
- Email lowercase, teléfono 10 dígitos sin espacios
- Si una fila no tiene Email NI Teléfono → "#" al inicio del nombre

**Lo que NO debes hacer:**
- NUNCA conviertas variantes a "Sí" — es consentimiento falsificado (ilegal)
- NO inventes teléfonos ni emails

Devolveme el Excel limpio.`,
    },
  } as const;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="font-bold text-ink">Formato esperado</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            El wizard NO usa AI — solo transformaciones deterministas. Si tu
            Excel viene sucio, pasalo primero por ChatGPT/Gemini con el prompt
            de <code className="bg-brand-50 px-1 rounded">docs/IMPORT_FORMAT.md</code>.
          </p>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {(Object.keys(specs) as Array<keyof typeof specs>).map((k) => {
          const spec = specs[k];
          const isActive = k === activeType;
          return (
            <div
              key={k}
              className={
                "rounded-xl border p-4 transition " +
                (isActive
                  ? "border-brand-400 bg-brand-50/50 ring-2 ring-brand-200"
                  : "border-brand-100 bg-white")
              }
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-ink text-sm">
                  {spec.emoji} {spec.title}
                </p>
                {isActive && (
                  <span className="text-[10px] uppercase tracking-wide font-bold text-brand-700">
                    activo
                  </span>
                )}
              </div>
              <ul className="text-xs space-y-1 mb-2">
                {spec.columns.map((c) => (
                  <li key={c.name} className="flex items-start gap-1">
                    <span
                      className={
                        c.required
                          ? "text-red-600 font-bold"
                          : "text-ink-muted"
                      }
                    >
                      {c.required ? "•" : "○"}
                    </span>
                    <span>
                      <span className="font-mono text-ink">{c.name}</span>
                      {c.hint && (
                        <span className="text-ink-muted"> · {c.hint}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ink-muted italic mt-2 pt-2 border-t border-brand-100">
                {spec.note}
              </p>
              <details className="mt-2 pt-2 border-t border-brand-100">
                <summary className="text-[11px] font-semibold text-brand-700 cursor-pointer select-none">
                  📋 Prompt para ChatGPT/Gemini
                </summary>
                <PromptBlock prompt={spec.prompt} />
              </details>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-ink-muted mt-3">
        <strong>Transformaciones automáticas (deterministas):</strong>{" "}
        capitalize nombre (cada palabra), lowercase email, phone strip no-dígitos
        y prefija +52 si hay 10 dígitos.
      </p>
    </Card>
  );
}

function SummaryReport({
  summary,
  eventTitle,
}: {
  summary: ImportSummaryClient;
  eventTitle: string;
}) {
  const isDryRun = summary.batchId === "dryrun";
  const isError =
    summary.batchId === "invalid" ||
    summary.batchId === "parse_error" ||
    summary.batchId === "demo";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-ink-muted">Evento</p>
          <p className="font-semibold text-ink">{eventTitle}</p>
        </div>
        {isDryRun ? (
          <Badge tone="warning">Dry-run</Badge>
        ) : isError ? (
          <Badge tone="danger">Error</Badge>
        ) : (
          <Badge tone="success">OK</Badge>
        )}
      </div>

      {/* Conteos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Filas" value={summary.totalRows} />
        <Stat label="Insertados" value={summary.inserted} tone="success" />
        <Stat
          label="Duplicados"
          value={summary.skippedDuplicates}
          tone="warning"
        />
        <Stat
          label="Inválidos"
          value={summary.skippedInvalid}
          tone="danger"
        />
      </div>

      {/* Batch + tiempo */}
      {!isError && (
        <p className="text-xs text-ink-muted">
          batch: <code className="bg-brand-50 px-1 rounded">{summary.batchId}</code>{" "}
          · {summary.durationMs} ms
        </p>
      )}

      {/* Warnings */}
      {summary.warnings.length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-ink mb-2">
            Advertencias ({summary.warnings.length})
          </p>
          <ul className="text-xs space-y-1 max-h-64 overflow-y-auto border border-brand-100 rounded-xl p-3 bg-brand-50/30">
            {summary.warnings.slice(0, 50).map((w, i) => (
              <li key={i} className="text-ink-soft">
                <span className="font-mono text-ink-muted">
                  fila {w.row} · {w.field}:
                </span>{" "}
                {w.note}
              </li>
            ))}
            {summary.warnings.length > 50 && (
              <li className="text-ink-muted italic pt-1">
                … y {summary.warnings.length - 50} más
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Sin advertencias.</p>
      )}

      {/* CTA si fue dry-run */}
      {isDryRun && summary.inserted + summary.skippedInvalid > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Dry-run completado. Si los datos se ven bien, desmarcá "Dry-run" y
          corré de nuevo para impactar la base de datos.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const color: Record<string, string> = {
    neutral: "bg-brand-50/60 text-ink",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
  };
  return (
    <div className={`rounded-lg px-2 py-2 text-center ${color[tone]}`}>
      <p className="text-[10px] uppercase opacity-70">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}