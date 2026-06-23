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
    status: row.status,
    source: row.source,
    intent: row.intent,
    ownerId: row.owner_id ?? undefined,
    tags: row.tags ?? undefined,
    summary: row.summary ?? undefined,
    estimatedValueMXN:
      row.estimated_value_mxn == null ? undefined : Number(row.estimated_value_mxn),
    nextFollowUpAt: row.next_follow_up_at ?? undefined,
    consentToContact: row.consent_to_contact,
    // `message` no se expone en el tipo Lead (privacidad); queda en la DB.
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
