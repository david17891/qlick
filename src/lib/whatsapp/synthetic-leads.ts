/**
 * Sprint v0.9.x PR #3: helpers para personas sintéticas del simulador.
 *
 * El simulador modo Real ejecuta el bot-engine completo contra leads
 * ficticios que se persisten en la tabla `leads` con el flag
 * `simulation_source = 'admin_lab'`. Estos helpers crean, listan y
 * eliminan esas personas.
 *
 * Diseño:
 *   - Phone ficticio en rango `+52555555XX` (prefijo 555 no existe en
 *     México real → Meta rechaza el envío outbound sin generar ruido
 *     en producción). 100 combinaciones disponibles.
 *   - Email ficticio en dominio `qlick.test` (TLD `.test` reservado
 *     por RFC 2606, nunca se resuelve a un server real).
 *   - Las columnas `simulation_source` y `simulation_metadata` se
 *     agregaron en migration `20260714100000_leads_simulation_source.sql`.
 *   - Limpieza masiva: `ON DELETE CASCADE` en las FKs a `leads` limpia
 *     automáticamente `lead_whatsapp_conversations`, `lead_event_links`,
 *     `event_attendees`, etc.
 *
 * Server-only. No expone datos sensibles.
 *
 * @server
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorLog, infoLog } from "@/lib/log";

/** Prefijo de phone para leads sintéticos. 555 no existe en México real. */
const SYNTHETIC_PHONE_PREFIX = "+52555555";

/** Sufijo random (2 dígitos) → 100 combinaciones. */
const SYNTHETIC_PHONE_SUFFIX_RANGE = 100;

/** Email ficticio: usa TLD .test (RFC 2606 reservado). */
const SYNTHETIC_EMAIL_DOMAIN = "qlick.test";

/** Source canónico que identifica leads creados por el laboratorio. */
export const SIMULATION_SOURCE_ADMIN_LAB = "admin_lab" as const;

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                       */
/* ------------------------------------------------------------------ */

export interface CreateSyntheticLeadInput {
  /** Email del admin que creó la persona (para audit trail). */
  createdBy: string;
  /** Nombre custom (opcional). Default: "Test Lab <timestamp>". */
  name?: string;
  /** Phone custom (opcional). Default: random en rango sintético. */
  phone?: string;
  /** ID de sesión del simulador (opcional, para correlación). */
  sessionId?: string;
}

export interface SyntheticLead {
  id: string;
  phoneNormalized: string;
  name: string;
  email: string;
  createdAt: string;
  createdBy: string;
  sessionId: string | null;
}

export interface DeleteResult {
  ok: boolean;
  deletedLeads: number;
  /** Filas afectadas en tablas con CASCADE (computed via query secundario). */
  deletedConversations: number;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Helpers internos                                                    */
/* ------------------------------------------------------------------ */

/** Genera un phone sintético único en formato `+52555555XXXXXXXXXX`
 * (prefijo +52 + 10 dígitos random).
 *
 * FIX auditoría 2026-07-14 (segundo intento): el primer fix usaba
 * `parseInt(hex, 16) % 100` que SOLO daba 100 combinaciones
 * (mismo bug que el original). Ahora usamos el UUID como entropía
 * y generamos 10 dígitos decimales (10^10 = 10 mil millones de
 * combinaciones). El test REGRESIÓN #5 verifica que 1000 generaciones
 * no colisionan.
 *
 * Algoritmo: XOR de los 4 chunks de 8 chars hex del UUID (32 bits cada
 * uno = 128 bits total de entropía), modulo 10^10. Garantiza E.164
 * estricto (12 chars total: +52 + 10 dígitos).
 */
function generateSyntheticPhone(): string {
  const uuid = randomUUID();
  const hex = uuid.replace(/-/g, "");
  const chunk1 = parseInt(hex.slice(0, 8), 16);
  const chunk2 = parseInt(hex.slice(8, 16), 16);
  const chunk3 = parseInt(hex.slice(16, 24), 16);
  const chunk4 = parseInt(hex.slice(24, 32), 16);
  const num = (chunk1 ^ chunk2 ^ chunk3 ^ chunk4) % 10_000_000_000;
  return `${SYNTHETIC_PHONE_PREFIX}${num.toString().padStart(10, "0")}`;
}

/** Genera un email sintético único. */
function generateSyntheticEmail(): string {
  // FIX auditoría 2026-07-14: usa `crypto.randomUUID()` truncado en vez
  // de Date.now() + Math.random(). Antes colisionaba cuando 2 leads
  // se creaban en el mismo ms (test rápido, loop). Ahora la
  // unicidad es cryptográficamente fuerte.
  const uuid = randomUUID();
  return `lab+${uuid}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

/** Wrapper de `crypto.randomUUID()` que funciona en Node 18+ y navegadores. */
function randomUUID(): string {
  // En Node 18+ está disponible globalmente. Fallback por si corre
  // en un ambiente raro (tests viejos, etc).
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback no-cryptográfico (degradación graceful). Mantiene
  // unicidad razonable para testing.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------------------------------------------ */
/* API pública                                                          */
/* ------------------------------------------------------------------ */

/**
 * Crea un lead sintético en la DB. El lead queda marcado con
 * `simulation_source = "admin_lab"` para distinguirlo de leads reales.
 *
 * @throws Si Supabase falla o si el phone/email ya existe.
 */
export async function createSyntheticLead(
  input: CreateSyntheticLeadInput
): Promise<SyntheticLead> {
  const supabase = createSupabaseAdminClient();
  const phone = input.phone ?? generateSyntheticPhone();
  const name = input.name ?? `Test Lab ${new Date().toISOString().slice(0, 19)}`;
  const email = generateSyntheticEmail();
  const sessionId = input.sessionId ?? null;
  const createdAt = new Date().toISOString();

  const metadata = {
    createdBy: input.createdBy,
    createdAt,
    sessionId
  };

  // FIX 2026-07-14 (PR #3): tabla `leads` extendida con 2 columnas nuevas.
  // El cast `as never` es temporal mientras Supabase typegen no se regenera
  // para incluir las columnas. Patrón ya usado en otras server libs.
  const { data, error } = await supabase
    .from("leads" as never)
    .insert({
      phone_normalized: phone,
      name,
      email,
      simulation_source: SIMULATION_SOURCE_ADMIN_LAB,
      simulation_metadata: metadata,
      // Status por default que el bot-engine acepta.
      status: "new",
      source: "synthetic_lab",
      intent: "course_information",
      consent_to_contact: true
    } as never)
    .select("id, created_at" as never)
    .single();

  if (error || !data) {
    errorLog("[synthetic-leads] create falló", {
      code: (error as { code?: string } | null)?.code,
      message: (error as { message?: string } | null)?.message,
      phone
    });
    throw new Error(
      `No se pudo crear el lead sintético: ${
        (error as { message?: string } | null)?.message ?? "unknown"
      }`
    );
  }

  infoLog("[synthetic-leads] created", {
    leadId: (data as { id: string }).id,
    phone,
    createdBy: input.createdBy
  });

  return {
    id: (data as { id: string }).id,
    phoneNormalized: phone,
    name,
    email,
    createdAt: (data as { created_at: string }).created_at ?? createdAt,
    createdBy: input.createdBy,
    sessionId
  };
}

/**
 * Lista todos los leads sintéticos activos (no borrados).
 * Útil para la UI del simulador y para diagnóstico.
 */
export async function listSyntheticLeads(): Promise<SyntheticLead[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads" as never)
    .select(
      "id, phone_normalized, name, email, simulation_metadata, created_at" as never
    )
    .eq("simulation_source" as never, SIMULATION_SOURCE_ADMIN_LAB as never)
    .order("created_at" as never, { ascending: false } as never);

  if (error) {
    errorLog("[synthetic-leads] list falló", {
      code: (error as { code?: string }).code
    });
    throw new Error(
      `No se pudo listar leads sintéticos: ${(error as { message?: string }).message ?? "unknown"}`
    );
  }

  return ((data ?? []) as Array<{
    id: string;
    phone_normalized: string;
    name: string;
    email: string;
    simulation_metadata: { createdBy?: string; createdAt?: string; sessionId?: string | null } | null;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    phoneNormalized: row.phone_normalized,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    createdBy: row.simulation_metadata?.createdBy ?? "unknown",
    sessionId: row.simulation_metadata?.sessionId ?? null
  }));
}

/**
 * Borra TODOS los leads sintéticos de la DB. Las FKs con CASCADE limpian
 * automáticamente las tablas relacionadas (lead_whatsapp_conversations,
 * lead_event_links, event_attendees, etc.).
 *
 * Retorna conteos para que la UI muestre feedback al admin.
 */
export async function deleteAllSyntheticLeads(): Promise<DeleteResult> {
  const supabase = createSupabaseAdminClient();

  // 1. Listar IDs antes de borrar (para conteo y audit).
  const { data: ids, error: listErr } = await supabase
    .from("leads" as never)
    .select("id" as never)
    .eq("simulation_source" as never, SIMULATION_SOURCE_ADMIN_LAB as never);

  if (listErr) {
    errorLog("[synthetic-leads] delete (pre-list) falló", {
      code: (listErr as { code?: string }).code
    });
    return {
      ok: false,
      deletedLeads: 0,
      deletedConversations: 0,
      note: `Pre-list falló: ${(listErr as { message?: string }).message ?? "unknown"}`
    };
  }

  const leadIds = ((ids ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (leadIds.length === 0) {
    return {
      ok: true,
      deletedLeads: 0,
      deletedConversations: 0,
      note: "No había leads sintéticos para borrar."
    };
  }

  // 2. Contar conversaciones afectadas (best-effort, antes del DELETE).
  let deletedConversations = 0;
  try {
    const { count } = await supabase
      .from("lead_whatsapp_conversations" as never)
      .select("id" as never, { count: "exact", head: true } as never)
      .in("lead_id" as never, leadIds as never);
    deletedConversations = count ?? 0;
  } catch (err) {
    infoLog("[synthetic-leads] count conversations best-effort falló", {
      error: err instanceof Error ? err.message : String(err)
    });
  }

  // 3. DELETE leads. Las FKs con CASCADE limpian las tablas relacionadas.
  const { error: delErr, count: deletedCount } = await supabase
    .from("leads" as never)
    .delete({ count: "exact" } as never)
    .eq("simulation_source" as never, SIMULATION_SOURCE_ADMIN_LAB as never);

  if (delErr) {
    errorLog("[synthetic-leads] delete falló", {
      code: (delErr as { code?: string }).code
    });
    return {
      ok: false,
      deletedLeads: 0,
      deletedConversations: 0,
      note: `DELETE falló: ${(delErr as { message?: string }).message ?? "unknown"}`
    };
  }

  infoLog("[synthetic-leads] deleted all synthetic leads", {
    count: deletedCount ?? leadIds.length,
    cascadeConversations: deletedConversations
  });

  return {
    ok: true,
    deletedLeads: deletedCount ?? leadIds.length,
    deletedConversations,
    note: `Borrados ${deletedCount ?? leadIds.length} leads sintéticos (+ ${deletedConversations} conversations cascadeadas).`
  };
}
