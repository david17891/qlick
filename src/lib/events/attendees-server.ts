/**
 * Servicios server-side para asistentes de eventos (Fase 3).
 *
 * Server-only. Un attendee puede NO matchear con confirmation (la
 * persona pudo haberse presentado sin confirmar antes). El admin
 * puede marcar el match manual en Fase 4+.
 *
 * Privacidad: datos personales solo server-side. RLS deny para anon.
 *
 * @server
 */

import type {
  EventAttendee,
  EventAttendeeSource,
} from "@/types/events";
import {
  mapEventAttendeeRowToEventAttendee,
  type EventAttendeeRow,
} from "./event-mapper";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "../crm/phone-utils.ts";

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

export interface CreateAttendeeInput {
  eventId: string;
  confirmationId?: string | null;
  name?: string | null;
  email?: string | null;
  phoneNormalized?: string | null;
  source?: EventAttendeeSource;
  importBatchId?: string | null;
  checkedInBy?: string | null;
}

export interface CreateAttendeeResult {
  ok: boolean;
  attendee?: EventAttendee;
  created: boolean;
  persisted: boolean;
  demo: boolean;
  note: string;
}

// ─────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────

export async function getAttendeesByEventId(
  eventId: string,
): Promise<EventAttendee[]> {
  if (!isRealMode()) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_attendees")
    .select("*")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: false });
  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[attendees-server] getAttendeesByEventId falló", {
        code: error.code,
        eventId,
      });
    }
    return [];
  }
  return (data as EventAttendeeRow[]).map(mapEventAttendeeRowToEventAttendee);
}

/**
 * Devuelve attendees que NO tienen confirmation_id (vinieron sin
 * confirmar antes). Útil para el reporte del admin "X personas
 * asistieron sin confirmación previa".
 */
export async function getUnmatchedAttendees(
  eventId: string,
): Promise<EventAttendee[]> {
  if (!isRealMode()) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_attendees")
    .select("*")
    .eq("event_id", eventId)
    .is("confirmation_id", null);
  if (error || !data) return [];
  return (data as EventAttendeeRow[]).map(mapEventAttendeeRowToEventAttendee);
}

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

/**
 * Crea un attendee. Server-only. Si ya existe (dedup por email dentro
 * del mismo evento), devuelve `created: false`.
 */
export async function createAttendee(
  input: CreateAttendeeInput,
): Promise<CreateAttendeeResult> {
  if (!isRealMode()) {
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: true,
      note: "Supabase no configurado.",
    };
  }
  if (!input.eventId) {
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: "Falta eventId.",
    };
  }

  const phoneNormalized =
    input.phoneNormalized ??
    (input.email ? null : null); // no inferimos phone desde acá

  const supabase = createSupabaseAdminClient();
  // UPSERT con ignore: si ya existe (UNIQUE por event_id + email), no inserta.
  const { data, error } = await supabase
    .from("event_attendees")
    .upsert(
      {
        event_id: input.eventId,
        confirmation_id: input.confirmationId ?? null,
        name: input.name?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        phone_normalized: phoneNormalized,
        source: input.source ?? "check_in",
        import_batch_id: input.importBatchId ?? null,
        checked_in_by: input.checkedInBy ?? null,
      },
      { onConflict: "event_id,email", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[attendees-server] createAttendee falló", {
      code: error.code,
      eventId: input.eventId,
    });
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: `No se pudo crear el attendee (${error.code ?? "unknown"}).`,
    };
  }

  if (!data) {
    // Ya existía — buscamos el existente.
    if (input.email) {
      const { data: existing } = await supabase
        .from("event_attendees")
        .select("*")
        .eq("event_id", input.eventId)
        .eq("email", input.email.trim().toLowerCase())
        .maybeSingle();
      if (existing) {
        return {
          ok: true,
          attendee: mapEventAttendeeRowToEventAttendee(existing as EventAttendeeRow),
          created: false,
          persisted: true,
          demo: false,
          note: "Ya existía (dedup por email).",
        };
      }
    }
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: "Conflicto desconocido.",
    };
  }

  return {
    ok: true,
    attendee: mapEventAttendeeRowToEventAttendee(data as EventAttendeeRow),
    created: true,
    persisted: true,
    demo: false,
    note: "Attendee registrado en Supabase.",
  };
}

// ─────────────────────────────────────────────────────────────
// Re-export para importador CLI
// ─────────────────────────────────────────────────────────────

export { normalizePhone };
