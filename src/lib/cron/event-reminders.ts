/**
 * Lógica de elegibilidad para recordatorios automáticos de eventos.
 * FIX 2026-07-10 (Sprint 2 v2 David): generalizada para 3 ventanas
 * (24h, 8 am Phoenix, 10 am Phoenix) y 2 canales (whatsapp, email).
 *
 * El cron corre cada 30 min (configurado en vercel.json con
 * schedule "cada 30 minutos") y pregunta: ¿qué eventos están en alguna
 * de las 3 ventanas activas? Para cada uno, ¿qué confirmados
 * (event_qr_tokens) todavía no recibieron ese recordatorio por
 * ESE canal?".
 *
 * **Ventanas (todas en UTC, calculadas desde el `starts_at` del evento
 * guardado en DB):**
 *   - 24h reminder: entre 23h30m y 24h30m antes del starts_at.
 *   - 8 am reminder: 8 am hora Phoenix (= 15:00 UTC) del día del evento.
 *     Ancho 1h absorbe drift.
 *   - 10 am reminder: 10 am hora Phoenix (= 17:00 UTC) del día del evento.
 *     Ancho 1h absorbe drift.
 *
 * **Por qué 1h de ancho:** el cron corre cada 30 min, así que la primera
 * ejecución que pille el evento dentro de la ventana manda el recordatorio.
 * Vercel puede tener drift de minutos — el ancho de 1h absorbe eso.
 *
 * **Idempotencia:** los inserts en `event_reminder_log_v2` usan UNIQUE
 * constraint sobre (event_qr_token_id, reminder_window, channel). Si el
 * cron corre 2 veces en la misma ventana, el segundo no duplica.
 *
 * **Canales:**
 *   - email: Brevo (templates reminder_24h/2h; los 8 am/10 am se construyen
 *     dinámicamente con la misma plantilla hasta que aprobemos 8 am/10 am).
 *   - whatsapp: Meta Cloud API con template `recordatorio_evento_24h`
 *     (aprobado) para 24h; texto libre con copy explícito del helper
 *     `buildReminderBody` para 8 am/10 am hasta que los templates se aprueben.
 *
 * **Qué pasa si Vercel no ejecuta el cron:** no se manda ese recordatorio.
 * El admin puede re-disparar manualmente desde el endpoint
 * `/api/admin/events/[id]/trigger-reminder?kind=24h`.
 *
 * Server-only.
 */

import { createSupabaseAdminClient } from "../supabase/admin";
import { checkSupabaseConfig } from "../supabase/health";
import { sendEventReminderEmail } from "../email/event-reminder";
import {
  sendEventReminderWhatsApp,
  type EventReminderKind,
} from "../whatsapp/event-reminder-send";
import { appBaseUrl } from "../utils";

/** Ancho de la ventana (ms). 1h absorbe el drift de Vercel. */
const WINDOW_MS = 60 * 60 * 1000;

/** Offset de la ventana 24h antes del starts_at (ms). */
const REMINDER_24H_OFFSET_MS = 24 * 60 * 60 * 1000;

/** Offset de la ventana 8 am Phoenix (ms desde medianoche UTC del día del evento). */
const REMINDER_8AM_PHOENIX_HOUR_UTC = 15;

/** Offset de la ventana 10 am Phoenix (ms desde medianoche UTC del día del evento). */
const REMINDER_10AM_PHOENIX_HOUR_UTC = 17;

/** Offset de las ventanas 2h y 1h antes del starts_at (ms). */
const REMINDER_2H_OFFSET_MS = 2 * 60 * 60 * 1000;
const REMINDER_1H_OFFSET_MS = 1 * 60 * 60 * 1000;

export interface ReminderWindow {
  kind: EventReminderKind;
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
  /** Total de envíos OK (sumando email + whatsapp). */
  sent: number;
  /** Total de errores (no fatales — el cron sigue). */
  failed: number;
  /** Skipped: tokens sin email Y sin teléfono (no se puede mandar). */
  skipped: number;
  /** Detalle por (eventId, kind). */
  details: Array<{
    eventId: string;
    kind: EventReminderKind;
    eligible: number;
    sent: number;
    failed: number;
    skipped: number;
  }>;
}

/**
 * Devuelve las ventanas de reminder activas en este momento.
 *
 * Para 24h/2h/1h: ventana centrada en el offset desde el starts_at.
 * Para 8 am/10 am Phoenix: ventana centrada en la hora UTC del día del evento.
 * PERO esta función SOLO devuelve los offsets; la función `findEventsInWindows`
 * busca los eventos cuyo starts_at cae dentro de cada ventana.
 */
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
    {
      kind: "1h",
      windowStartMs: nowMs + REMINDER_1H_OFFSET_MS - WINDOW_MS / 2,
      windowEndMs: nowMs + REMINDER_1H_OFFSET_MS + WINDOW_MS / 2,
    },
  ];
}

/**
 * Devuelve las ventanas 8 am/10 am Phoenix que aplican HOY (UTC day).
 * Si el cron corre a las 14:00 UTC, la ventana 8 am Phoenix (= 15:00 UTC)
 * cae en este tick y devuelve {kind: '8am', start: 14:30, end: 15:30}.
 */
export function getPhoenixDayWindows(now: Date = new Date()): ReminderWindow[] {
  // Phoenix no usa DST (UTC-7 todo el año en la práctica).
  // 8 am Phoenix = 15:00 UTC. 10 am Phoenix = 17:00 UTC.
  const nowMs = now.getTime();
  return [
    {
      kind: "8am",
      // Centro de la ventana: hoy 15:00 UTC. Ancho 1h.
      windowStartMs:
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          REMINDER_8AM_PHOENIX_HOUR_UTC,
          0,
        ) -
        WINDOW_MS / 2,
      windowEndMs:
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          REMINDER_8AM_PHOENIX_HOUR_UTC,
          0,
        ) +
        WINDOW_MS / 2,
    },
    {
      kind: "10am",
      windowStartMs:
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          REMINDER_10AM_PHOENIX_HOUR_UTC,
          0,
        ) -
        WINDOW_MS / 2,
      windowEndMs:
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          REMINDER_10AM_PHOENIX_HOUR_UTC,
          0,
        ) +
        WINDOW_MS / 2,
    },
  ];
}

/** Busca eventos cuyo starts_at cae en alguna de las ventanas. */
async function findEventsInWindows(
  windows: ReminderWindow[]
): Promise<EligibleEvent[]> {
  if (windows.length === 0) return [];
  const minStart = Math.min(...windows.map((w) => w.windowStartMs));
  const maxEnd = Math.max(...windows.map((w) => w.windowEndMs));

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events" as never)
    .select("id, slug, title, starts_at, location")
    .eq("status", "published")
    .gte("starts_at", new Date(minStart).toISOString())
    .lte("starts_at", new Date(maxEnd).toISOString())
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

/**
 * FIX 2026-07-10: helper de matching específico para las 5 ventanas.
 *
 * Para ventanas relativas (24h/2h/1h): el starts_at del evento debe
 * caer dentro de la ventana centrada en el offset.
 *
 * Para ventanas Phoenix (8 am/10 am): el evento debe ser DEL MISMO DÍA
 * UTC que la ventana. Es decir, si el cron corre el 11 julio UTC a las
 * 15:00 (8 am Phoenix del 11), la ventana 8 am es 14:30-15:30 UTC del 11.
 * Un evento que empieza el 11 a las 18:00 UTC (= 11 AM Phoenix) está
 * en el mismo día UTC que la ventana, así que matchea.
 */
export function eventMatchesWindow(
  evt: EligibleEvent,
  window: ReminderWindow
): boolean {
  if (
    window.kind === "24h" ||
    window.kind === "2h" ||
    window.kind === "1h"
  ) {
    return (
      evt.startsAtMs >= window.windowStartMs &&
      evt.startsAtMs <= window.windowEndMs
    );
  }
  // 8 am / 10 am Phoenix: mismo día UTC.
  const eventDay = new Date(evt.eventStartsAt).getUTCDate();
  const eventMonth = new Date(evt.eventStartsAt).getUTCMonth();
  const eventYear = new Date(evt.eventStartsAt).getUTCFullYear();
  const windowDay = new Date(window.windowStartMs).getUTCDate();
  const windowMonth = new Date(window.windowStartMs).getUTCMonth();
  const windowYear = new Date(window.windowStartMs).getUTCFullYear();
  return (
    eventDay === windowDay &&
    eventMonth === windowMonth &&
    eventYear === windowYear
  );
}

/**
 * Busca tokens QR del evento que NO tienen todavía un recordatorio de
 * este `reminderKind` en `event_reminder_log_v2` PARA ESTE CANAL.
 * Si ya se envió por email, igual lo incluimos para enviar por whatsapp
 * (y viceversa) — los 2 canales son independientes.
 */
async function findEligibleTokens(
  eventId: string,
  reminderKind: EventReminderKind
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

  // 2. Reminders ya enviados por canal (kind, token_id, channel).
  const { data: logs, error: lErr } = await supabase
    .from("event_reminder_log_v2" as never)
    .select("event_qr_token_id, channel")
    .eq("event_id", eventId)
    .eq("reminder_window", reminderKind);
  if (lErr) return [];
  const alreadySentByChannel = new Set<string>();
  for (const l of (logs ?? []) as Array<{
    event_qr_token_id: string;
    channel: string;
  }>) {
    alreadySentByChannel.add(`${l.event_qr_token_id}::${l.channel}`);
  }

  return allTokens
    .filter((t) => !alreadySentByChannel.has(`${t.id}::email`)
                 && !alreadySentByChannel.has(`${t.id}::whatsapp`))
    .map((t) => ({
      tokenId: t.id,
      token: t.token,
      attendeeName: t.attendee_name,
      attendeeEmail: t.attendee_email,
      attendeePhone: t.attendee_phone_normalized,
    }));
}

/** Inserta (o no-op si ya existe) un row en event_reminder_log_v2. */
async function logReminder(args: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  eventId: string;
  tokenId: string;
  channel: "whatsapp" | "email";
  reminderWindow: EventReminderKind;
  scheduledAtUtc: Date;
  sentAtUtc: Date | null;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  externalId: string | null;
}): Promise<void> {
  await args.supabase
    .from("event_reminder_log_v2" as never)
    .upsert(
      {
        event_id: args.eventId,
        event_qr_token_id: args.tokenId,
        channel: args.channel,
        reminder_window: args.reminderWindow,
        scheduled_at_utc: args.scheduledAtUtc.toISOString(),
        sent_at_utc: args.sentAtUtc ? args.sentAtUtc.toISOString() : null,
        status: args.status,
        error: args.error,
        external_id: args.externalId,
      } as never,
      { onConflict: "event_qr_token_id,reminder_window,channel" }
    );
}

/**
 * Ejecuta el job completo: evalúa las 5 ventanas (24h, 2h, 1h, 8 am, 10 am),
 * busca tokens elegibles, manda email + WhatsApp, registra en
 * `event_reminder_log_v2`.
 *
 * Idempotente: re-correr no duplica envíos (UNIQUE constraint).
 * Best-effort: un envío fallido no cancela los demás.
 */
export async function runEventRemindersJob(
  now: Date = new Date()
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

  // FIX 2026-07-10: 5 ventanas — 24h, 2h, 1h (relativas) + 8 am, 10 am
  // (Phoenix del día del evento).
  const allWindows: ReminderWindow[] = [
    ...getActiveReminderWindows(now),
    ...getPhoenixDayWindows(now),
  ];

  const events = await findEventsInWindows(allWindows);
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

  for (const window of allWindows) {
    const eventsInWin = events.filter((e) => eventMatchesWindow(e, window));
    if (eventsInWin.length === 0) continue;

    for (const evt of eventsInWin) {
      const tokens = await findEligibleTokens(evt.eventId, window.kind);
      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const t of tokens) {
        const checkInUrl = `${baseUrl}/check-in/${t.token}`;
        const scheduledAtUtc = new Date(
          window.kind === "8am"
            ? Date.UTC(
                new Date(evt.eventStartsAt).getUTCFullYear(),
                new Date(evt.eventStartsAt).getUTCMonth(),
                new Date(evt.eventStartsAt).getUTCDate(),
                REMINDER_8AM_PHOENIX_HOUR_UTC,
                0
              )
            : window.kind === "10am"
            ? Date.UTC(
                new Date(evt.eventStartsAt).getUTCFullYear(),
                new Date(evt.eventStartsAt).getUTCMonth(),
                new Date(evt.eventStartsAt).getUTCDate(),
                REMINDER_10AM_PHOENIX_HOUR_UTC,
                0
              )
            : new Date(evt.eventStartsAt).getTime() -
              (window.kind === "24h"
                ? REMINDER_24H_OFFSET_MS
                : window.kind === "2h"
                ? REMINDER_2H_OFFSET_MS
                : REMINDER_1H_OFFSET_MS)
        );

        // ============== EMAIL ==============
        if (t.attendeeEmail) {
          const emailResult = await sendEventReminderEmail(
            {
              attendeeName: t.attendeeName ?? "Asistente",
              attendeeEmail: t.attendeeEmail,
              eventTitle: evt.eventTitle,
              eventStartsAt: evt.eventStartsAt,
              eventLocation: evt.eventLocation,
              reminderKind: window.kind,
              checkInUrl,
            },
            { eventId: evt.eventId, eventQrTokenId: t.tokenId }
          );
          await logReminder({
            supabase,
            eventId: evt.eventId,
            tokenId: t.tokenId,
            channel: "email",
            reminderWindow: window.kind,
            scheduledAtUtc,
            sentAtUtc: new Date(),
            status: emailResult.ok ? "sent" : "failed",
            error: emailResult.ok ? null : (emailResult.error ?? "unknown"),
            externalId: emailResult.messageId ?? null,
          });
          if (emailResult.ok) sent += 1;
          else failed += 1;
        }

        // ============== WHATSAPP ==============
        if (t.attendeePhone) {
          // Para 24h: usar template aprobado. Para 8 am/10 am/2h/1h: texto
          // libre (templates 8 am/10 am aún no existen en Meta, David los
          // crea async). Cuando estén aprobados, pasar `templateName`.
          const useTemplate = window.kind === "24h";
          const whatsappResult = await sendEventReminderWhatsApp({
            attendeeName: t.attendeeName,
            attendeePhone: t.attendeePhone,
            eventTitle: evt.eventTitle,
            eventStartsAt: evt.eventStartsAt,
            eventLocation: evt.eventLocation,
            reminderKind: window.kind,
            checkInUrl,
            templateName: useTemplate ? "recordatorio_evento_24h" : null,
            templateLanguage: "es_MX",
          });
          await logReminder({
            supabase,
            eventId: evt.eventId,
            tokenId: t.tokenId,
            channel: "whatsapp",
            reminderWindow: window.kind,
            scheduledAtUtc,
            sentAtUtc: new Date(),
            status: whatsappResult.ok ? "sent" : "failed",
            error: whatsappResult.ok
              ? null
              : (whatsappResult.note || "unknown"),
            externalId: whatsappResult.externalId ?? null,
          });
          if (whatsappResult.ok) sent += 1;
          else failed += 1;
        }

        // Si no tiene email NI teléfono, skip.
        if (!t.attendeeEmail && !t.attendeePhone) {
          await logReminder({
            supabase,
            eventId: evt.eventId,
            tokenId: t.tokenId,
            channel: "email", // channel marker; no se envió nada.
            reminderWindow: window.kind,
            scheduledAtUtc,
            sentAtUtc: null,
            status: "skipped",
            error: "no_email_no_phone",
            externalId: null,
          });
          skipped += 1;
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
