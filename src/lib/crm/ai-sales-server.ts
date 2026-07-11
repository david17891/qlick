/**
 * Generador dinámico de mensajes para el Agente IA Comercial (Fase 3).
 *
 * Antes (mock): `getAgentReplyTemplate(intent, lead)` devolvía un string
 * estático según `lead.intent`. Sin contexto.
 *
 * Ahora (Fase 3): `generateSalesSuggestionsForLead(leadId)` lee el perfil
 * completo del lead + sus respuestas de encuesta (si existen) y genera
 * 3 opciones DIFERENCIADAS:
 *
 *   1. Cierre / Hot     → enfoca en inscripción + links de pago.
 *      Se usa cuando `score >= 60` o `qualification === 'hot'`.
 *   2. Valor / Warm    → envía temario y resuelve dudas técnicas.
 *      Se usa cuando `40 <= score < 60`.
 *   3. Reactivación / Cold → saludo corto amable.
 *      Se usa cuando `score < 40` o el lead está sin score.
 *
 * Cada sugerencia incluye:
 *   - `intent`: "close" | "value" | "reactivate" (no LeadIntent — eso
 *     es el intent ORIGINAL del lead, otra cosa).
 *   - `message`: texto personalizado con placeholders sustituidos.
 *   - `whatsappUrl`: link wa.me completo listo para abrir WhatsApp Web.
 *
 * Server-only. Si Supabase no está configurado, devuelve `[]` y el UI
 * cae al mock fallback.
 *
 * Lógica pura extraída a `./sales-templates.ts` para que sea testeable
 * sin Supabase (audit scripts + tests).
 *
 * @server
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getLeadById } from "./leads-server";
import {
  buildSalesSuggestions,
  buildWhatsAppLink,
  type SalesIntent,
} from "./sales-templates";

export type { SalesIntent } from "./sales-templates";

export interface SalesSuggestion {
  intent: SalesIntent;
  label: string;
  message: string;
  whatsappUrl: string;
  angle: string;
}

/* ------------------------------------------------------------------ */
/* Re-exports para compatibilidad con callers existentes               */
/* ------------------------------------------------------------------ */

export { buildWhatsAppLink };

/**
 * Lee las respuestas de la encuesta más reciente del lead (si existen).
 * Devuelve un objeto con keys legibles o `{}` si no hay encuesta.
 */
async function fetchLatestSurveyResponses(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  leadId: string,
): Promise<Record<string, unknown>> {
  // `q_consent` y `q_business` viven dentro de `responses` (JSON), no como
  // columnas top-level. La columna top-level equivalente es `consent_to_contact`
  // (boolean) — ya viene agregada en el spread del caller.
  const { data } = await supabase
    .from("event_surveys")
    .select("responses")
    .eq("promoted_to_lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return {};
  return (data.responses as Record<string, unknown> | null) ?? {};
}

/**
 * Genera hasta 3 sugerencias personalizadas para un lead. La cantidad
 * devuelta depende del score:
 *
 * - score >= 60  → 3 sugerencias (close / value / reactivate).
 * - 40 ≤ score < 60 → 2 sugerencias (value / reactivate).
 * - score < 40 o null → 1 sugerencia (reactivate).
 *
 * Si el lead no tiene teléfono, devuelve `[]` (no podemos generar wa.me
 * links sin número).
 */
export async function generateSalesSuggestionsForLead(
  leadId: string,
): Promise<SalesSuggestion[]> {
  if (!checkSupabaseConfig().configured) {
    return [];
  }

  const supabase = createSupabaseAdminClient();

  // 1. Cargar el lead (incluye score/qualification).
  const lead = await getLeadById(leadId);
  if (!lead || !lead.phone) return [];

  // 2. Cargar respuestas de encuesta (opcional, puede no haber).
  const surveyResponses = await fetchLatestSurveyResponses(supabase, leadId);

  const courseFromSurvey =
    typeof surveyResponses.course_of_interest === "string"
      ? (surveyResponses.course_of_interest as string)
      : null;
  const courseInterest = courseFromSurvey ?? lead.courseOfInterest ?? null;

  // 3. Reusar el builder puro (idéntico comportamiento que el test directo).
  return buildSalesSuggestions(lead, courseInterest);
}