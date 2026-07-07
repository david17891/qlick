/**
 * event-entitlements — capa de acceso comercial de eventos (Fase 1+).
 *
 * Server-only. Esta es la **fuente única de verdad** para "¿este user tiene
 * derecho a participar / recibir material de este evento pagado?". Toda la UI
 * que muestre contenido gated de un evento de pago DEBE llamar a
 * `checkEventAccess` o `checkEventPaidAccess` antes de renderizar.
 *
 * Espejo de `src/lib/lms/entitlements.ts` (cursos), pero para `events`.
 * Regla de oro: NUNCA decidir acceso desde el frontend. La decisión se
 * toma en server-side con service role.
 *
 * ARQUITECTURA:
 * - events.price_mxn > 0 → evento de pago.
 * - event_access: tabla de derechos (independiente de event_attendees).
 * - payments: tabla de pagos (provider='stripe'/'mercadopago' en real).
 *
 * Por qué separar event_attendees de event_access:
 * - event_attendees = "¿confirmó / asistió al evento?" (puede ser pending_payment).
 * - event_access = "¿tiene derecho a acceder al contenido (replay, material)?"
 * - Un asistente puede tener attendee sin access (pagó pero staff no le dio
 *   acceso). Un admin puede dar access sin attendee.
 *
 * MODOS:
 * - realMode: Supabase configurado → query real a `event_access`.
 * - demoMode: Supabase NO configurado → comportamiento permisivo (todos los
 *   eventos se tratan como free). Útil para dev local sin DB.
 *
 * Origen del grant:
 * - Stripe webhook (Fase 1): source='event_purchase'.
 * - Simulator dev: source='simulated_event_payment'.
 * - Admin manual: source='manual_event_admin'.
 * - Cupón: source='coupon'.
 * - Free RSVP: source='free_rsvp'.
 *
 * @server
 */

import type { Database } from "@/types/supabase";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// TODO(post-stripe-migration): regenerar typegen de Supabase para incluir
// `event_access` en `Database['public']['Tables']`. Hasta entonces,
// usamos un shape local sincronizado manualmente con la migration
// 20260707100000_event_access.sql. Ver docs/PAYMENTS_STRIPE_SETUP.md.

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export type EventAccessStatus = "active" | "revoked" | "expired" | "pending";

export type EventAccessSource =
  | "event_purchase"
  | "simulated_event_payment"
  | "manual_event_admin"
  | "coupon"
  | "free_rsvp";

export interface EventAccess {
  id: string;
  userId: string | null;
  eventId: string;
  accessStatus: EventAccessStatus;
  accessSource: EventAccessSource;
  paymentId: string | null;
  startsAt: string;
  expiresAt: string | null;
  grantedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventAccessResult {
  hasAccess: boolean;
  reason?: "not_authenticated" | "no_access" | "expired";
  source?: EventAccessSource;
  expiresAt?: string | null;
}

interface EventAccessRow {
  id: string;
  user_id: string | null;
  event_id: string;
  access_status: string;
  access_source: string;
  payment_id: string | null;
  starts_at: string;
  expires_at: string | null;
  granted_reason: string | null;
  created_at: string;
  updated_at: string;
}

type EventRow = Database["public"]["Tables"]["events"]["Row"];

/** ¿Estamos en modo real (Supabase configurado)? Server-only check. */
function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/** Mapea fila DB → dominio (snake_case → camelCase). */
function mapEventAccessRow(row: EventAccessRow): EventAccess {
  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    accessStatus: row.access_status as EventAccessStatus,
    accessSource: row.access_source as EventAccessSource,
    paymentId: row.payment_id,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    grantedReason: row.granted_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** ¿El access está vigente? Helper interno. */
function isAccessActive(access: EventAccess, now: Date = new Date()): boolean {
  if (access.accessStatus !== "active") return false;
  if (access.expiresAt === null) return true;
  return new Date(access.expiresAt) > now;
}

/* ------------------------------------------------------------------ */
/* API pública                                                        */
/* ------------------------------------------------------------------ */

/**
 * Devuelve el `event_access` activo del user para un evento, si existe.
 * Útil para admin/debug. La mayoría del código debería usar
 * `checkEventAccess` o `checkEventPaidAccess`.
 */
export async function getEventAccess(
  userId: string,
  eventId: string
): Promise<EventAccess | null> {
  if (!isRealMode()) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase
    // @ts-ignore — event_access no está en el typegen local aún; se regenera tras aplicar migration.
    .from("event_access") as any)
    .select("*")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("access_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[event-entitlements] getEventAccess falló", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  if (!data) return null;
  const access = mapEventAccessRow(data as unknown as EventAccessRow);
  if (!isAccessActive(access)) return null;
  return access;
}

/**
 * API de alto nivel: ¿este user tiene access a este evento (de cualquier origen)?
 *
 * Reglas:
 * - userId === null → { hasAccess: false, reason: 'not_authenticated' }
 * - Evento free (price_mxn <= 0 o null) → { hasAccess: true, source: 'free_rsvp' }
 * - Evento paid → busca event_access active. Si vigente → ok.
 * - demoMode → permisivo (trata todo como free; dev local).
 *
 * Si querés checkear SOLO orígenes de pago, usá `checkEventPaidAccess`.
 */
export async function checkEventAccess(
  userId: string | null,
  eventId: string
): Promise<EventAccessResult> {
  // 1. No autenticado → no.
  if (!userId) {
    return { hasAccess: false, reason: "not_authenticated" };
  }

  // 2. demoMode → permisivo.
  if (!isRealMode()) {
    return { hasAccess: true, source: "free_rsvp", expiresAt: null };
  }

  const supabase = createSupabaseAdminClient();

  // 3. Cargar el evento para saber su formato (free vs paid).
  const { data: event, error: eventError } = await supabase
    .from("events")
    // @ts-ignore — events.price_mxn está en DB (migration 20260707000000)
    // pero aún no se regeneró el typegen local.
    .select("id, price_mxn, status")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event || (event as { status?: string }).status !== "published") {
    return { hasAccess: false, reason: "no_access" };
  }

  // 4. Evento free → entra.
  const evPrice = (event as { price_mxn?: number | null }).price_mxn;
  if (!evPrice || evPrice <= 0) {
    return { hasAccess: true, source: "free_rsvp", expiresAt: null };
  }

  // 5. Evento paid → buscar event_access active.
  const access = await getEventAccess(userId, eventId);
  if (access) {
    return {
      hasAccess: true,
      source: access.accessSource,
      expiresAt: access.expiresAt,
    };
  }

  return { hasAccess: false, reason: "no_access" };
}

/**
 * API específica: ¿este user pagó/compró este evento?
 *
 * Diferencia con `checkEventAccess`: esta SOLO acepta access_source ∈
 * {event_purchase, simulated_event_payment, manual_event_admin, coupon}.
 * Rechaza 'free_rsvp'.
 *
 * Útil para gated content "solo compradores".
 */
export async function checkEventPaidAccess(
  userId: string | null,
  eventId: string
): Promise<EventAccessResult> {
  const base = await checkEventAccess(userId, eventId);
  if (!base.hasAccess) return base;
  if (base.source === "free_rsvp") {
    return { hasAccess: false, reason: "no_access" };
  }
  return base;
}

/**
 * Otorga acceso al evento. Idempotente: si ya existe active access,
 * no duplica. Solo actualiza `granted_reason`. Si hay revoked/expired,
 * crea uno nuevo active.
 *
 * Usado por:
 * - Stripe webhook (Fase 1): source='event_purchase'.
 * - Simulator dev (Fase 7+): source='simulated_event_payment'.
 * - Admin manual: source='manual_event_admin'.
 * - Cupón 100%: source='coupon'.
 */
export async function grantEventAccess(params: {
  userId: string;
  eventId: string;
  source: EventAccessSource;
  paymentId?: string | null;
  expiresAt?: Date | null;
  grantedReason: string;
}): Promise<EventAccess> {
  if (!isRealMode()) {
    throw new Error(
      "[event-entitlements] grantEventAccess requiere Supabase configurado. " +
        "En demoMode no se puede persistir acceso."
    );
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // 1. Buscar si ya hay access active para (user, event).
  const { data: existing } = await (supabase
    // @ts-ignore — idem: typegen aún sin event_access.
    .from("event_access") as any)
    .select("id")
    .eq("user_id", params.userId)
    .eq("event_id", params.eventId)
    .eq("access_status", "active")
    .maybeSingle();

  if (existing) {
    // Idempotencia: refrescar reason.
    const { data: refreshed, error: updError } = await (supabase
      // @ts-ignore — idem: typegen aún sin event_access.
      .from("event_access") as any)
      .update({
        granted_reason: params.grantedReason,
        // No tocamos starts_at ni expires_at: respetamos el original.
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updError) {
      throw new Error(
        `[event-entitlements] grantEventAccess: error refrescando: ${updError.message}`
      );
    }
    return mapEventAccessRow(refreshed as EventAccessRow);
  }

  // 2. Crear uno nuevo.
  const insertPayload = {
    user_id: params.userId,
    event_id: params.eventId,
    access_status: "active",
    access_source: params.source,
    payment_id: params.paymentId ?? null,
    starts_at: now,
    expires_at: params.expiresAt ? params.expiresAt.toISOString() : null,
    granted_reason: params.grantedReason,
  };

  const { data: created, error: insError } = await (supabase
    // @ts-ignore — typegen aún sin event_access.
    .from("event_access") as any)
    .insert(insertPayload)
    .select("*")
    .single();

  if (insError) {
    throw new Error(
      `[event-entitlements] grantEventAccess: error creando: ${insError.message}`
    );
  }
  return mapEventAccessRow(created as unknown as EventAccessRow);
}

/**
 * Revoca acceso. Idempotente: si no hay active, no hace nada.
 *
 * Usado por:
 * - Stripe webhook 'charge.refunded' (Fase 4).
 * - Admin manual (cancelar comp).
 * - Expiración automática (vía cron, futuro).
 */
export async function revokeEventAccess(params: {
  userId: string;
  eventId: string;
  reason: string;
}): Promise<void> {
  if (!isRealMode()) {
    throw new Error(
      "[event-entitlements] revokeEventAccess requiere Supabase configurado."
    );
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await (supabase
    // @ts-ignore — typegen aún sin event_access.
    .from("event_access") as any)
    .update({
      access_status: "revoked",
      granted_reason: params.reason,
    })
    .eq("user_id", params.userId)
    .eq("event_id", params.eventId)
    .eq("access_status", "active");

  if (error) {
    throw new Error(
      `[event-entitlements] revokeEventAccess: error revocando: ${error.message}`
    );
  }
}
