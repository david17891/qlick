"use client";

/**
 * Página del scanner del staff (Commit B, 2026-07-03).
 *
 * Ruta: `/staff/scan/[eventId]?token=...`
 *
 * FIX 2026-07-03 v7 (sesion David): la pagina estaba en
 * `/admin/eventos/[id]/staff/scan` — ruta protegida por auth admin en
 * el middleware. El staff abre el link sin login (puede ser persona
 * externa de la institucion), asi que la pagina DEBE ser publica.
 * La movimos a `/staff/scan/[eventId]` que NO matchea el middleware
 * (solo filtra /admin, /api/admin, /dashboard, /aprender, /pagar).
 *
 * Esta pagina:
 *   1. Lee `token` del query string (validado por el endpoint redirect
 *      /api/staff/scan/[token] que redirige aca).
 *   2. Muestra input opcional de `staff_email` + `displayName`
 *      (cacheados en localStorage).
 *   3. Inicia la camara con html5-qrcode y queda esperando scans.
 *   4. Cuando decodifica un QR:
 *      - Extrae el token del path (`/check-in/[token]`).
 *      - POST a `/api/staff/check-in` con `{ token, qr_token, staff_email, staff_displayName }`.
 *      - Muestra feedback: nombre + OK o motivo del fallo.
 *   5. Lista los ultimos 5 check-ins del staff (cache local).
 *
 * **Auth:** NO requiere login. El `token` del query string es la
 * autorizacion (192 bits entropia). Defense in depth: el componente
 * re-valida contra el endpoint publico `/api/staff/scan/[token]` antes
 * de habilitar la camara.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { extractQrToken } from "@/lib/staff/qr-token";
import { errorLog } from "@/lib/log";

type Status =
  | { kind: "loading" }
  | { kind: "invalid_token"; reason: string }
  | { kind: "scanner" };

interface RecentCheckIn {
  id: string;
  name: string;
  eventTitle: string;
  at: string;
  ok: boolean;
  /**
   * TRUE si la API devolvio `alreadyCheckedIn: true` — el asistente ya
   * estaba check-in antes de este escaneo. El backend es idempotente y NO
   * re-registra, pero el staff debe saberlo visualmente para no confundir
   * un re-escaneo con un nuevo check-in.
   */
  duplicate?: boolean;
  /** ISO timestamp del check-in ORIGINAL si duplicate=true. */
  alreadyCheckedInAt?: string;
}

const STORAGE_KEY = "qlick.staff.identity";

interface StaffIdentity {
  email?: string;
  displayName?: string;
}

/**
 * FIX 2026-07-03 (sesion David "ya lo estaba registrando"): helper para
 * mostrar tiempos relativos en espanol ("hace 3m", "hace 2h") en el feedback
 * de re-escaneo y en la lista de recientes.
 */
function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const ms = nowMs - new Date(iso).getTime();
  if (ms < 0) return "ahora";
  const s = Math.floor(ms / 1000);
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const remM = m % 60;
    return remM > 0 ? `hace ${h}h ${remM}m` : `hace ${h}h`;
  }
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

function loadStaffIdentity(): StaffIdentity {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StaffIdentity) : {};
  } catch {
    return {};
  }
}

function saveStaffIdentity(identity: StaffIdentity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // localStorage disabled or full — ignore.
  }
}

export default function StaffScanPage() {
  const params = useParams<{ eventId: string }>();
  const search = useSearchParams();
  const eventIdFromUrl = params.eventId;
  const staffToken = search.get("token") ?? "";

  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [identity, setIdentity] = useState<StaffIdentity>({});
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [lastFeedback, setLastFeedback] = useState<{
    type: "ok" | "warning" | "error";
    msg: string;
    payment_pending?: {
      confirmation_id: string;
      attendee_name?: string;
      event_title?: string;
    };
  } | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Refs para el scanner de html5-qrcode.
  const scannerRef = useRef<unknown>(null);
  const scannerDivId = "qr-scanner-region";
  // FIX 2026-07-03 (sesion David, "muchas lecturas consecutivas"): html5-qrcode
  // dispara el callback onScan cada vez que DECODIFICA un QR del frame. Con
  // fps:10 puede llamar al callback 5+ veces por segundo si la cámara
  // queda fija sobre el mismo QR. Eso genera spam de POSTs al backend y
  // de errores en la UI. Throttle simple: ignorar scans del mismo token
  // dentro de la ventana SCAN_THROTTLE_MS.
  const lastScanAtRef = useRef<{ token: string; at: number } | null>(null);
  // FIX 2026-07-16 (sprint cobro-en-puerta): el MarkPaidAction
  // necesita el qr_token del último escaneo (lo pasa al endpoint
  // mark-paid para autorizar el cobro sin login). Lo guardamos en
  // un ref aparte del throttle para que sobreviva entre renders
  // sin resetearse cuando el throttle de 2.5s expira.
  const lastQrTokenRef = useRef<string | null>(null);
  const SCAN_THROTTLE_MS = 2500;

  // Validar token al montar.
  useEffect(() => {
    if (!staffToken) {
      setStatus({
        kind: "invalid_token",
        reason: "Falta el token en la URL. Abrí el link que te mandó el admin.",
      });
      return;
    }
    void validateStaffToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffToken]);

  // Cargar identidad cacheada.
  useEffect(() => {
    setIdentity(loadStaffIdentity());
  }, []);

  async function validateStaffToken(): Promise<void> {
    // El endpoint publico /api/staff/scan/[token] redirige (302) si el
    // token es valido. Lo llamamos con redirect:'manual' para inspeccionar
    // el resultado sin seguir el redirect.
    try {
      const res = await fetch(
        `/api/staff/scan/${encodeURIComponent(staffToken)}`,
        { redirect: "manual" },
      );
      if (res.status === 0 || res.type === "opaqueredirect" || res.status === 302) {
        setStatus({ kind: "scanner" });
        return;
      }
      if (res.status === 404) {
        setStatus({
          kind: "invalid_token",
          reason: "Este link no existe o ya fue removido.",
        });
        return;
      }
      if (res.status === 410) {
        setStatus({
          kind: "invalid_token",
          reason: "Este link expiró o fue revocado. Pedile al admin uno nuevo.",
        });
        return;
      }
      setStatus({
        kind: "invalid_token",
        reason: `Respuesta inesperada del servidor (${res.status}).`,
      });
    } catch (err) {
      setStatus({
        kind: "invalid_token",
        reason: `No pude validar el link: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Iniciar cámara cuando entramos al estado scanner.
  const startCamera = useCallback(async () => {
    if (cameraStarted) return;
    setCameraError(null);
    try {
      // Dynamic import: html5-qrcode solo en cliente (no SSR).
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await onScan(decodedText);
        },
        // onScanFailure: ignora (escaneo continuo).
        () => {},
      );
      setCameraStarted(true);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? err.message
          : "No pude acceder a la cámara. Probá tipear el token manualmente.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraStarted]);

  // Cleanup cámara al desmontar.
  useEffect(() => {
    return () => {
      const s = scannerRef.current as { stop?: () => Promise<void> } | null;
      if (s && typeof s.stop === "function") {
        void s.stop().catch(() => {});
      }
    };
  }, []);

  async function onScan(decoded: string): Promise<void> {
    const qrToken = extractQrToken(decoded);
    if (!qrToken) {
      setLastFeedback({ type: "error", msg: "QR no parece un pase válido." });
      return;
    }
    // Throttle: ignorar si el mismo token fue escaneado hace <SCAN_THROTTLE_MS.
    const now = Date.now();
    const last = lastScanAtRef.current;
    if (last && last.token === qrToken && now - last.at < SCAN_THROTTLE_MS) {
      return;
    }
    lastScanAtRef.current = { token: qrToken, at: now };
    lastQrTokenRef.current = qrToken;
    await submitCheckIn(qrToken);
  }

  async function submitCheckIn(qrToken: string): Promise<void> {
    setLastFeedback(null);
    const body = {
      token: staffToken,
      qr_token: qrToken,
      staff_email: identity.email,
      staff_displayName: identity.displayName,
    };
    try {
      const res = await fetch("/api/staff/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok: boolean;
        attendee?: { name: string; event_title: string };
        checkedInAt?: string;
        checkedInBy?: string;
        alreadyCheckedIn?: boolean;
        error?: string;
        crossEvent?: boolean;
        qrEventTitle?: string;
        payment_status?: string;
        requires_action?: string;
        confirmation_id?: string;
        mark_paid_endpoint?: string;
      };
      // FIX sprint 2026-07-15e: si el backend devuelve 403 con
      // requires_action='collect_payment_door', mostramos el feedback
      // con boton "Cobrar y registrar" que llama a mark-paid.
      if (
        res.status === 403 &&
        data.requires_action === "collect_payment_door" &&
        data.confirmation_id
      ) {
        const pendingMsg = data.attendee
          ? `⚠ ${data.attendee.name} — pago pendiente. Cobra en caja y registra.`
          : "⚠ Pago pendiente. Cobra en caja y registra.";
        setLastFeedback({
          type: "warning",
          msg: pendingMsg,
          // Pasamos la info al feedback para que el render muestre
          // el boton. Ver renderFeedback() abajo.
          payment_pending: {
            confirmation_id: data.confirmation_id,
            attendee_name: data.attendee?.name,
            event_title: data.attendee?.event_title,
          },
        });
        return;
      }
      if (
        res.status === 403 &&
        data.requires_action === "manual_refund_review"
      ) {
        setLastFeedback({
          type: "error",
          msg: `✗ ${data.error ?? "Pago revocado. No puede entrar."}`,
        });
        return;
      }
      if (data.ok) {
        // FIX 2026-07-03 (sesion David "ya lo estaba registrando"): el
        // backend es idempotente y devuelve `alreadyCheckedIn: true` +
        // `checkedInAt` del check-in ORIGINAL cuando el asistente ya
        // estaba registrado. Mostrarlo distinto: warning (amber) en vez
        // de ok (emerald), con el tiempo relativo desde el primer check-in.
        let feedbackType: "ok" | "warning" = "ok";
        let msg: string;
        if (data.alreadyCheckedIn) {
          feedbackType = "warning";
          const ago = data.checkedInAt
            ? formatRelativeTime(data.checkedInAt)
            : "antes";
          msg = data.attendee
            ? `⚠ ${data.attendee.name} ya estaba check-in (${ago}). Re-escaneo idempotente, no se re-registra.`
            : `⚠ Ya estaba check-in (${ago}). Re-escaneo idempotente.`;
        } else {
          msg = data.attendee
            ? `✓ ${data.attendee.name} — check-in OK`
            : "✓ Check-in OK";
        }
        setLastFeedback({ type: feedbackType, msg });
        setRecentCheckIns((prev) => [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: data.attendee?.name ?? "(sin nombre)",
            eventTitle: data.attendee?.event_title ?? "",
            at: new Date().toISOString(),
            ok: true,
            duplicate: data.alreadyCheckedIn ?? false,
            alreadyCheckedInAt: data.alreadyCheckedIn ? data.checkedInAt : undefined,
          },
          ...prev,
        ].slice(0, 5));
      } else {
        const errMsg = data.crossEvent
          ? `Este QR es del evento "${data.qrEventTitle}", no de este.`
          : data.error ?? "Error desconocido.";
        setLastFeedback({ type: "error", msg: `✗ ${errMsg}` });
        setRecentCheckIns((prev) =>
          [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: "(error)",
              eventTitle: errMsg,
              at: new Date().toISOString(),
              ok: false,
            },
            ...prev,
          ].slice(0, 5),
        );
      }
    } catch (err) {
      setLastFeedback({
        type: "error",
        msg: `✗ ${err instanceof Error ? err.message : "Error de red."}`,
      });
    }
  }

  function onManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!manualToken.trim()) return;
    void submitCheckIn(manualToken.trim());
    setManualToken("");
  }

  function onSaveIdentity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    saveStaffIdentity(identity);
    setLastFeedback({ type: "ok", msg: "✓ Identidad guardada." });
  }

// ─────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────

  if (status.kind === "loading") {
    return <CenteredMessage icon="⏳" title="Validando link…" />;
  }

  if (status.kind === "invalid_token") {
    return (
      <CenteredMessage icon="⛔" title="Link no válido" subtitle={status.reason} />
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-violet-50/40 to-white p-4">
      <div className="max-w-md mx-auto space-y-4">
        <header className="text-center pt-2">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
            Scanner de staff
          </p>
          <p className="text-[10px] text-ink-muted mt-1">
            Evento: <code className="font-mono">{eventIdFromUrl?.slice(0, 8)}…</code>
          </p>
        </header>

        {/* Identidad del staff (opcional, cacheada en localStorage) */}
        <details className="rounded-xl bg-white border border-violet-100 p-3">
          <summary className="text-xs font-bold text-violet-700 cursor-pointer">
            🪪 Identidad del operador (opcional)
          </summary>
          <form onSubmit={onSaveIdentity} className="mt-3 space-y-2">
            <div>
              <label htmlFor="staff-name" className="block text-xs text-ink-muted mb-1">
                Tu nombre
              </label>
              <input
                id="staff-name"
                type="text"
                value={identity.displayName ?? ""}
                onChange={(e) =>
                  setIdentity((i) => ({ ...i, displayName: e.target.value }))
                }
                placeholder="Ej. María (entrada principal)"
                className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label htmlFor="staff-email" className="block text-xs text-ink-muted mb-1">
                Tu email (opcional)
              </label>
              <input
                id="staff-email"
                type="email"
                value={identity.email ?? ""}
                onChange={(e) =>
                  setIdentity((i) => ({ ...i, email: e.target.value }))
                }
                placeholder="maria@institucion.com"
                className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm"
              />
            </div>
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded bg-violet-500 text-white hover:bg-violet-600"
            >
              Guardar
            </button>
            <p className="text-[10px] text-ink-muted">
              Queda en este celular. Si no tipeas nada, el sistema registra
              como "Staff externo".
            </p>
          </form>
        </details>

        {/* Cámara + botón iniciar */}
        <div className="rounded-xl bg-white border border-violet-100 p-3 space-y-2">
          <p className="text-xs font-bold text-violet-700">📷 Cámara</p>
          {!cameraStarted ? (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="w-full px-4 py-3 rounded-lg bg-violet-500 text-white font-semibold hover:bg-violet-600"
            >
              🎥 Iniciar cámara
            </button>
          ) : (
            <p className="text-xs text-emerald-700">✓ Cámara activa. Apuntá al QR.</p>
          )}
          {cameraError && (
            <p className="text-xs text-rose-700">{cameraError}</p>
          )}
          <div
            id={scannerDivId}
            className="rounded-lg overflow-hidden bg-violet-50"
            style={{ minHeight: cameraStarted ? 280 : 0 }}
          />
        </div>

        {/* Feedback del último escaneo */}
        {lastFeedback && (
          <div
            className={`rounded-xl p-3 text-sm font-semibold ${
              lastFeedback.type === "ok"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : lastFeedback.type === "warning"
                ? "bg-amber-50 border border-amber-200 text-amber-900"
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}
          >
            {lastFeedback.msg}
            {lastFeedback.payment_pending && (
              <MarkPaidAction
                confirmationId={
                  lastFeedback.payment_pending.confirmation_id
                }
                // FIX 2026-07-16 (sprint cobro-en-puerta): pasamos el
                // qr_token al endpoint para que el staff pueda cobrar
                // SIN estar logueado como admin. El backend valida
                // que el qr_token corresponde a esta confirmation.
                qrToken={lastQrTokenRef.current ?? ""}
                attendeeName={lastFeedback.payment_pending.attendee_name}
                eventTitle={lastFeedback.payment_pending.event_title}
                staffEmail={identity.email}
                onSuccess={() => {
                  setLastFeedback({
                    type: "ok",
                    msg: `✓ Pago en puerta registrado y check-in OK${
                      lastFeedback.payment_pending?.attendee_name
                        ? ` — ${lastFeedback.payment_pending.attendee_name}`
                        : ""
                    }`,
                  });
                  setRecentCheckIns((prev) =>
                    [
                      {
                        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        name: lastFeedback.payment_pending?.attendee_name ?? "(pago en puerta)",
                        eventTitle:
                          lastFeedback.payment_pending?.event_title ?? "",
                        at: new Date().toISOString(),
                        ok: true,
                      },
                      ...prev,
                    ].slice(0, 5),
                  );
                }}
              />
            )}
          </div>
        )}

        {/* FIX 2026-07-03 v8 (sesion David): registro walk-in. Una
            persona llega sin QR pass y el staff lo registra en puerta. */}
        <details className="rounded-xl bg-white border border-violet-100 p-3">
          <summary className="text-xs font-bold text-violet-700 cursor-pointer">
            🚶 Registrar walk-in (sin QR)
          </summary>
          <WalkInForm
            staffToken={staffToken}
            identity={identity}
            onSuccess={(result) => {
              setLastFeedback({
                type: "ok",
                msg: `✓ ${result.attendee.name} registrado y check-in OK`,
              });
              setRecentCheckIns((prev) =>
                [
                  {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    name: `${result.attendee.name} (walk-in)`,
                    eventTitle: result.attendee.event_title,
                    at: new Date().toISOString(),
                    ok: true,
                  },
                  ...prev,
                ].slice(0, 5),
              );
            }}
            onError={(msg) =>
              setLastFeedback({ type: "error", msg: `✗ ${msg}` })
            }
          />
        </details>

        {/* Fallback: input manual de token */}
        <details className="rounded-xl bg-white border border-violet-100 p-3">
          <summary className="text-xs font-bold text-violet-700 cursor-pointer">
            ⌨️ Tipear token manualmente (fallback)
          </summary>
          <form onSubmit={onManualSubmit} className="mt-3 space-y-2">
            <input
              type="text"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              placeholder="Pega el token del QR acá"
              className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm font-mono"
            />
            <button
              type="submit"
              disabled={!manualToken.trim()}
              className="text-xs px-3 py-1.5 rounded bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50"
            >
              Check-in manual
            </button>
            <p className="text-[10px] text-ink-muted">
              Usá esto si la cámara no anda o el QR está dañado. El token
              está en la URL del pase (`/check-in/[token]`).
            </p>
          </form>
        </details>

        {/* Lista de check-ins recientes */}
        {recentCheckIns.length > 0 && (
          <div className="rounded-xl bg-white border border-violet-100 p-3">
            <p className="text-xs font-bold text-violet-700 mb-2">
              🕒 Últimos {recentCheckIns.length} check-in(s)
            </p>
            <ul className="divide-y divide-violet-50">
              {recentCheckIns.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold truncate ${
                        r.ok
                          ? r.duplicate
                            ? "text-amber-700"
                            : "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {r.ok ? (r.duplicate ? "↻" : "✓") : "✗"} {r.name}
                      {r.duplicate && (
                        <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          re-scan
                        </span>
                      )}
                    </p>
                    {r.duplicate && r.alreadyCheckedInAt && (
                      <p className="text-xs text-amber-700/80 truncate">
                        primer check-in {formatRelativeTime(r.alreadyCheckedInAt, new Date(r.at).getTime())}
                      </p>
                    )}
                    {!r.ok && (
                      <p className="text-xs text-ink-muted truncate">{r.eventTitle}</p>
                    )}
                  </div>
                  <span className="text-xs text-ink-muted whitespace-nowrap">
                    {new Date(r.at).toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* FIX 2026-07-16 (sprint cobro-en-puerta): QR desplegable al
            final del scanner. Apunta a /pagar/evento/[slug] (link
            público de pago del evento). El staff lo muestra al
            asistente que NO quiere pagar en efectivo y prefiere
            tarjeta/OXXO/SPEI. Rehusable: el slug viene del eventId
            del URL del scanner, no hardcodeado. El QR se genera
            client-side con la lib `qrcode` (ya en package.json). */}
        <CheckoutQrBlock eventSlug={eventIdFromUrl ?? ""} />
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────
// CheckoutQrBlock — QR desplegable con el link de pago del evento.
// FIX 2026-07-16 (sprint cobro-en-puerta, sesion David "se
// muestra al asistente para que pague digital"). El staff lo
// muestra en su celular al asistente que no tiene efectivo o que
// prefiere pagar online. El QR se genera client-side (no requiere
// auth, no toca el backend).
// ─────────────────────────────────────────────────────────

function CheckoutQrBlock({ eventSlug }: { eventSlug: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined" || !eventSlug) return;
    const url = `${window.location.origin}/pagar/evento/${eventSlug}`;
    setCheckoutUrl(url);
    // Dynamic import: qrcode ESM-only, no queremos bundle pesado si
    // el scanner no se usa.
    void (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        const dataUrl = await QRCode.toDataURL(url, {
          width: 220,
          margin: 1,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        setQrDataUrl(dataUrl);
      } catch (err) {
        errorLog("[staff/scan] QR generation failed", {
          error: err instanceof Error ? err.message : String(err),
          eventSlug,
        });
      }
    })();
  }, [eventSlug]);
  if (!eventSlug) return null;
  return (
    <details className="rounded-xl bg-white border border-violet-100 p-3">
      <summary className="text-xs font-bold text-violet-700 cursor-pointer">
        💳 Cobro digital — el asistente escanea para pagar en línea
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-ink-muted">
          Si el asistente no trae efectivo (o prefiere pagar con
          tarjeta/OXXO/SPEI), mostrá este QR. Lo escanea con su
          celular y se abre la página de pago del evento.
        </p>
        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-2">
            <img
              src={qrDataUrl}
              alt="QR para pagar entrada del evento"
              className="w-44 h-44 rounded-lg border border-violet-200"
            />
            <p className="text-[10px] text-ink-muted text-center break-all max-w-full">
              {checkoutUrl}
            </p>
          </div>
        ) : (
          <p className="text-xs text-ink-muted text-center py-4">
            Generando QR…
          </p>
        )}
        <p className="text-[10px] text-ink-muted italic">
          Rehusable para cualquier evento nuevo. Funciona con gente
          que ya está registrada (entra a su confirmation por email) o
          gente sin registro (crea una nueva al pagar).
        </p>
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────
// WalkInForm — formulario inline para registrar asistente sin QR.
// POST a /api/staff/register-walk-in. Devuelve QR token + URL.
// ─────────────────────────────────────────────────────────

function WalkInForm({
  staffToken,
  identity,
  onSuccess,
  onError,
}: {
  staffToken: string;
  identity: StaffIdentity;
  onSuccess: (result: {
    attendee: { name: string; event_title: string };
    qrToken: string;
    checkInUrl: string;
    qrImageUrl: string;
  }) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    name: string;
    qrToken: string;
    checkInUrl: string;
  } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/staff/register-walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: staffToken,
          name,
          phone,
          email: email || undefined,
          staff_email: identity.email,
          staff_displayName: identity.displayName,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        attendee?: { name: string; event_title: string };
        qrToken?: string;
        checkInUrl?: string;
        qrImageUrl?: string;
        error?: string;
      };
      if (data.ok && data.attendee && data.qrToken && data.checkInUrl) {
        onSuccess({
          attendee: data.attendee,
          qrToken: data.qrToken,
          checkInUrl: data.checkInUrl,
          qrImageUrl: data.qrImageUrl ?? "",
        });
        setLastResult({
          name: data.attendee.name,
          qrToken: data.qrToken,
          checkInUrl: data.checkInUrl,
        });
        // Limpiar form para el siguiente walk-in.
        setName("");
        setPhone("");
        setEmail("");
      } else {
        onError(data.error ?? "Error desconocido.");
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setLoading(false);
    }
  }

  async function onCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copia:", text);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2">
      <div>
        <label htmlFor="walkin-name" className="block text-xs text-ink-muted mb-1">
          Nombre *
        </label>
        <input
          id="walkin-name"
          type="text"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Juan Pérez"
          className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm"
        />
      </div>
      <div>
        <label htmlFor="walkin-phone" className="block text-xs text-ink-muted mb-1">
          Teléfono * <span className="text-[10px]">(10 dígitos, MX)</span>
        </label>
        <input
          id="walkin-phone"
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="55 1234 5678"
          className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm font-mono"
        />
      </div>
      <div>
        <label htmlFor="walkin-email" className="block text-xs text-ink-muted mb-1">
          Email (opcional)
        </label>
        <input
          id="walkin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="juan@ejemplo.com"
          className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !name.trim() || !phone.trim()}
        className="w-full text-sm px-3 py-2.5 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-50"
      >
        {loading ? "Registrando..." : "✓ Registrar y check-in"}
      </button>

      {lastResult && (
        <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-800">
            ✓ {lastResult.name} registrado. Si quieres darle el QR:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white px-2 py-1 rounded border border-emerald-100 break-all font-mono">
              {lastResult.checkInUrl}
            </code>
            <button
              type="button"
              onClick={() => onCopy(lastResult.checkInUrl)}
              className="text-xs px-2 py-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 shrink-0"
            >
              Copiar
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────
// MarkPaidAction — boton inline "Cobrar y registrar" que aparece
// cuando el staff escanea un QR de un asistente con pago pendiente.
// Llama a POST /api/staff/check-in/mark-paid con el confirmation_id
// del feedback. Sprint 2026-07-15e (sesion David, "mucha gente
// pagara efectivo").
//
// FIX 2026-07-16 (sprint cobro-en-puerta): el endpoint ahora es
// público (sin requireAdmin) si se le pasa el `qr_token` del
// cuerpo. El scanner público del staff pasa el `qr_token` que
// acaba de escanear — el backend valida que corresponde a la
// confirmation. Asi el staff en puerta puede cobrar SIN estar
// logueado como admin.
// ─────────────────────────────────────────────────────────

function MarkPaidAction({
  confirmationId,
  qrToken,
  attendeeName,
  eventTitle,
  staffEmail,
  onSuccess,
}: {
  confirmationId: string;
  /**
   * Token del QR que el staff acaba de escanear. Requerido por
   * el endpoint mark-paid cuando NO hay sesión admin (path del
   * scanner público). El scanner lo pasa desde su state.
   */
  qrToken: string;
  attendeeName?: string;
  eventTitle?: string;
  /**
   * Email opcional del operador (cacheado en localStorage). Si
   * viene, queda registrado en admin_audit_log como `actor_email`.
   */
  staffEmail?: string;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<"cash" | "card_manual" | "transfer" | "other">(
    "cash",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleMarkPaid() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/check-in/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation_id: confirmationId,
          // FIX 2026-07-16: el scanner público del staff NO tiene
          // sesión admin. El endpoint valida que este qr_token
          // existe en event_qr_tokens y corresponde a la
          // confirmation. Defense in depth: el body valida que
          // ambos son del mismo event_id.
          qr_token: qrToken,
          payment_method: method,
          ...(staffEmail ? { staff_email: staffEmail } : {}),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
      };
      if (data.ok) {
        onSuccess();
      } else {
        setError(data.error ?? "Error al registrar el pago.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-normal text-amber-800">
        {attendeeName
          ? `${attendeeName} aún no ha pagado. Cobra en caja y registra el pago:`
          : "Aún no ha pagado. Cobra en caja y registra el pago:"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Método de pago"
          value={method}
          onChange={(e) => setMethod(e.target.value as typeof method)}
          disabled={loading}
          className="text-xs rounded border border-amber-300 bg-white px-2 py-1"
        >
          <option value="cash">Efectivo</option>
          <option value="card_manual">Tarjeta (datáfono)</option>
          <option value="transfer">Transferencia</option>
          <option value="other">Otro</option>
        </select>
        <button
          type="button"
          onClick={handleMarkPaid}
          disabled={loading}
          className="rounded bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Registrando..." : "💵 Cobrar y registrar"}
        </button>
      </div>
      {error && (
        <p className="text-xs font-normal text-rose-700">{error}</p>
      )}
      {eventTitle && (
        <p className="text-xs font-normal text-amber-700 opacity-70">
          {eventTitle}
        </p>
      )}
    </div>
  );
}

function CenteredMessage({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-rose-50/40 to-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-3">
        <div className="text-5xl">{icon}</div>
        <h1 className="text-xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
    </main>
  );
}