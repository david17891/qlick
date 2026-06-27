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
import { normalizePhone } from "../crm/phone-utils";

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
