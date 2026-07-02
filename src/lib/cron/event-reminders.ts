/**
 * Lógica de elegibilidad para recordatorios automáticos (Fase 7a, Bloque 3).
 *
 * El cron corre cada 30 min y pregunta: "¿qué eventos están en la ventana
 * de 24h o 2h antes de empezar? Para cada uno, ¿qué tokens QR (confirmados)
 * todavía no recibieron ese recordatorio?"
 *
 * **Ventanas (UTC):**
 *   - 24h reminder: entre 23h30m y 24h30m antes del starts_at
 *   - 2h  reminder: entre 1h30m y 2h30m antes del starts_at
 *
 * **Por qué 1h de ancho:** el cron corre cada 30 min, así que la primera
 * ejecución que pille el evento dentro de la ventana manda el recordatorio.
 * Vercel puede tener drift de minutos — el ancho de 1h absorbe eso.
 *
 * **Idempotencia:** los inserts en `event_reminder_log` usan ON CONFLICT
 * DO NOTHING (constraint UNIQUE en `event_qr_token_id, reminder_kind`).
 * Si el cron corre 2 veces en la misma ventana, el segundo no duplica.
 *
 * **Qué pasa si Vercel no ejecuta el cron:** no se manda ese recordatorio.
 * No hay retry. Para producción se podría agregar un "stuck reminder"
 * detector, pero para el 6 de julio esto es suficiente.
 *
 * Server-only.
 */

import { createSupabaseAdminClient } from "../supabase/admin";
import { checkSupabaseConfig } from "../supabase/health";
import { sendEventReminderEmail } from "../email/event-reminder";
import { appBaseUrl } from "../utils";

/** Ancho de la ventana (ms). 1h absorbe el drift de Vercel. */
const WINDOW_MS = 60 * 60 * 1000;

/** Offset del reminder desde starts_at (ms). 24h antes. */
const REMINDER_24H_OFFSET_MS = 24 * 60 * 60 * 1000;
/** Offset del reminder desde starts_at (ms). 2h antes. */
const REMINDER_2H_OFFSET_MS = 2 * 60 * 60 * 1000;

export interface ReminderWindow {
  kind: "24h" | "2h";
  /** Inicio de la ventana (ms epoch, UTC). */
  windowStartMs: number;
  /** Fin de la ventana (ms epoch, UTC). */
  windowEndMs: number;
}

export interface EligibleEvent {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventStartsAt: string; // ISO
  eventLocation: string | null;
  startsAtMs: number;
}

export interface EligibleToken {
  tokenId: string;
  token: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  attendeePhone: string | null;
}

export interface ReminderRunResult {
  ok: boolean;
  demo: boolean;
  note: string;
  /** Eventos evaluados (los que caen en alguna ventana). */
  events: EligibleEvent[];
  /** Total de emails enviados OK. */
  sent: number;
  /** Total de errores (no fatales — el cron sigue). */
  failed: number;
  /** Skipped: tokens sin email (no se puede mandar). */
  skipped: number;
  /** Detalle por (eventId, kind). */
  details: Array<{
    eventId: string;
    kind: "24h" | "2h";
    eligible: number;
    sent: number;
    failed: number;
    skipped: number;
  }>;
}

/** Devuelve las ventanas de reminder activas en este momento. */
export function getActiveReminderWindows(now: Date = new Date()): ReminderWindow[] {
  const nowMs = now.getTime();
  return [
    {
      kind: "24h",
      windowStartMs: nowMs + REMINDER_24H_OFFSET_MS - WINDOW_MS / 2,
      windowEndMs: nowMs + REMINDER_24H_OFFSET_MS + WINDOW_MS / 2,
    },
    {
      kind: "2h",
      windowStartMs: nowMs + REMINDER_2H_OFFSET_MS - WINDOW_MS / 2,
      windowEndMs: nowMs + REMINDER_2H_OFFSET_MS + WINDOW_MS / 2,
    },
  ];
}

/** Busca eventos cuyo starts_at cae en alguna de las ventanas. */
async function findEventsInWindows(
  windows: ReminderWindow[],
): Promise<EligibleEvent[]> {
  if (windows.length === 0) return [];
  // El solapamiento entre ventanas es despreciable (ventanas 1h, separación 22h).
  // Buscamos por la ventana más amplia para simplificar.
  const minStart = Math.min(...windows.map((w) => w.windowStartMs));
  const maxEnd = Math.max(...windows.map((w) => w.windowEndMs));

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events" as never)
    .select("id, slug, title, starts_at, location")
    .eq("status", "published")
    .gte("starts_at", new Date(minStart).toISOString())
    .lte("starts_at", new Date(maxEnd).toISOString())
    // Solo eventos futuros (no archivados históricos).
    .order("starts_at", { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[cron/event-reminders] findEventsInWindows falló", {
      code: (error as { code?: string }).code,
    });
    return [];
  }
  type EventRow = {
    id: string;
    slug: string;
    title: string;
    starts_at: string;
    location: string | null;
  };
  return ((data ?? []) as EventRow[]).map((evt) => ({
    eventId: evt.id,
    eventSlug: evt.slug,
    eventTitle: evt.title,
    eventStartsAt: evt.starts_at,
    eventLocation: evt.location,
    startsAtMs: new Date(evt.starts_at).getTime(),
  }));
}

/** Filtra los eventos que están en CADA ventana específica. */
export function eventsInWindow(
  events: EligibleEvent[],
  window: ReminderWindow,
): EligibleEvent[] {
  return events.filter(
    (e) =>
      e.startsAtMs >= window.windowStartMs &&
      e.startsAtMs <= window.windowEndMs,
  );
}

/**
 * Busca tokens QR del evento que NO tienen todavía un recordatorio de
 * este `reminder_kind` en `event_reminder_log`.
 */
async function findEligibleTokens(
  eventId: string,
  reminderKind: "24h" | "2h",
): Promise<EligibleToken[]> {
  const supabase = createSupabaseAdminClient();
  // 1. Todos los tokens del evento.
  const { data: tokens, error: tErr } = await supabase
    .from("event_qr_tokens" as never)
    .select("id, token, attendee_name, attendee_email, attendee_phone_normalized")
    .eq("event_id", eventId);
  if (tErr || !tokens) return [];

  type TokenRow = {
    id: string;
    token: string;
    attendee_name: string | null;
    attendee_email: string | null;
    attendee_phone_normalized: string | null;
  };
  const allTokens = tokens as TokenRow[];

  // 2. Reminders ya enviados (kind, token_id).
  const { data: logs, error: lErr } = await supabase
    .from("event_reminder_log" as never)
    .select("event_qr_token_id")
    .eq("event_id", eventId)
    .eq("reminder_kind", reminderKind);
  if (lErr) return [];
  const alreadySent = new Set(
    ((logs ?? []) as Array<{ event_qr_token_id: string }>).map(
      (l) => l.event_qr_token_id,
    ),
  );

  return allTokens
    .filter((t) => !alreadySent.has(t.id))
    .map((t) => ({
      tokenId: t.id,
      token: t.token,
      attendeeName: t.attendee_name,
      attendeeEmail: t.attendee_email,
      attendeePhone: t.attendee_phone_normalized,
    }));
}

/**
 * Ejecuta el job completo: evalúa ventanas, busca tokens elegibles,
 * manda emails, registra en `event_reminder_log`.
 *
 * Idempotente: re-correr no duplica envíos (UNIQUE constraint).
 * Best-effort: un email fallido no cancela los demás.
 */
export async function runEventRemindersJob(
  now: Date = new Date(),
): Promise<ReminderRunResult> {
  if (!checkSupabaseConfig().configured) {
    return {
      ok: true,
      demo: true,
      note: "Supabase no configurado (modo demo).",
      events: [],
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };
  }

  const windows = getActiveReminderWindows(now);
  const events = await findEventsInWindows(windows);
  if (events.length === 0) {
    return {
      ok: true,
      demo: false,
      note: "No hay eventos en ventana de reminder.",
      events: [],
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };
  }

  const supabase = createSupabaseAdminClient();
  const baseUrl = appBaseUrl();
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const details: ReminderRunResult["details"] = [];

  for (const window of windows) {
    const eventsInWin = eventsInWindow(events, window);
    if (eventsInWin.length === 0) continue;

    for (const evt of eventsInWin) {
      const tokens = await findEligibleTokens(evt.eventId, window.kind);
      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const t of tokens) {
        // Sin email no podemos mandar. Loggear skip y seguir.
        if (!t.attendeeEmail) {
          skipped += 1;
          // Igual registramos en log para no re-evaluar cada vez.
          await supabase.from("event_reminder_log" as never).insert(
            {
              event_qr_token_id: t.tokenId,
              event_id: evt.eventId,
              reminder_kind: window.kind,
              attendee_email: "",
              attendee_name: t.attendeeName,
              error: "no_email",
            } as never,
          );
          continue;
        }

        const checkInUrl = `${baseUrl}/check-in/${t.token}`;
        const result = await sendEventReminderEmail({
          attendeeName: t.attendeeName ?? "Asistente",
          attendeeEmail: t.attendeeEmail,
          eventTitle: evt.eventTitle,
          eventStartsAt: evt.eventStartsAt,
          eventLocation: evt.eventLocation,
          reminderKind: window.kind,
          checkInUrl,
        });

        // Loggear (con ON CONFLICT DO NOTHING para idempotencia si el cron
        // corre 2 veces antes del commit del primero).
        await supabase.from("event_reminder_log" as never).insert(
          {
            event_qr_token_id: t.tokenId,
            event_id: evt.eventId,
            reminder_kind: window.kind,
            attendee_email: t.attendeeEmail,
            attendee_name: t.attendeeName,
            brevo_message_id: result.messageId ?? null,
            error: result.ok ? null : (result.error ?? "unknown"),
          } as never,
        );

        if (result.ok) {
          sent += 1;
        } else {
          failed += 1;
        }
      }

      totalSent += sent;
      totalFailed += failed;
      totalSkipped += skipped;
      details.push({
        eventId: evt.eventId,
        kind: window.kind,
        eligible: tokens.length,
        sent,
        failed,
        skipped,
      });
    }
  }

  return {
    ok: true,
    demo: false,
    note: `Reminders procesados: ${totalSent} enviados, ${totalFailed} fallidos, ${totalSkipped} skipped.`,
    events,
    sent: totalSent,
    failed: totalFailed,
    skipped: totalSkipped,
    details,
  };
}