/**
 * Servicios server-side para confirmaciones de asistencia (Fase 3).
 *
 * Server-only. Las confirmaciones NO son leads — son prospectos en frío
 * que dijeron "sí, voy". El importador y los server actions usan este lib.
 *
 * Privacidad: datos personales solo server-side. RLS deny para anon.
 *
 * @server
 */

import type {
  EventConfirmation,
  EventConfirmationSource,
} from "@/types/events";
import {
  mapEventConfirmationRowToEventConfirmation,
  type EventConfirmationRow,
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

/** Input para crear una confirmación (server-side, usado por importador). */
export interface CreateConfirmationInput {
  eventId: string;
  name: string;
  email?: string | null;
  phoneRaw?: string | null;
  /** Si no se pasa, se calcula con normalizePhone(phoneRaw). */
  phoneNormalized?: string | null;
  source?: EventConfirmationSource;
  importBatchId?: string | null;
}

/** Resultado de una creación. */
export interface CreateConfirmationResult {
  ok: boolean;
  confirmation?: EventConfirmation;
  /** true si se insertó, false si ya existía (dedup). */
  created: boolean;
  persisted: boolean;
  demo: boolean;
  note: string;
}

// ─────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────

export async function getConfirmationsByEventId(
  eventId: string,
): Promise<EventConfirmation[]> {
  if (!isRealMode()) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_confirmations")
    .select("*")
    .eq("event_id", eventId)
    .order("confirmed_at", { ascending: false });
  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[confirmations-server] getConfirmationsByEventId falló", {
        code: error.code,
        eventId,
      });
    }
    return [];
  }
  return (data as EventConfirmationRow[]).map(
    mapEventConfirmationRowToEventConfirmation,
  );
}

/**
 * Cross-check: busca una confirmación por email O phone normalizado.
 * Usado por la promoción encuesta→lead para detectar matches.
 */
export async function findConfirmationByEmailOrPhone(
  eventId: string,
  email: string | null | undefined,
  phone: string | null | undefined,
): Promise<EventConfirmation | null> {
  if (!isRealMode()) return null;
  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const normalizedEmail = email?.trim().toLowerCase() || null;
  if (!normalizedEmail && !normalizedPhone) return null;

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("event_confirmations")
    .select("*")
    .eq("event_id", eventId);

  if (normalizedEmail) {
    query = query.ilike("email", normalizedEmail);
  } else if (normalizedPhone) {
    query = query.eq("phone_normalized", normalizedPhone);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return mapEventConfirmationRowToEventConfirmation(data as EventConfirmationRow);
}

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

/**
 * Crea una confirmación. Server-only. Si ya existe (dedup por
 * email o phone_normalized), devuelve `created: false`.
 */
export async function createConfirmation(
  input: CreateConfirmationInput,
): Promise<CreateConfirmationResult> {
  if (!isRealMode()) {
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: true,
      note: "Supabase no configurado.",
    };
  }
  if (!input.eventId || !input.name?.trim()) {
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: "Faltan datos (eventId/name).",
    };
  }

  const email = input.email?.trim().toLowerCase() || null;
  const phoneNormalized =
    input.phoneNormalized ?? (input.phoneRaw ? normalizePhone(input.phoneRaw) : null);

  const supabase = createSupabaseAdminClient();
  // ON CONFLICT DO NOTHING: si ya existe (UNIQUE constraint), no inserta.
  // Devolvemos la fila existente para que el caller sepa el id.
  const { data, error } = await supabase
    .from("event_confirmations")
    .upsert(
      {
        event_id: input.eventId,
        name: input.name.trim(),
        email,
        phone_raw: input.phoneRaw?.trim() || null,
        phone_normalized: phoneNormalized,
        source: input.source ?? "imported_excel",
        import_batch_id: input.importBatchId ?? null,
      },
      { onConflict: "event_id,email", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();

  // El conflict de phone_normalized NO lo cubre el upsert anterior (la
  // constraint es por email O phone). Si el upsert pasó con ignore, pero
  // había un duplicado por phone, igual va a fallar por el unique de phone.
  // Hacemos un SELECT para ver qué pasó realmente.
  if (error) {
    // Si es un unique violation por phone, también es "ya existe".
    if (error.code === "23505") {
      // Buscamos el existente por phone para devolverlo.
      const { data: existing } = await supabase
        .from("event_confirmations")
        .select("*")
        .eq("event_id", input.eventId)
        .or(`email.eq.${email ?? "_none_"},phone_normalized.eq.${phoneNormalized ?? "_none_"}`)
        .maybeSingle();
      if (existing) {
        return {
          ok: true,
          confirmation: mapEventConfirmationRowToEventConfirmation(
            existing as EventConfirmationRow,
          ),
          created: false,
          persisted: true,
          demo: false,
          note: "Ya existía (dedup por email o phone).",
        };
      }
    }
    // eslint-disable-next-line no-console
    console.error("[confirmations-server] createConfirmation falló", {
      code: error.code,
      eventId: input.eventId,
    });
    return {
      ok: false,
      created: false,
      persisted: false,
      demo: false,
      note: `No se pudo crear la confirmación (${error.code ?? "unknown"}).`,
    };
  }

  if (!data) {
    // ignoreDuplicates=true sin error: ya existía, no se insertó. Buscamos.
    const { data: existing } = await supabase
      .from("event_confirmations")
      .select("*")
      .eq("event_id", input.eventId)
      .or(`email.eq.${email ?? "_none_"},phone_normalized.eq.${phoneNormalized ?? "_none_"}`)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        confirmation: mapEventConfirmationRowToEventConfirmation(
          existing as EventConfirmationRow,
        ),
        created: false,
        persisted: true,
        demo: false,
        note: "Ya existía (dedup por email o phone).",
      };
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
    confirmation: mapEventConfirmationRowToEventConfirmation(data as EventConfirmationRow),
    created: true,
    persisted: true,
    demo: false,
    note: "Confirmación creada en Supabase.",
  };
}

// ─────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────

/**
 * Elimina una confirmación por ID.
 *
 * FIX 2026-07-03 (sesion David, admin cleanup): David necesitaba poder
 * borrar confirmados que se le quedaron de pruebas del bot. Hasta
 * ahora no habia forma de hacerlo desde el admin.
 *
 * Side effect: la tabla `event_attendees` puede tener filas con
 * `confirmation_id` apuntando a este ID. La constraint es `ON DELETE
 * SET NULL` (ver migracion 20260627000000_events_funnel.sql), asi que
 * los attendees quedan con confirmation_id=NULL pero no se borran.
 * David los puede limpiar manualmente desde la tab Asistentes.
 *
 * Tambien elimina los event_qr_tokens asociados a este phone del
 * mismo evento (mismo (event_id, phone_normalized) — son los pases
 * generados para este confirmado).
 *
 * Auditoria: action='event_confirmation_delete' con metadata.
 */
export async function deleteConfirmation(
  confirmationId: string,
): Promise<{ ok: boolean; note: string; deletedQrTokens?: number }> {
  if (!isRealMode()) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!confirmationId) {
    return { ok: false, note: "Falta confirmationId." };
  }
  const supabase = createSupabaseAdminClient();

  // 1. Leer la confirmation para audit + cascade de qr_tokens.
  const { data: conf } = await supabase
    .from("event_confirmations")
    .select("event_id, name, email, phone_normalized")
    .eq("id", confirmationId)
    .maybeSingle();

  if (!conf) {
    return { ok: false, note: "Confirmación no encontrada." };
  }

  // 2. Borrar event_qr_tokens del mismo (event_id, phone_normalized)
  //    o (event_id, email) — son los pases generados para esta persona.
  // Usamos `as never` porque event_qr_tokens no esta en el typegen
  // todavia (migration 20260629223747_whatsapp_funnel_v1.sql lo agrega
  // pero el cliente TS no se regenero). Mismo patron que el resto del
  // codigo que accede a esa tabla.
  let deletedQrTokens = 0;
  if (conf.phone_normalized || conf.email) {
    let qrQuery = supabase
      .from("event_qr_tokens" as never)
      .delete()
      .eq("event_id" as never, conf.event_id);
    if (conf.phone_normalized) {
      qrQuery = qrQuery.eq(
        "attendee_phone_normalized" as never,
        conf.phone_normalized,
      );
    } else if (conf.email) {
      qrQuery = qrQuery.eq("attendee_email" as never, conf.email);
    }
    const { data: deleted } = await qrQuery.select("id" as never);
    deletedQrTokens = Array.isArray(deleted) ? deleted.length : 0;
  }

  // 3. Borrar la confirmation.
  const { error } = await supabase
    .from("event_confirmations")
    .delete()
    .eq("id", confirmationId);
  if (error) {
    return {
      ok: false,
      note: `No se pudo eliminar (${error.code ?? "?"}).`,
    };
  }

  // 4. Audit log (best-effort).
  try {
    await supabase.from("admin_audit_log").insert({
      actor_email: "admin@qlick",
      action: "event_confirmation_delete",
      entity_type: "event_confirmation",
      entity_id: confirmationId,
      metadata: {
        eventId: conf.event_id,
        attendeeName: conf.name,
        attendeeEmail: conf.email,
        attendeePhone: conf.phone_normalized,
        deletedQrTokens,
      },
    });
  } catch {
    // ignore
  }

  return {
    ok: true,
    note: `Confirmación eliminada. ${deletedQrTokens} QR token(s) asociado(s) borrado(s).`,
    deletedQrTokens,
  };
}
