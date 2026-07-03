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
}

const STORAGE_KEY = "qlick.staff.identity";

interface StaffIdentity {
  email?: string;
  displayName?: string;
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
    type: "ok" | "error";
    msg: string;
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
        error?: string;
        crossEvent?: boolean;
        qrEventTitle?: string;
      };
      if (data.ok) {
        const msg = data.attendee
          ? `✓ ${data.attendee.name} — check-in OK`
          : "✓ Check-in OK";
        setLastFeedback({ type: "ok", msg });
        setRecentCheckIns((prev) => [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: data.attendee?.name ?? "(sin nombre)",
            eventTitle: data.attendee?.event_title ?? "",
            at: new Date().toISOString(),
            ok: true,
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
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}
          >
            {lastFeedback.msg}
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
                      className={`text-sm font-semibold truncate ${r.ok ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {r.ok ? "✓" : "✗"} {r.name}
                    </p>
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
      </div>
    </main>
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
            ✓ {lastResult.name} registrado. Si querés darle el QR:
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