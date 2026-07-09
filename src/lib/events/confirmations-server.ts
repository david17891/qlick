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
import { extractEmailFromText } from "../whatsapp/email-extract";
import { logAdminAction } from "../crm/audit-server";

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

/**
 * FIX 2026-07-08 (sesión David "registrados sin nombre/correo/teléfono"):
 * Actualiza campos editables (name/email/phone) de una confirmación de
 * evento. Server-only.
 *
 * Caso de uso: leads legacy registrados con placeholders del bot
 * (ej. "WhatsApp Lead", `wa.xxx@placeholder.local`) necesitan poder
 * corregirse desde la vista `/admin/eventos/[id]?tab=confirmations`,
 * que es donde David verifica la campaña del evento en vivo.
 *
 * Diferencias con `updateLeadFields` (crm/leads-admin-server.ts):
 *   - NO toca `leads` — solo `event_confirmations`. Esta función edita
 *     el confirmado del evento, no el lead global del CRM.
 *   - Para mantener coherencia con `event_qr_tokens` y el flujo de
 *     envío de email del QR pass: si cambia el email/phone, también
 *     actualizamos el QR token asociado (idempotente — reusa si hay
 *     vigente, regenera si no).
 *
 * Validaciones (mismas que updateLeadFields, para consistencia):
 *   - name: 1-100 chars (no vacío, no más de 100).
 *   - email: formato RFC-lite (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`),
 *     extracción de embebidos vía `extractEmailFromText`.
 *   - phone: normalizado a E.164 vía `normalizePhone`. Si llega vacío,
 *     limpiamos el campo. Si llega con formato inválido, error.
 *
 * Optimistic lock: NO (no hay race con el bot aquí — el bot solo
 * escribe en `event_confirmations` cuando llega un nuevo inbound, y
 * eso es para un confirmationId distinto).
 *
 * Auditoría: action='event_confirmation_edit' con before/after JSONB.
 *
 * @param confirmationId UUID de la confirmation.
 * @param fields         Patch parcial con los campos a actualizar.
 * @param actorEmail     Email del admin (para audit log).
 * @param deps           (opcional) Inyección de dependencias para tests.
 */
export interface ConfirmationFieldUpdate {
  name?: string;
  email?: string;
  phone?: string;
}

export interface UpdateConfirmationFieldsResult {
  ok: boolean;
  confirmation?: EventConfirmation;
  note?: string;
}

export async function updateConfirmationFields(
  confirmationId: string,
  fields: ConfirmationFieldUpdate,
  actorEmail: string,
  deps?: {
    supabase?: Awaited<ReturnType<typeof createSupabaseAdminClient>> | null;
    isConfigured?: boolean;
  },
): Promise<UpdateConfirmationFieldsResult> {
  const isConfigured = deps?.isConfigured ?? checkSupabaseConfig().configured;
  if (!isConfigured) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!confirmationId || !actorEmail) {
    return { ok: false, note: "Faltan datos (confirmationId/actor)." };
  }
  if (!fields || Object.keys(fields).length === 0) {
    return { ok: false, note: "Patch vacío." };
  }

  // Validaciones por campo. Devolvemos error actionable (no silencioso).
  const cleaned: { name?: string; email?: string; phoneRaw?: string } = {};

  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (name.length === 0) {
      return { ok: false, note: "El nombre no puede estar vacío." };
    }
    if (name.length > 100) {
      return { ok: false, note: "El nombre no puede superar 100 caracteres." };
    }
    cleaned.name = name;
  }

  if (fields.email !== undefined) {
    const emailRaw = fields.email.trim();
    if (emailRaw.length === 0) {
      cleaned.email = ""; // admin puede limpiar el campo
    } else {
      const extracted = extractEmailFromText(emailRaw) ?? emailRaw;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extracted)) {
        return { ok: false, note: "Email con formato inválido." };
      }
      cleaned.email = extracted.toLowerCase();
    }
  }

  if (fields.phone !== undefined) {
    const phoneRaw = fields.phone.trim();
    if (phoneRaw.length === 0) {
      cleaned.phoneRaw = "";
    } else {
      if (normalizePhone(phoneRaw) === null) {
        return {
          ok: false,
          note: "Teléfono inválido (debe tener código de país, ej. +52...).",
        };
      }
      cleaned.phoneRaw = phoneRaw;
    }
  }

  const supabase = deps?.supabase ?? createSupabaseAdminClient();

  // 1. SELECT previo: necesitamos valores actuales para el diff del audit
  //    log ("from: 'WhatsApp Lead' → to: 'Yesy'"). Sin esto, el audit pierde
  //    el "antes" y queda solo con el "después" — inútil para auditoría real.
  const { data: prevRow, error: prevErr } = await supabase
    .from("event_confirmations")
    .select("id, event_id, name, email, phone_raw, phone_normalized")
    .eq("id", confirmationId)
    .maybeSingle();

  if (prevErr || !prevRow) {
    return {
      ok: false,
      note: prevErr
        ? "No se pudo leer la confirmación antes de actualizar."
        : "La confirmación no existe.",
    };
  }

  // 2. Diff: solo mandamos al UPDATE los campos que efectivamente cambian.
  //    Si el admin manda name="Yesy" pero la DB ya tiene "Yesy", lo skipeamos.
  //    Beneficio: audit log limpio, UPDATE idempotente.
  const payload: Record<string, string | null> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  let nextPhoneNormalized: string | null = null;

  if (cleaned.name !== undefined && cleaned.name !== prevRow.name) {
    payload.name = cleaned.name;
    before.name = prevRow.name;
    after.name = cleaned.name;
  }

  if (cleaned.email !== undefined && cleaned.email !== (prevRow.email ?? "")) {
    // email es string no-null en DB (puede ser "" para "limpio"). Usamos
    // "" explícito en vez de null.
    payload.email = cleaned.email === "" ? "" : cleaned.email;
    before.email = prevRow.email;
    after.email = cleaned.email === "" ? "" : cleaned.email;
  }

  if (cleaned.phoneRaw !== undefined) {
    const prevNorm = normalizePhone(prevRow.phone_raw);
    const nextNorm = normalizePhone(cleaned.phoneRaw);
    if (prevNorm !== nextNorm || prevRow.phone_raw !== cleaned.phoneRaw) {
      payload.phone_raw = cleaned.phoneRaw === "" ? "" : cleaned.phoneRaw;
      if (nextNorm) {
        payload.phone_normalized = nextNorm;
        nextPhoneNormalized = nextNorm;
      }
      before.phone_raw = prevRow.phone_raw;
      before.phone_normalized = prevRow.phone_normalized;
      after.phone_raw = cleaned.phoneRaw === "" ? "" : cleaned.phoneRaw;
      after.phone_normalized = nextNorm ?? null;
    }
  }

  // Trackear qué keys mandó el admin ORIGINALMENTE (no los derivados como
  // phone_normalized) para que el audit `metadata.fields_changed` refleje
  // solo lo que el admin cambió explícitamente.
  const inputKeys: string[] = [];
  if (cleaned.name !== undefined && "name" in payload) inputKeys.push("name");
  if (cleaned.email !== undefined && "email" in payload) inputKeys.push("email");
  if (cleaned.phoneRaw !== undefined && "phone_raw" in payload) inputKeys.push("phone");

  if (Object.keys(payload).length === 0) {
    // Sin cambios reales: devolvemos OK con la confirmation actual.
    const { data: sameRow } = await supabase
      .from("event_confirmations")
      .select("*")
      .eq("id", confirmationId)
      .maybeSingle();
    return {
      ok: true,
      confirmation: sameRow
        ? mapEventConfirmationRowToEventConfirmation(sameRow as EventConfirmationRow)
        : undefined,
      note: "Sin cambios (los datos ya estaban así).",
    };
  }

  // 3. UPDATE atómico.
  const { data, error } = await supabase
    .from("event_confirmations")
    .update(payload as never)
    .eq("id", confirmationId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, note: `No se pudo actualizar (${error.code ?? "?"}).` };
  }
  if (!data) {
    return {
      ok: false,
      note: "La confirmación desapareció entre el SELECT y el UPDATE.",
    };
  }

  const confirmation = mapEventConfirmationRowToEventConfirmation(
    data as EventConfirmationRow,
  );

  // 4. Si cambió el email o el phone_normalized: actualizar el QR token
  //    asociado para que el envío del QR pass use los datos nuevos.
  //
  //    `event_qr_tokens` se linkea al confirmation vía (event_id,
  //    attendee_email) o (event_id, attendee_phone_normalized). Si cambia
  //    alguno de los dos, necesitamos re-mapear o invalidar el token viejo.
  //
  //    Estrategia conservadora (best-effort, no rompe la operación principal):
  //    si encontramos un QR token con el email/phone viejo, lo actualizamos
  //    in-place al nuevo. Si no hay, no creamos uno nuevo aquí (eso lo hace
  //    `generateEventQrTokens` cuando el admin hace click en "Reenviar email").
  if (
    (before.email !== undefined || before.phone_normalized !== undefined) &&
    confirmation
  ) {
    try {
      const oldEmail = (before.email as string | null) ?? null;
      const newEmail = confirmation.email ?? null;
      const oldPhoneNorm = (before.phone_normalized as string | null) ?? null;
      const newPhoneNorm = confirmation.phoneNormalized ?? null;

      // Solo re-mapear si AMBOS (viejo y nuevo) están presentes (no
      // borramos tokens por accidente cuando el admin limpia un campo).
      if (oldEmail && newEmail && oldEmail !== newEmail) {
        await supabase
          .from("event_qr_tokens" as never)
          .update({ attendee_email: newEmail } as never)
          .eq("event_id" as never, prevRow.event_id)
          .eq("attendee_email" as never, oldEmail);
      }
      if (oldPhoneNorm && newPhoneNorm && oldPhoneNorm !== newPhoneNorm) {
        await supabase
          .from("event_qr_tokens" as never)
          .update({ attendee_phone_normalized: newPhoneNorm } as never)
          .eq("event_id" as never, prevRow.event_id)
          .eq("attendee_phone_normalized" as never, oldPhoneNorm);
      }
    } catch (qrErr) {
      // Best-effort: el cambio en confirmation YA se persistió. Si el QR
      // token no se re-mapeó, el admin puede re-generarlo con "Reenviar
      // email" (que ahora usará los datos nuevos). Loggeamos pero no
      // rompemos.
      // eslint-disable-next-line no-console
      console.error("[confirmations-server] updateConfirmationFields: re-map QR token falló (best-effort)", {
        code: (qrErr as { code?: string }).code,
        confirmationId,
      });
    }
  }

  // 5. Audit log con before/after.
  await logAdminAction({
    actor_email: actorEmail,
    action: "event_confirmation_edit",
    entity_type: "event_confirmation",
    entity_id: confirmationId,
    before,
    after,
    metadata: {
      eventId: prevRow.event_id,
      fields_changed: inputKeys,
    },
  });

  return { ok: true, confirmation };
}
