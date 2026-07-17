/**
 * Helper: asegura que existe una `event_confirmation` para un evento
 * dado por (event_id, email). Si no existe, la CREA con
 * `source='public_form'` (guest checkout directo, sin bot previo) y
 * `payment_status='paid'`. Si existe, retorna la existente sin
 * modificarla.
 *
 * FIX 2026-07-17 (sprint event-payments bug 13, David
 * "después de pagar, esperar que se registre mi pago"): antes el
 * webhook de Stripe buscaba la confirmation por (event_id, email)
 * y, si no la encontraba, retornaba `mode: "confirmation_not_found"`
 * sin crear `event_payment` ni `event_access` ni notificar al lead.
 * Resultado: el cargo se procesaba en Stripe pero NO se registraba
 * en Qlick. El lead quedaba con su pago "en el limbo".
 *
 * Caso real: David fue directo a la página de pago
 * `/pagar/evento/[slug]` (sin pasar por el flow del bot que crea la
 * confirmation con source='whatsapp_bot'). Cuando pagó con tarjeta,
 * el webhook buscó la confirmation por email, no la encontró, y
 * retornó 200 con `confirmation_not_found` sin crear nada en BD. El
 * cargo de David ($1000 MXN) quedó en Stripe como succeeded pero
 * sin evento_access ni email QR ni nada en Qlick.
 *
 * Solucion: si la confirmation no existe, la creamos en el webhook
 * con `source='public_form'` (que es el enum value correcto para
 * guest checkout web). Esto preserva la trazabilidad (el event_log
 * distingue entre lead que llego via bot vs. via web directa).
 *
 * Server-only.
 *
 * @server
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorLog } from "@/lib/log";

export interface EnsureConfirmationArgs {
  eventId: string;
  email: string;
  /** Nombre del lead (de Stripe customer_details.name o fallback). */
  name?: string | null;
  /** Teléfono normalizado (de metadata del session si lo seteamos). */
  phoneNormalized?: string | null;
  /** Phone raw (sin normalizar). */
  phoneRaw?: string | null;
  /** Origen por el que se está creando (default: 'public_form'). */
  source?: "public_form" | "whatsapp_bot" | "manual";
  /**
   * Si el caller quiere forzar un payment_status inicial (ej. el webhook
   * de Stripe lo crea como 'paid' porque el cargo ya paso). Default
   * 'paid' en el path de Stripe (consistente con la realidad del cargo).
   */
  paymentStatus?: "paid" | "pending" | "paid_manual";
}

export interface EnsureConfirmationResult {
  confirmationId: string;
  created: boolean;
  source: string;
  paymentStatus: string;
}

/**
 * Busca o crea una event_confirmation.
 *
 * IMPORTANTE: la UNIQUE constraint
 * `event_confirmations_event_id_phone_normalized_key` puede bloquear
 * la creacion si ya existe otra confirmation con el mismo phone
 * pero email distinto (o sin email). En ese caso, retornamos la
 * confirmation existente por phone en vez de crear duplicado.
 */
export async function ensureEventConfirmation(
  args: EnsureConfirmationArgs
): Promise<EnsureConfirmationResult | null> {
  const supabase = createSupabaseAdminClient();
  const { eventId, email, name, phoneNormalized, phoneRaw, source, paymentStatus } = args;

  // 1. Buscar por (event_id, email) primero.
  try {
    // FIX typegen stale: payment_status no aparece en
    // event_confirmations en el typegen local. Regenerar con
    // `supabase gen types typescript --local` cuando crucemos
    // el sprint de housekeeping. Por ahora, hacemos un select sin
    // payment_status y leemos ese campo via un query separado
    // cuando lo necesitamos downstream.
    const { data: byEmail } = await supabase
      .from("event_confirmations" as never)
      .select("id, source, name, email, phone_normalized")
      .eq("event_id", eventId)
      .eq("email", email)
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byEmail) {
      // Cast through any porque el typegen no reconoce
      // payment_status en event_confirmations (migration
      // 20260714230000). La columna SI existe en DB.
      const conf = byEmail as any as {
        id: string;
        source: string;
      };
      return {
        confirmationId: conf.id,
        created: false,
        source: conf.source,
        paymentStatus: "paid",
      };
    }
  } catch (err) {
    errorLog("[ensureEventConfirmation] lookup by email throw", {
      eventId,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Si no encontro por email, buscar por phone (caso de
  //    confirmation creada con email placeholder/incorrecto).
  if (phoneNormalized) {
    try {
      const { data: byPhone } = await supabase
        .from("event_confirmations" as never)
        .select("id, source, name, email, phone_normalized")
        .eq("event_id", eventId)
        .eq("phone_normalized", phoneNormalized)
        .order("confirmed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPhone) {
        // Cast through any (mismo motivo que arriba).
        const conf = byPhone as any as {
          id: string;
          source: string;
        };
        // FIX: actualizar email si era placeholder y ahora tenemos el real.
        // Cast through any porque el typegen no reconoce la columna email
        // en byPhone (select solo trae id/source/name/email/phone_normalized
        // — pero el typegen devuelve never para este subset).
        const byPhoneAny = byPhone as any;
        if (email && (!byPhoneAny.email || !byPhoneAny.email.includes("@"))) {
          // Solo actualizamos email; payment_status ya lo setea el
          // caller downstream (webhook stripe lo hace via update
          // post-GRANT). Aqui solo arreglamos el email.
          await supabase
            .from("event_confirmations" as never)
            .update({ email } as never)
            .eq("id", conf.id as never);
        }
        return {
          confirmationId: conf.id,
          created: false,
          source: conf.source,
          paymentStatus: "paid",
        };
      }
    } catch (err) {
      errorLog("[ensureEventConfirmation] lookup by phone throw", {
        eventId,
        phoneNormalized,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. No existe: crear. Si choca con UNIQUE constraint, intentar
  //    otra vez con un fallback a una busqueda amplia.
  const safeName = (name && name.trim()) || "Asistente";
  const safePhone = phoneNormalized || phoneRaw || null;
  try {
    const { data: created, error: insertErr } = await supabase
      .from("event_confirmations" as never)
      .insert({
        event_id: eventId,
        name: safeName,
        email,
        phone_normalized: safePhone,
        phone_raw: phoneRaw ?? null,
        source: source ?? "public_form",
        payment_status: paymentStatus ?? "paid"
      } as never)
      .select("id, source")
      .single();
    if (insertErr) {
      // 23505 = unique violation: otra confirmation con mismo
      // (event_id, phone_normalized). Buscar y retornar esa.
      if (insertErr.code === "23505" && safePhone) {
        const { data: fallback } = await supabase
          .from("event_confirmations" as never)
          .select("id, source")
          .eq("event_id", eventId)
          .eq("phone_normalized", safePhone)
          .limit(1)
          .maybeSingle();
        if (fallback) {
          const fb = fallback as any as {
            id: string;
            source: string;
          };
          return {
            confirmationId: fb.id,
            created: false,
            source: fb.source,
            paymentStatus: "paid",
          };
        }
      }
      errorLog("[ensureEventConfirmation] insert fallo", {
        eventId,
        email,
        code: insertErr.code,
        message: insertErr.message,
      });
      return null;
    }
    if (!created) return null;
    const c = created as any as {
      id: string;
      source: string;
    };
    return {
      confirmationId: c.id,
      created: true,
      source: c.source,
      paymentStatus: "paid",
    };
  } catch (err) {
    errorLog("[ensureEventConfirmation] insert throw", {
      eventId,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
