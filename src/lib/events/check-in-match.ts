/**
 * Matching automatico entre check-in y confirmation previa.
 *
 * FIX 2026-07-03 (sesion David "no se matcheo automaticamente con el
 * confirmado"): cuando un lead confirma un evento, queda una fila en
 * `event_confirmations`. Cuando luego asiste y se checkea (QR o manual),
 * el endpoint de check-in creaba/actualizaba `event_attendees` con
 * `confirmation_id: null` en vez de linkearlo con la confirmation
 * existente. La persona quedaba contabilizada como walk-in aunque en
 * realidad se habia confirmado antes.
 *
 * Solucion: este helper resuelve el `confirmation_id` por
 * `(event_id, phone_normalized)`. Lo llama el check-in endpoint antes
 * del INSERT/UPDATE del attendee. Si no hay match, devuelve null (caso
 * walk-in legitimo: la persona asistio sin haber confirmado antes).
 *
 * Server-only. Datos personales solo aca.
 *
 * @server
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Busca una confirmation existente para el (event_id, phone_normalized)
 * y devuelve su id (FK a event_confirmations). Si no encuentra match,
 * devuelve null.
 *
 * Casos:
 *   - confirmation existe, mismo evento, mismo phone → id
 *   - no hay confirmation → null (walk-in legitimo)
 *   - DB error → null (fail-safe: permite check-in aunque falle el match,
 *     no queremos bloquear la entrada por un lookup auxiliar)
 */
export async function resolveConfirmationIdForCheckIn(
  supabase: SupabaseClient,
  eventId: string,
  phoneNormalized: string | null | undefined,
): Promise<string | null> {
  if (!phoneNormalized || !eventId) return null;
  try {
    const { data, error } = await supabase
      .from("event_confirmations")
      .select("id")
      .eq("event_id", eventId)
      .eq("phone_normalized", phoneNormalized)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { id: string };
    return row.id;
  } catch {
    // Fail-safe: si el lookup falla por cualquier razon (red, RLS, etc.)
    // no bloqueamos el check-in. Devolvemos null y se registra como walk-in.
    return null;
  }
}
