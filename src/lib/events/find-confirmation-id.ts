/**
 * Helper compartido: busca el confirmationId de un lead para un evento.
 *
 * FIX 2026-07-16 (auditoria scanner cobro-en-puerta): se movio aqui
 * la logica que estaba local en `app/api/webhooks/stripe/route.ts`
 * (funcion `findConfirmationIdForEvent`) para que el simulator dev y
 * cualquier otro caller pueda reusarla sin duplicar.
 *
 * Como `event_confirmations` no tiene `lead_id` (se identifica por
 * phone_normalized o email), el lookup es:
 *   1. Traer el lead (por id).
 *   2. Buscar confirmation mas reciente con mismo phone o email
 *      y mismo event_id.
 *
 * Server-only. Usa service role, bypass RLS.
 *
 * @server
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function findConfirmationIdForEvent(args: {
  eventId: string;
  leadId: string;
}): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  // 1) Traer el lead.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, phone_normalized, email")
    .eq("id", args.leadId)
    .maybeSingle();
  if (!lead) return null;
  const leadPhone = (lead as { phone_normalized?: string | null })
    .phone_normalized;
  const leadEmail = (lead as { email?: string | null }).email;

  // 2) Buscar confirmation por phone o email (la mas reciente).
  if (!leadPhone && !leadEmail) return null;
  let q = supabase
    .from("event_confirmations")
    .select("id, phone_normalized, email, confirmed_at")
    .eq("event_id", args.eventId)
    .order("confirmed_at", { ascending: false })
    .limit(10);
  if (leadPhone) {
    q = q.eq("phone_normalized", leadPhone);
  } else if (leadEmail) {
    q = q.eq("email", leadEmail);
  }
  const { data: rows } = await q;
  if (rows && rows.length > 0) {
    return (rows[0] as unknown as { id: string }).id;
  }
  return null;
}
