/**
 * CheckInTab — gestión de check-ins del evento (vista staff).
 *
 * Server Component que lee al render. Muestra:
 *  - 4 stat cards: QR generados, Check-ins, Pendientes, Show-up rate.
 *  - Toolbar: generar tokens QR (server action `generateQrTokensAction`)
 *    + descarga CSV.
 *  - Búsqueda de asistente + check-in manual (server action
 *    `manualCheckInAction`).
 *  - Log de check-ins recientes (últimos 20).
 *
 * El componente cliente (descarga CSV + form de búsqueda) está
 * implementado inline con un Client Component import.
 */

import { Card, Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getEventQrTokens } from "@/lib/qr/event-tokens";
import { getAttendeesByEventId, getConfirmationsByEventId } from "@/lib/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { CheckInTabClient } from "./CheckInTabClient";
import { IssueCertButton } from "./IssueCertButton";
import { StaffLinksPanel } from "./StaffLinksPanel";
import { StaffQrTokenList } from "./StaffQrTokenList";
import { listStaffLinksAction } from "../_staff-link-actions";
import { appBaseUrl } from "@/lib/utils";

interface Props {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  /** ISO. Para calcular el default validUntil del staff link (evento + 4h). */
  eventStartsAt: string;
}

interface RecentCheckInRow {
  id: string;
  attendee_name: string;
  attendee_phone_normalized: string | null;
  attendee_email: string | null;
  checked_in_at: string;
  checked_in_by: string | null;
}

async function fetchRecentCheckIns(
  eventId: string,
  limit = 20,
): Promise<RecentCheckInRow[]> {
  if (!checkSupabaseConfig().configured) return [];
  const supabase = createSupabaseAdminClient();
  // `event_qr_tokens` aún no está en el typegen; casteamos via
  // `as never` (mismo patrón que `audit-server.ts`).
  const { data, error } = await supabase
    .from("event_qr_tokens" as never)
    .select("*")
    .eq("event_id" as never, eventId)
    .not("checked_in_at" as never, "is", null)
    .order("checked_in_at" as never, { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as RecentCheckInRow[]).map((row) => ({
    id: row.id,
    attendee_name: row.attendee_name,
    attendee_phone_normalized: row.attendee_phone_normalized,
    attendee_email: row.attendee_email,
    checked_in_at: row.checked_in_at,
    checked_in_by: row.checked_in_by,
  }));
}

export async function CheckInTab({ eventId, eventTitle, eventSlug, eventStartsAt }: Props) {
  // Fetch en paralelo: tokens generados, confirmados, attendees reales
  // (check-ins manuales + QR), log reciente, y staff links (Commit B).
  const [tokensResult, confirmations, attendees, recentCheckIns, staffLinksResult] =
    await Promise.all([
      getEventQrTokens(eventId),
      getConfirmationsByEventId(eventId),
      getAttendeesByEventId(eventId),
      fetchRecentCheckIns(eventId, 20),
      listStaffLinksAction(eventId),
    ]);

  const totalQr = tokensResult.tokens.length;
  const qrCheckedIn = tokensResult.tokens.filter(
    (t) => t.checkedInAt !== null,
  ).length;
  const qrPending = totalQr - qrCheckedIn;
  // Show-up rate: confirmados que tienen attendee (cualquier fuente).
  // Si no hay QR generado todavía, caemos al rate clásico confirmados→attendees.
  const attendeesByPhone = new Set(
    attendees.map((a) => a.phoneNormalized).filter(Boolean),
  );
  const confirmedAttended = confirmations.filter(
    (c) => c.phoneNormalized && attendeesByPhone.has(c.phoneNormalized),
  ).length;
  const showUpRate =
    confirmations.length > 0
      ? Math.round((confirmedAttended / confirmations.length) * 1000) / 10
      : 0;

  // FIX 2026-07-06 (sesion David, "nadie sin nombre"): detectar attendees
  // con nombre placeholder para warning banner + certificado.
  const PLACEHOLDER_NAMES = new Set([
    "asistente",
    "por confirmar",
    "confirmar",
    "pendiente",
    "test",
    "n/a",
    "na",
    "anonimo",
    "anonymous",
    "sin nombre",
  ]);
  const isPlaceholderName = (n: string | null | undefined): boolean => {
    if (!n) return true;
    const trimmed = n.trim();
    if (trimmed.length < 2) return true;
    return PLACEHOLDER_NAMES.has(trimmed.toLowerCase());
  };
  const checkedInAttendees = attendees.filter((a) => a.checkedInAt !== null);
  const attendeesWithoutRealName = checkedInAttendees.filter((a) =>
    isPlaceholderName(a.name),
  );
  const hasNameWarning = attendeesWithoutRealName.length > 0;

  // Sprint Concept C (2026-07-08): folio por attendee para saber a quién
  // ya se le emitió cert. Si no tiene folio, mostramos "Emitir cert" como
  // form action que llama issueCertificateAction.
  const folioByAttendee = new Map<string, string>();
  if (checkedInAttendees.length > 0 && checkSupabaseConfig().configured) {
    const sb = createSupabaseAdminClient();
    const { data: certs } = await (sb as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          in: (col: string, vals: string[]) => {
            eq: (col: string, val: string) => Promise<{
              data: Array<{ folio: string; attendee_id: string }> | null;
              error: unknown;
            }>;
          };
        };
      };
    })
      .from("event_certificates")
      .select("folio, attendee_id")
      .in(
        "attendee_id",
        checkedInAttendees.map((a) => a.id),
      )
      .eq("event_id", eventId);
    for (const c of (certs ?? []) as Array<{ folio: string; attendee_id: string }>) {
      folioByAttendee.set(c.attendee_id, c.folio);
    }
  }

  return (
    <Card className="overflow-hidden mb-6">
      <div className="p-5 border-b border-brand-50">
        <h2 className="font-bold text-ink">📲 Check-in en puerta</h2>
        <p className="text-xs text-ink-muted mt-1">
          Genera los QRs para &quot;{eventTitle}&quot;, descarga el CSV
          imprimible y haz check-in manual si alguien no trae su QR.
        </p>
      </div>

      {/* FIX 2026-07-06: warning banner si hay attendees sin nombre real.
          Esto NO debería pasar post-fix (check-in route.ts copia nombre
          del QR o de leads), pero si pasa (legacy data, walk-ins sin
          lead previo), David puede identificar y editar uno por uno. */}
      {hasNameWarning && (
        <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-amber-900">
              {attendeesWithoutRealName.length} asistente
              {attendeesWithoutRealName.length === 1 ? "" : "s"} con check-in pero sin nombre real
            </p>
            <p className="text-xs text-amber-800 mt-1">
              Los certificados no se pueden emitir para estos asistentes hasta que les
              edites el nombre en el panel. Click en el nombre abajo para editarlo.
            </p>
          </div>
        </div>
      )}

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-brand-50 bg-brand-50/20">
        <StatCard label="QR generados" value={totalQr} tone="brand" />
        <StatCard
          label="Check-ins"
          value={qrCheckedIn}
          tone="emerald"
          hint={qrCheckedIn > 0 ? "vía QR" : "—"}
        />
        <StatCard label="Pendientes" value={qrPending} tone="amber" />
        <StatCard
          label="Show-up"
          value={`${showUpRate}%`}
          tone="blue"
          hint={`${confirmedAttended} / ${confirmations.length} confirmados`}
        />
      </div>

      {/* Toolbar cliente (genera QR + descarga CSV + búsqueda manual) */}
      <CheckInTabClient
        eventId={eventId}
        hasTokens={totalQr > 0}
        confirmations={confirmations.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email ?? null,
          phone: c.phoneNormalized ?? c.phoneRaw ?? null,
        }))}
      />

      {/* Commit B (2026-07-03): panel para gestionar links de scanner
          del staff. David genera links temporales que cualquier persona
          puede usar en puerta sin login. */}
      {(() => {
        const defaultValidUntilMs =
          new Date(eventStartsAt).getTime() + 4 * 60 * 60 * 1000;
        const defaultValidUntilIso = new Date(
          defaultValidUntilMs,
        ).toISOString();
        // Para datetime-local: YYYY-MM-DDTHH:mm (en local, no UTC).
        const local = new Date(defaultValidUntilMs);
        const pad = (n: number) => String(n).padStart(2, "0");
        const defaultValidUntilLocal =
          `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}` +
          `T${pad(local.getHours())}:${pad(local.getMinutes())}`;
        return (
          <div className="p-5 border-t border-brand-50 space-y-4">
            <StaffLinksPanel
              eventId={eventId}
              eventTitle={eventTitle}
              defaultValidUntilIso={defaultValidUntilIso}
              defaultValidUntilLocal={defaultValidUntilLocal}
              links={staffLinksResult.links ?? []}
            />
            {/* FIX 2026-07-03 v8: lista de QRs ya generados para que
                David pueda probar el scanner (copiar URL o token y
                pegarlo en el input manual del scanner). */}
            <StaffQrTokenList
              eventId={eventId}
              eventSlug={eventSlug}
              appBaseUrl={appBaseUrl()}
            />
          </div>
        );
      })()}

      {/* FIX 2026-07-06: lista de asistentes con check-in + botón certificado.
          David puede descargar el certificado de cada uno. El endpoint
          rechaza si el nombre es placeholder (warning arriba indica
          cuales son). */}
      {checkedInAttendees.length > 0 && (
        <div className="p-5 border-t border-brand-50">
          <h3 className="text-xs font-bold uppercase text-brand-600 mb-3">
            📜 Asistentes con check-in ({checkedInAttendees.length})
          </h3>
          <ul className="divide-y divide-brand-50">
            {checkedInAttendees.map((a) => {
              const nameIsOk = !isPlaceholderName(a.name);
              return (
                <li
                  key={a.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p
                      className={`font-semibold text-sm truncate ${
                        nameIsOk ? "text-ink" : "text-amber-700"
                      }`}
                    >
                      {a.name ?? "(sin nombre)"}
                      {!nameIsOk && (
                        <span className="ml-2 text-[10px] uppercase font-bold text-amber-700">
                          ⚠️ editar
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {a.phoneNormalized ?? a.email ?? "sin contacto"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="success">✓ Check-in</Badge>
                    {nameIsOk && (() => {
                      const folio = folioByAttendee.get(a.id);
                      if (folio) {
                        // Ya emitido: link directo a /cert/[folio].
                        return (
                          <a
                            href={`/cert/${encodeURIComponent(folio)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 transition"
                            title={`Folio ${folio}`}
                          >
                            📜 Certificado
                          </a>
                        );
                      }
                      // No emitido: Client Component que llama a la server
                      // action y muestra el folio generado al instante.
                      return (
                        <IssueCertButton
                          attendeeId={a.id}
                          eventId={eventId}
                          attendeeName={a.name ?? "este asistente"}
                        />
                      );
                    })()}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Log reciente */}
      <div className="p-5 border-t border-brand-50">
        <h3 className="text-xs font-bold uppercase text-brand-600 mb-3">
          🕒 Check-ins recientes (últimos 20)
        </h3>
        {recentCheckIns.length === 0 ? (
          <p className="text-sm text-ink-muted italic">
            Aún no hay check-ins. Cuando alguien escanee su QR, aparecerá
            acá.
          </p>
        ) : (
          <ul className="divide-y divide-brand-50">
            {recentCheckIns.map((row) => (
              <li
                key={row.id}
                className="py-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-ink truncate">
                    {row.attendee_name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {row.attendee_phone_normalized ??
                      row.attendee_email ??
                      "sin contacto"}
                    {row.checked_in_by && ` · por ${row.checked_in_by}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="success">✓ Check-in</Badge>
                  <span className="text-xs text-ink-muted">
                    {formatDate(row.checked_in_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone: "brand" | "emerald" | "amber" | "blue";
  hint?: string;
}) {
  const colorClass: Record<typeof tone, string> = {
    brand: "text-brand-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    blue: "text-blue-700",
  };
  return (
    <div className="rounded-xl bg-white border border-brand-100 p-3">
      <p className="text-[10px] uppercase text-ink-muted font-semibold">
        {label}
      </p>
      <p className={`text-xl font-bold mt-1 ${colorClass[tone]}`}>{value}</p>
      {hint && <p className="text-[10px] text-ink-muted mt-0.5">{hint}</p>}
    </div>
  );
}