/**
 * Lógica del cron de recordatorios de encuesta post-evento
 * (feat/funnel-dynamic-surveys-crm, commit 11, 2026-07-05).
 *
 * El cron corre cada hora y pregunta: "¿qué eventos finalizaron hace
 * 1-4 horas? Para cada uno, ¿qué asistentes (attendees) NO han
 * completado la encuesta? Para cada uno, generar token único y enviar
 * por WhatsApp el link `/encuesta/[token]` vía Meta template
 * `conf_post_conferencia`."
 *
 * **Ventana (UTC):**
 *   - 4h reminder: 4h ± 1h después de `ends_at` (drift de Vercel)
 *
 * **Por qué proactivo:** el bot solo ofrece la encuesta cuando el lead
 * ESCRIBE (reactivo). Si el lead nunca escribe después del evento,
 * nunca recibe el offer. Este cron cierra ese gap.
 *
 * **Mensajería híbrida (Meta template):**
 *   - Si la ventana 24h del lead está cerrada (caso típico: el lead no
 *     escribió en 24h+), usamos Meta template `conf_post_conferencia`
 *     con variables {{1}} nombre, {{2}} URL Drive, {{3}} URL encuesta.
 *   - Esto requiere que Meta haya APROBADO el template. Si no está
 *     aprobado, el provider de WhatsApp devuelve error → fallback a
 *     texto libre (best-effort).
 *
 * **Idempotencia:** los inserts en `event_reminder_log` usan UNIQUE
 * constraint en `(attendee_id, reminder_kind)`. Si el cron corre 2
 * veces, el segundo no duplica.
 *
 * Server-only.
 */

import { createSupabaseAdminClient } from "../supabase/admin";
import { checkSupabaseConfig } from "../supabase/health";
import { getOrCreateSurveyTokenForContact } from "../events/survey-tokens";
import { appBaseUrl } from "../utils";

const WINDOW_HOURS_BACK = 4; // 4h después de ends_at
const WINDOW_HOURS_DRIFT = 1; // ±1h drift de Vercel

export const SURVEY_REMINDER_KIND = "survey_post_event" as const;

export interface SurveyReminderRunResult {
  ok: boolean;
  demo: boolean;
  note: string;
  /** Eventos evaluados (los que caen en ventana). */
  events: string[];
  /** Total de survey tokens generados/enviados OK. */
  sent: number;
  /** Total de errores (no fatales). */
  failed: number;
  /** Asistentes sin phone (skipped). */
  skipped: number;
}

/**
 * Ejecuta el job: busca eventos finalizados en ventana, genera tokens,
 * envía reminders. Best-effort: si un envío falla, sigue con los demás.
 *
 * Server-only. Llamado desde `/api/cron/survey-reminders`.
 */
export async function runSurveyRemindersJob(): Promise<SurveyReminderRunResult> {
  if (!checkSupabaseConfig().configured) {
    return {
      ok: false,
      demo: true,
      note: "Supabase no configurado (modo demo).",
      events: [],
      sent: 0,
      failed: 0,
      skipped: 0,
    };
  }

  const supabase = createSupabaseAdminClient();
  const nowMs = Date.now();
  const windowEnd = new Date(
    nowMs - WINDOW_HOURS_BACK * 60 * 60 * 1000 + WINDOW_HOURS_DRIFT * 60 * 60 * 1000,
  ).toISOString();
  const windowStart = new Date(
    nowMs - (WINDOW_HOURS_BACK + WINDOW_HOURS_DRIFT) * 60 * 60 * 1000,
  ).toISOString();

  // 1. Eventos finalizados en la ventana [windowStart, windowEnd].
  const { data: events, error: evErr } = await supabase
    .from("events" as never)
    .select("id, slug, title, ends_at" as never)
    .eq("status" as never, "published")
    .gte("ends_at" as never, windowStart)
    .lte("ends_at" as never, windowEnd);

  if (evErr || !events) {
    return {
      ok: false,
      demo: false,
      note: `Error leyendo eventos: ${(evErr as { code?: string })?.code ?? "unknown"}`,
      events: [],
      sent: 0,
      failed: 0,
      skipped: 0,
    };
  }

  const result: SurveyReminderRunResult = {
    ok: true,
    demo: false,
    note: `${(events as unknown[]).length} eventos en ventana.`,
    events: (events as Array<{ id: string }>).map((e) => e.id),
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? appBaseUrl();
  // Importación diferida para evitar circular import
  const { getActiveWhatsAppProvider } = await import("../whatsapp");

  for (const ev of events as Array<{
    id: string;
    slug: string;
    title: string;
    ends_at: string;
  }>) {
    // 2. Attendees del evento SIN survey submitted.
    const { data: attendees, error: attErr } = await supabase
      .from("event_attendees" as never)
      .select("id, phone_normalized, name, email" as never)
      .eq("event_id" as never, ev.id)
      .not("phone_normalized" as never, "is", null);

    if (attErr || !attendees) continue;

    // 3. Filtrar attendees que YA completaron la encuesta.
    // FIX 2026-07-06 (Paquete 3 — cron performance): antes cargaba TODOS
    // los surveys del evento (N rows). Para eventos grandes (500+
    // attendees) esto era O(N) por cada iteración del cron. Ahora
    // filtramos por submitted_at > evento.ends_at (solo surveys
    // post-evento, que son los que importan para el reminder).
    const { data: surveys, error: sErr } = await supabase
      .from("event_surveys" as never)
      .select("attendee_id, phone_normalized, respondent_email" as never)
      .eq("event_id" as never, ev.id)
      .gte("submitted_at" as never, ev.ends_at);

    if (sErr) continue;

    const completedAttendeeIds = new Set(
      (surveys as Array<{ attendee_id: string | null }>)
        .map((s) => s.attendee_id)
        .filter((id): id is string => !!id),
    );
    const completedPhones = new Set(
      (surveys as Array<{ phone_normalized: string | null }>)
        .map((s) => s.phone_normalized)
        .filter((p): p is string => !!p),
    );

    for (const att of attendees as Array<{
      id: string;
      phone_normalized: string | null;
      name: string | null;
      email: string | null;
    }>) {
      if (!att.phone_normalized) {
        result.skipped++;
        continue;
      }
      if (
        completedAttendeeIds.has(att.id) ||
        completedPhones.has(att.phone_normalized)
      ) {
        continue;
      }

      // 4. Verificar si ya enviamos el reminder (idempotencia).
      const { data: existingReminder } = await supabase
        .from("event_reminder_log" as never)
        .select("id" as never)
        .eq("event_id" as never, ev.id)
        .eq("attendee_id" as never, att.id)
        .eq("reminder_kind" as never, SURVEY_REMINDER_KIND)
        .maybeSingle();

      if (existingReminder) {
        continue;
      }

      // 5. Generar token (idempotente — reutiliza si ya existe).
      const tokenResult = await getOrCreateSurveyTokenForContact({
        eventId: ev.id,
        email: att.email,
        phoneNormalized: att.phone_normalized,
        baseUrl,
      });

      if (!tokenResult.ok || !tokenResult.url) {
        result.failed++;
        continue;
      }

      // 6. Enviar WhatsApp con Meta template.
      // Por ahora (commit 11), usamos texto libre con el link. La lógica
      // completa de Meta template `conf_post_conferencia` requiere que
      // David apruebe el template en Meta Business Manager (~24-48h).
      // Cuando el template esté aprobado, se cambia `body` por la
      // llamada al template con variables {{1}}, {{2}}, {{3}}.
      const driveUrl = `https://drive.google.com/drive/search?q=${encodeURIComponent(ev.title)}`;
      const messageBody = `¡Hola${att.name ? ` ${att.name}` : ""}! Gracias por sumarte a "${ev.title}". Te compartimos el link privado para que puedas dejarnos tu feedback (toma 2 minutos): ${tokenResult.url}\n\nSi querés acceder a la grabación del evento, acá está: ${driveUrl}`;

      try {
        const provider = getActiveWhatsAppProvider();
        const sendResult = await provider.send({
          to: att.phone_normalized,
          body: messageBody,
        });
        if (sendResult.ok) {
          // 7. Log idempotente del reminder enviado.
          await supabase.from("event_reminder_log" as never).insert({
            event_id: ev.id,
            attendee_id: att.id,
            reminder_kind: SURVEY_REMINDER_KIND,
            sent_at: new Date().toISOString(),
          } as never);
          result.sent++;
        } else {
          result.failed++;
        }
      } catch {
        result.failed++;
      }
    }
  }

  result.note = `${result.events.length} eventos · ${result.sent} reminders enviados · ${result.failed} errores · ${result.skipped} sin teléfono`;
  return result;
}