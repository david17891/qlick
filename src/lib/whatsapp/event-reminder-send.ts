/**
 * Helper para enviar recordatorios automáticos de evento por WhatsApp.
 *
 * Encapsula el armado del body + invocación del provider activo. Si se
 * le pasa un `templateName` aprobado en Meta, manda template (válido
 * fuera de la ventana 24h). Si NO, manda texto libre (solo válido dentro
 * de la ventana 24h post-respuesta del usuario).
 *
 * **Por qué helper separado:** queremos testear el armado del body SIN
 * pegarle a Meta. `buildReminderBody` es pura; `sendEventReminderWhatsApp`
 * es la envoltura fina sobre `getActiveWhatsAppProvider().send()`.
 *
 * Server-only.
 */

import { getActiveWhatsAppProvider } from "./index";

/**
 * Ventanas soportadas por el sistema de recordatorios.
 *
 * FIX 2026-07-10 (Sprint 2 hotfix David, generalización): agregamos
 * '8am' y '10am' (hora Phoenix del día del evento) además de las
 * ventanas relativas 24h/2h/1h. Las 3 ventanas (24h, 8am, 10am) son
 * las del evento del 11/jul/2026; los templates Meta de 8am/10am los
 * crea David aparte (24-48h de aprobación); mientras tanto el helper
 * cae a texto libre con copy explícito para cada ventana.
 *
 *  - 24h: "Confirmamos tu lugar, recibirás el link 24h antes".
 *  - 8am Phoenix (15:00 UTC): "HOY es el taller, link Zoom: {{url}}".
 *  - 10am Phoenix (17:00 UTC): "En 1 hora empieza, link Zoom: {{url}}".
 *  - 2h / 1h: "En N hora(s) empieza, abre tu pase".
 */
export type EventReminderKind = "24h" | "8am" | "10am" | "2h" | "1h";

export interface EventReminderWhatsAppInput {
  /** Nombre del asistente. Si es null, "Hola" sin nombre. */
  attendeeName: string | null;
  /** Número destino en formato E.164 (ej. "+526532935492"). */
  attendeePhone: string;
  eventTitle: string;
  /** ISO timestamp del starts_at del evento. */
  eventStartsAt: string;
  /** Lugar o link Zoom. Null si el evento no tiene location. */
  eventLocation: string | null;
  /** Ventana del reminder — define copy y (si hay template) el nombre. */
  reminderKind: EventReminderKind;
  /** URL del pase (`/check-in/[token]`). Requerida por si templateApproved
   *  todavía no fue aprobado y queremos fallback a texto libre con URL. */
  checkInUrl: string;
  /** Nombre del template aprobado en Meta. Si null → texto libre. */
  templateName?: string | null;
  /** Idioma BCP-47 (default "es_MX"). */
  templateLanguage?: string;
}

export interface EventReminderWhatsAppResult {
  ok: boolean;
  /** true si el provider estaba en modo demo (sin env vars real). */
  demo: boolean;
  /** ID del mensaje en Meta (cuando provider=meta_cloud_api y ok). */
  externalId?: string;
  /** Nota del provider (debug). */
  note: string;
}

/** Tipos puros reusados en tests. */
export type ReminderBodyInput = Pick<
  EventReminderWhatsAppInput,
  "attendeeName" | "eventTitle" | "eventStartsAt" | "eventLocation" | "reminderKind" | "checkInUrl"
>;

/**
 * Formatea `eventStartsAt` (ISO UTC) como "sábado, 11 de julio · 11:00 a.m."
 * en zona America/Phoenix. Si el input no parsea, devuelve el ISO crudo.
 *
 * Helper puro para mantener `buildReminderBody` también puro.
 */
export function formatReminderDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Phoenix",
  });
  const time = d.toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Phoenix",
  });
  return `${date} · ${time}`;
}

/** Escapes básico para evitar inyección en body de WhatsApp. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Construye el body del recordatorio. PURE — testeable sin red.
 *
 * Copy en español MX (tuteo). Diferencia entre 24h y 1h/2h:
 *   - 24h: "Confirmamos tu lugar en *evento*... cuándo... recibirás el link..."
 *   - 1h / 2h: "En N horas/hora empieza *evento*... cuándo... abre tu pase"
 *
 * Si el caller va a usar template, el body se interpreta como la primera
 * variable; para texto libre, es el contenido completo del mensaje.
 */
export function buildReminderBody(input: ReminderBodyInput): string {
  const name = input.attendeeName?.trim() || "Hola";
  const safeTitle = esc(input.eventTitle);
  const when = formatReminderDateTime(input.eventStartsAt);
  const loc = input.eventLocation
    ? `\nLugar: ${esc(input.eventLocation)}`
    : "";

  if (input.reminderKind === "24h") {
    return (
      `Hola ${name} 👋\n\n` +
      `Confirmamos tu lugar en *${safeTitle}*\n` +
      `Cuándo: ${when}${loc}\n\n` +
      `Recibirás el link del evento 24 horas antes del inicio.\n\n` +
      `¡Nos vemos pronto!`
    );
  }
  // FIX 2026-07-10: ventanas '8am' y '10am' (hora Phoenix del día del
  // evento). Copy explícito porque el template Meta aún no está aprobado
  // para estas ventanas (David lo hace async). Cuando el template esté
  // aprobado, el caller pasa `templateName` y el provider de WhatsApp
  // usa template en vez de texto libre.
  if (input.reminderKind === "8am") {
    return (
      `Hola ${name} 👋\n\n` +
      `*HOY* es el taller *${safeTitle}*.\n` +
      `Cuándo: ${when}${loc}\n\n` +
      `Te esperamos. Guarda tu link del evento: ${input.checkInUrl}\n\n` +
      `¡Nos vemos en unas horas!`
    );
  }
  if (input.reminderKind === "10am") {
    return (
      `Hola ${name} 👋\n\n` +
      `*En 1 hora* empieza el taller *${safeTitle}*.\n` +
      `Cuándo: ${when}${loc}\n\n` +
      `Abre tu link del evento: ${input.checkInUrl}\n\n` +
      `¡Te esperamos!`
    );
  }
  // "1h" y "2h" comparten copy (corto, urgente).
  const hours = input.reminderKind === "1h" ? "1 hora" : "2 horas";
  return (
    `Hola ${name} 👋\n\n` +
    `En ${hours} empieza *${safeTitle}*\n` +
    `Cuándo: ${when}${loc}\n\n` +
    `Abre tu pase y tenlo todo a la mano: ${input.checkInUrl}\n\n` +
    `¡Nos vemos pronto!`
  );
}

/**
 * Envía el reminder por WhatsApp usando el provider activo. Best-effort:
 * nunca lanza; devuelve `{ok:false,note}` si algo falla.
 */
export async function sendEventReminderWhatsApp(
  input: EventReminderWhatsAppInput,
): Promise<EventReminderWhatsAppResult> {
  try {
    const provider = getActiveWhatsAppProvider();
    const body = buildReminderBody(input);

    // Decidir template vs texto libre. El caller opt-in al pasar
    // templateName (asume que Meta ya lo aprobó).
    const useTemplate = typeof input.templateName === "string" && input.templateName.length > 0;

    const sendResult = await provider.send({
      to: input.attendeePhone,
      body,
      ...(useTemplate
        ? {
            templateName: input.templateName!,
            templateLanguage: input.templateLanguage ?? "es_MX",
          }
        : {}),
    });

    return {
      ok: sendResult.ok,
      demo: sendResult.demo ?? false,
      externalId: sendResult.externalId,
      note: sendResult.note,
    };
  } catch (err) {
    // Política del proyecto: nunca crashear el flow del cron por un
    // envío individual. El caller loggea y sigue con el siguiente contacto.
    return {
      ok: false,
      demo: false,
      note: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
