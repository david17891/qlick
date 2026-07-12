/**
 * Mapper entre la fila de Postgres (snake_case) y el tipo `Lead` (camelCase)
 * de `src/types/crm.ts`.
 *
 * Mantiene la firma pública del CRM (camelCase) desacoplada del schema físico
 * de la DB. Si la migración cambia un nombre de columna, solo se toca aquí.
 *
 * Los tipos de la fila vienen ahora del typegen de Supabase
 * (`src/types/supabase.ts`), así que `LeadRow`/`LeadInsert` reflejan el schema
 * real y el query builder del cliente admin queda tipado de punta a punta.
 */

import type { Database } from "@/types/supabase";
import type {
  Lead,
  LeadStatus,
  LeadSource,
  LeadIntent,
} from "@/types";

/**
 * Fila de `public.leads` tal como la devuelve Supabase. Derivada del typegen,
 * así que cualquier cambio de schema se propaga en compilación.
 */
export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

/**
 * Payload de inserción crudo según el schema. Útil para inserts genéricos.
 */
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

/**
 * Payload de inserción DESDE EL FORMULARIO.
 *
 * Es un `LeadInsert` con los campos que el formulario siempre provee marcados
 * como obligatorios (defensa en profundidad: la política de RLS y el server
 * action también los exigen). `message` se conserva aquí (no en `Lead`) para
 * que el texto del lead quede registrado pero no sea accesible por el dominio
 * público.
 */
export type InsertLeadPayload = Omit<
  LeadInsert,
  "status" | "source" | "intent" | "consent_to_contact"
> & {
  status: LeadStatus;
  source: LeadSource;
  intent: LeadIntent;
  consent_to_contact: boolean;
};

/**
 * Convierte una fila de la DB a un `Lead` del dominio.
 *
 * Los enums de la DB (`Database["public"]["Enums"]`) son literales idénticos a
 * los del dominio (`LeadStatus`/`LeadSource`/`LeadIntent`), por lo que la
 * asignación es directa. Si algún día divergen, este mapper es el único punto
 * donde añadir la conversión explícita.
 */
export function mapLeadRowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    courseOfInterest: row.course_of_interest ?? undefined,
    status: row.status as LeadStatus,
    source: row.source,
    intent: row.intent,
    ownerId: row.owner_id ?? undefined,
    tags: row.tags ?? undefined,
    summary: row.summary ?? undefined,
    estimatedValueMXN:
      row.estimated_value_mxn == null ? undefined : Number(row.estimated_value_mxn),
    nextFollowUpAt: row.next_follow_up_at ?? undefined,
    consentToContact: row.consent_to_contact,
    // Bloque 2: estado de WhatsApp follow-up (migration 20260628000000).
    whatsappStatus: (row.whatsapp_status ?? "no_contactado") as
      | "no_contactado"
      | "contactado"
      | "interested"
      | "lost",
    lastContactedAt: row.last_contacted_at ?? undefined,
    // Bloque 3: scoring post-survey (migration 20260704200000).
    // FIX 2026-07-06 (G-15 r4): estos campos se persisten en la fila
    // pero el typegen los marca como "Re-generar typegen" — los
    // casteamos explícitamente porque LeadRow los incluye como
    // `score`/`qualification` desde que corrió la migration.
    score:
      typeof (row as unknown as { score?: number | null }).score === "number"
        ? (row as unknown as { score: number }).score
        : undefined,
    qualification: ((row as unknown as { qualification?: string | null })
      .qualification ?? undefined) as Lead["qualification"],
    surveyOfferSentAt:
      (row as unknown as { survey_offer_sent_at?: string | null })
        .survey_offer_sent_at ?? undefined,
    // FIX 2026-07-08: pause bot per-lead. El bot-engine chequea este
    // flag en processInboundMessage y NO responde si está activo.
    // Cast a `never` hasta regenerar el typegen post-migration
    // (`supabase gen types`).
    botPaused:
      (row as unknown as { bot_paused?: boolean }).bot_paused === true,
    botPausedAt:
      (row as unknown as { bot_paused_at?: string | null })
        .bot_paused_at ?? null,
    botPausedByEmail:
      (row as unknown as { bot_paused_by_email?: string | null })
        .bot_paused_by_email ?? null,
    // Sprint v15 PR #1: razón de la pausa (keyword_escalation / ai_semantic_escalation / manual).
    botPausedReason:
      ((row as unknown as { bot_paused_reason?: string | null })
        .bot_paused_reason ?? null) as Lead["botPausedReason"],
    // `message` no se expone en el tipo Lead (privacidad); queda en la DB.
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
