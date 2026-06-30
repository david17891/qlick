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

interface Props {
  eventId: string;
  eventTitle: string;
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

export async function CheckInTab({ eventId, eventTitle }: Props) {
  // Fetch en paralelo: tokens generados, confirmados, attendees reales
  // (check-ins manuales + QR), y log reciente.
  const [tokensResult, confirmations, attendees, recentCheckIns] =
    await Promise.all([
      getEventQrTokens(eventId),
      getConfirmationsByEventId(eventId),
      getAttendeesByEventId(eventId),
      fetchRecentCheckIns(eventId, 20),
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

  return (
    <Card className="overflow-hidden mb-6">
      <div className="p-5 border-b border-brand-50">
        <h2 className="font-bold text-ink">📲 Check-in en puerta</h2>
        <p className="text-xs text-ink-muted mt-1">
          Genera los QRs para &quot;{eventTitle}&quot;, descarga el CSV
          imprimible y haz check-in manual si alguien no trae su QR.
        </p>
      </div>

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