"use client";

/**
 * StaffQrTokenList — lista visual de los QRs generados para el evento.
 *
 * FIX 2026-07-03 v8 (sesion David): David no sabia donde estan los QRs
 * para probar el scanner. Este componente lista los tokens generados
 * con su URL publica y el QR visual, para que pueda:
 *   - Copiar la URL del check-in y pegarla en el scanner (input manual)
 *   - Mostrar el QR en otra pantalla y escanearlo con el scanner
 *
 * El QR se sirve desde `/api/event-qr/[token].png` (endpoint publico).
 * El listado esta limitado a los ultimos 10 tokens activos (no
 * expirados, no revocados) para no saturar la UI.
 */

import { useState, useEffect } from "react";
import { ResendQrPassButton } from "./ResendQrPassButton";

interface TokenInfo {
  token: string;
  attendeeName: string;
  attendeePhone: string | null;
  attendeeEmail: string | null;
  checkedInAt: string | null;
}

interface Props {
  eventId: string;
  eventSlug: string;
  /** URL base para construir links absolutos (pasada desde server). */
  appBaseUrl: string;
}

export function StaffQrTokenList({ eventId, appBaseUrl }: Props) {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Usamos el endpoint publico (sin auth) que ya existe para listar
      // tokens QR — no hay uno especifico, asi que hacemos query directa.
      // Como el client component no tiene service role, hacemos un fetch
      // a un endpoint server-side. Lo creamos inline si no existe.
      const res = await fetch(`/api/admin/staff/tokens?eventId=${eventId}`);
      const data = (await res.json()) as {
        ok: boolean;
        tokens?: TokenInfo[];
        error?: string;
      };
      if (data.ok && data.tokens) {
        setTokens(data.tokens);
      } else {
        setError(data.error ?? "Error al cargar tokens.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function onCopy(text: string, token: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copia:", text);
    }
  }

  const baseUrl = appBaseUrl.replace(/\/$/, "");

  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase text-brand-600">
          🎟️ QRs generados (para probar el scanner)
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-xs px-2 py-1 rounded bg-brand-100 text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        >
          {loading ? "..." : "↻ Refrescar"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-700">✗ {error}</p>
      )}

      {!loading && tokens.length === 0 && !error && (
        <p className="text-xs text-ink-muted italic">
          No hay QRs generados todavía. Los QRs se crean cuando un asistente
          se inscribe al evento (vía WhatsApp bot, import Excel, o registro
          walk-in desde el scanner).
        </p>
      )}

      {tokens.length > 0 && (
        <ul className="divide-y divide-brand-50 max-h-96 overflow-y-auto">
          {tokens.slice(0, 10).map((t) => {
            const checkInUrl = `${baseUrl}/check-in/${encodeURIComponent(t.token)}`;
            const qrImageUrl = `${baseUrl}/api/event-qr/${encodeURIComponent(t.token)}.png`;
            return (
              <li key={t.token} className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">
                      {t.attendeeName}
                    </p>
                    <p className="text-[10px] text-ink-muted truncate">
                      {t.attendeePhone ?? t.attendeeEmail ?? "sin contacto"}
                      {t.checkedInAt && (
                        <span className="ml-1">· ✓ ya check-in</span>
                      )}
                    </p>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrImageUrl}
                    alt={`QR de ${t.attendeeName}`}
                    width={48}
                    height={48}
                    className="rounded border border-brand-100 bg-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] bg-brand-50 px-2 py-1 rounded border border-brand-100 break-all font-mono">
                    {checkInUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => onCopy(checkInUrl, t.token)}
                    className="text-xs px-2 py-1 rounded bg-brand-500 text-white hover:bg-brand-600 shrink-0"
                  >
                    {copied === t.token ? "¡Copiado!" : "Copiar URL"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopy(t.token, `t-${t.token}`)}
                    className="text-xs px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 shrink-0"
                    title="Copia solo el token (sin URL) — pegalo directo en el input manual del scanner"
                  >
                    {copied === `t-${t.token}` ? "¡Copiado!" : "Solo token"}
                  </button>
                  {/* FIX 2026-07-07: botón de reenvío de email para que David
                      pueda re-mandar el QR pass con la plantilla oficial
                      (sender noreply@qlick.digital + branding completo). */}
                  <ResendQrPassButton
                    eventId={eventId}
                    attendeeEmail={t.attendeeEmail}
                    attendeePhone={t.attendeePhone}
                    attendeeName={t.attendeeName}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}