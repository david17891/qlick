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
 * FIX 2026-07-14 (Sprint v0.10 Bloque 3): parsea un `leads.name` que
 * puede tener tags de origen entre corchetes, y lo separa en first/last.
 *
 * Caso típico: cuando un lead llega de un evento o masterclass, el
 * nombre se persiste con un prefijo de origen entre corchetes:
 *   - "[MASTERCLASS] María López"  → firstName="María", lastName="López"
 *   - "[WEBINAR] Juan Pérez"       → firstName="Juan", lastName="Pérez"
 *   - "Ana Ruiz"                   → firstName="Ana", lastName="Ruiz"
 *   - "Carlos"                     → firstName="Carlos", lastName=undefined
 *   - "[REFERRAL]  Pedro  Paramo " → firstName="Pedro", lastName="Paramo"
 *   - ""                           → firstName=undefined, lastName=undefined
 *   - "[TAG]" (sin nombre)         → firstName=undefined, lastName=undefined
 *
 * Reglas:
 *   1. Quitar cualquier secuencia `[...]` al inicio del string (case
 *      insensitive, uno o más tags). Soporta `[TAG]`, `[TAG1][TAG2]`.
 *   2. Trim del string restante.
 *   3. Si queda vacío → firstName y lastName undefined.
 *   4. Split por whitespace. Primer token = firstName, resto = lastName
 *      (joined con un espacio). Si solo hay 1 token, lastName = undefined.
 *
 * Decisión: NO validar que el firstName/lastName sean "nombre humano"
 * real (e.g. que no tengan dígitos). El caller (CRM admin) puede ver
 * el `name` original y corregir manualmente si hay garbage. El parseo
 * es best-effort, no bloqueante.
 *
 * Decisión: NO persistir firstName/lastName en DB. Se computan
 * on-the-fly cada vez que se mapea. El `name` es la fuente de verdad
 * (puede ser modificado manualmente por el admin vía el panel).
 */
export function parseLeadName(rawName: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  if (!rawName) return {};
  // 1. Quitar corchetes al inicio: [TAG], [TAG1][TAG2], etc.
  // Soporta tags en MAYÚSCULAS, mixed case. Trim después.
  const stripped = rawName
    .replace(/^\s*(?:\[[^\]]*\]\s*)+/g, "")
    .trim();
  if (!stripped) return {};
  // 2. Split por whitespace. Filtrar tokens vacíos (caso "  Ana  Ruiz  ").
  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};
  if (tokens.length === 1) {
    return { firstName: tokens[0] };
  }
  // Primer token = firstName, resto joined = lastName.
  return {
    firstName: tokens[0],
    lastName: tokens.slice(1).join(" "),
  };
}

/**
 * Convierte una fila de la DB a un `Lead` del dominio.
 *
 * Los enums de la DB (`Database["public"]["Enums"]`) son literales idénticos a
 * los del dominio (`LeadStatus`/`LeadSource`/`LeadIntent`), por lo que la
 * asignación es directa. Si algún día divergen, este mapper es el único punto
 * donde añadir la conversión explícita.
 */
export function mapLeadRowToLead(row: LeadRow): Lead {
  // FIX 2026-07-14 (Sprint v0.10 Bloque 3): extraer firstName/lastName
  // del `name`, ignorando tags de origen entre corchetes. Ver
  // `parseLeadName` arriba para las reglas completas.
  const parsedName = parseLeadName(row.name);
  return {
    id: row.id,
    name: row.name,
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
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
    // FIX 2026-07-18 (audit): typegen regenerado cubre estos campos.
    // FIX 2026-07-06 (G-15 r4): el `?? undefined` convierte null→undefined
    // para satisfacer el tipo `Lead` (opcional = T | undefined).
    score: row.score ?? undefined,
    qualification: (row.qualification ?? undefined) as Lead["qualification"],
    surveyOfferSentAt: row.survey_offer_sent_at ?? undefined,
    // FIX 2026-07-08: pause bot per-lead. El bot-engine chequea este
    // flag en processInboundMessage y NO responde si está activo.
    botPaused: row.bot_paused === true,
    botPausedAt: row.bot_paused_at ?? null,
    botPausedByEmail: row.bot_paused_by_email ?? null,
    // Sprint v15 PR #1: razón de la pausa (keyword_escalation / ai_semantic_escalation / manual).
    botPausedReason:
      (row.bot_paused_reason ?? null) as Lead["botPausedReason"],
    // `message` no se expone en el tipo Lead (privacidad); queda en la DB.
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
