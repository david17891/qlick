/**
 * Acceso a leads con persistencia real en Supabase y fallback a mocks.
 *
 * Server-only. Usa el cliente admin (service role) para bypassar RLS en
 * lecturas del CRM y en la inserción desde el formulario (para que el insert
 * no dependa de la sesión del usuario, solo del consentimiento validado).
 *
 * REGLA DE FALLBACK:
 * - Si Supabase NO está configurado (checkSupabaseConfig().configured === false),
 *   todas las funciones caen al mock existente (`src/lib/crm/crm-service.ts`)
 *   y devuelven resultados etiquetados como demo. Así la app sigue 100%
 *   funcional en modo demo y la migración es transparente.
 *
 * Si Supabase SÍ está configurado, las funciones usan la tabla `public.leads`
 * (ver supabase/migrations/20260623000001_init_leads.sql).
 *
 * Importante: este módulo se importa desde Server Components / Server Actions /
 * Route Handlers. NUNCA desde un Client Component (expuesto en la firma pública
 * del index del CRM pero con la advertencia documentada).
 *
 * @server
 */

import type { Lead } from "@/types";
import type { LeadEventLinkType } from "@/types/events";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  mapLeadRowToLead,
  type InsertLeadPayload,
} from "./leads-mapper";
import { normalizePhone, phonesMatch } from "./phone-utils";
import type { Database } from "@/types/supabase";

// Fallback a mocks (mismo módulo que usa hoy el CRM demo).
import {
  getLeads as getLeadsMock,
  getLeadById as getLeadByIdMock,
} from "./crm-service";

/** ¿Está activa la persistencia real? */
function isRealMode(): boolean {
  // En el navegador siempre es demo (este módulo no debería cargarse ahí, pero
  // defendemos por las dudas). typeof window check cubre el caso.
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/* --------------------------- Lecturas --------------------------- */

/**
 * Devuelve todos los leads (reales si hay Supabase, mocks si no).
 * Server-only.
 */
export async function getLeads(): Promise<Lead[]> {
  if (!isRealMode()) {
    return getLeadsMock();
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    // No exponemos el detalle del error al caller; caemos a mock para no romper
    // la UI. Se loggea para diagnóstico del operador.
    // eslint-disable-next-line no-console
    console.error("[leads-server] getLeads falló; usando mocks", {
      code: error.code,
    });
    return getLeadsMock();
  }
  return (data ?? []).map((row) => mapLeadRowToLead(row));
}

/**
 * Devuelve un lead por id. `undefined` si no existe.
 * Server-only.
 */
export async function getLeadById(id: string): Promise<Lead | undefined> {
  if (!isRealMode()) {
    return getLeadByIdMock(id);
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[leads-server] getLeadById falló", { code: error.code, id });
    return getLeadByIdMock(id);
  }
  if (!data) return undefined;
  return mapLeadRowToLead(data);
}

/**
 * Busca un lead por email (case-insensitive, trimmed). Server-only.
 *
 * El email se normaliza a lowercase antes de la query (la columna `email`
 * se persiste lowercased en `createLead`, pero el caller puede no saberlo).
 *
 * Si hay varios leads con el mismo email (no debería pasar, pero si la
 * dedup falló en el pasado), devuelve el más reciente.
 *
 * Devuelve `null` si no hay match.
 */
export async function findLeadByEmail(
  email: string,
): Promise<Lead | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  if (!isRealMode()) {
    // Fallback a mock: búsqueda lineal en los datos demo.
    const mockList = getLeadsMock();
    const found = mockList.find(
      (l) => l.email?.trim().toLowerCase() === normalized,
    );
    return found ?? null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .ilike("email", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[leads-server] findLeadByEmail falló", {
      code: error.code,
      emailLength: normalized.length,
    });
    return null;
  }
  if (!data) return null;
  return mapLeadRowToLead(data);
}

/**
 * Busca un lead por teléfono. El input se normaliza con `normalizePhone()`
 * (formato E.164 MX) antes de la query. Server-only.
 *
 * IMPORTANTE: la búsqueda es por EXACT match del teléfono normalizado.
 * Como `leads.phone` se guarda tal cual (sin normalizar a nivel de DB
 * todavía), esta función normaliza CADA fila del resultado y compara.
 * Si la base tiene teléfonos en formatos variados, los unificamos acá.
 *
 * Devuelve el lead más reciente si hay varios con el mismo phone.
 * `null` si no hay match o el input no se puede normalizar.
 */
export async function findLeadByPhone(
  phone: string,
): Promise<Lead | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  if (!isRealMode()) {
    // Fallback a mock: el mock puede tener formatos variados, normalizamos
    // cada uno y comparamos con el input ya normalizado.
    const mockList = getLeadsMock();
    const found = mockList.find((l) => phonesMatch(l.phone ?? null, normalized));
    return found ?? null;
  }

  const supabase = createSupabaseAdminClient();
  // Primero, una query amplia que traiga candidatos con `phone` no nulo.
  // Como la columna no está normalizada en DB, comparamos post-query.
  // Límite alto pero acotado: si llega a más de 200 leads con phone,
  // la query es lenta, pero para MVP está bien. Optimizar después con
  // un índice en phone_normalized cuando se agregue la columna.
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .not("phone", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[leads-server] findLeadByPhone falló", {
      code: error.code,
    });
    return null;
  }
  if (!data || data.length === 0) return null;

  for (const row of data) {
    const rowPhone = (row as { phone: string | null }).phone;
    if (phonesMatch(rowPhone, normalized)) {
      return mapLeadRowToLead(row as Parameters<typeof mapLeadRowToLead>[0]);
    }
  }
  return null;
}

/* --------------------------- Escritura --------------------------- */

/** Input público del formulario (camelCase, alineado con CreateLeadInput). */
export interface CreateLeadServerInput {
  name: string;
  email: string;
  phone?: string;
  courseOfInterest?: string;
  /** Se asume 'new' para inserts del formulario; el mapper lo impone. */
  intent?: Lead["intent"];
  source?: Lead["source"];
  message?: string;
  /** Requerido: la política de RLS lo exige. */
  consentToContact: boolean;
}

export interface CreateLeadServerResult {
  ok: boolean;
  /** Id real (uuid) si persistió; id demo si cayó a mock. */
  leadId: string;
  /** true si se persistió en Supabase; false si fue demo/fallback. */
  persisted: boolean;
  /** Mantenido por compatibilidad con CreateLeadResult del mock. */
  demo: boolean;
  note: string;
}

/**
 * Crea un lead. Persiste en Supabase si está configurado; si no, cae al mock
 * (`demo: true`). Server-only.
 *
 * El caller (server action del formulario) valida consentimiento antes de
 * llamar; aquí se vuelve a verificar por defensa en profundidad.
 */
export async function createLead(
  input: CreateLeadServerInput,
): Promise<CreateLeadServerResult> {
  // Defensa en profundidad: sin consentimiento, no se crea nada.
  if (!input.consentToContact) {
    return {
      ok: false,
      leadId: "",
      persisted: false,
      demo: true,
      note: "Falta consentimiento explícito para crear el lead.",
    };
  }

  if (!isRealMode()) {
    // Fallback a mock (mantiene la firma existente para no romper la UI).
    const { createLeadFromContactForm } = await import("./crm-service");
    const mock = createLeadFromContactForm({
      name: input.name,
      email: input.email,
      phone: input.phone,
      courseOfInterest: input.courseOfInterest,
      intent: input.intent ?? "course_information",
      source: input.source ?? "website",
      message: input.message,
      consentToContact: true,
    });
    return {
      ok: mock.ok,
      leadId: mock.leadId,
      persisted: false,
      demo: true,
      note: mock.note,
    };
  }

  const payload: InsertLeadPayload = {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    course_of_interest: input.courseOfInterest?.trim() || null,
    status: "new",
    source: input.source ?? "website",
    intent: input.intent ?? "course_information",
    consent_to_contact: true,
    message: input.message?.trim() || null,
  };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    // Defensa en profundidad (consistente con el resto de Fase 2):
    // si Supabase falla, NO enmascaramos el error cayendo al mock.
    // Hacerlo pierde leads silenciosamente (admin ve un leadId que no
    // existe en DB). El caller (server action del formulario) debe
    // mostrar el error al usuario y el operador debe enterarse.
    // eslint-disable-next-line no-console
    console.error("[leads-server] createLead falló", {
      code: error.code,
      hasEmail: !!input.email,
    });
    return {
      ok: false,
      leadId: "",
      persisted: false,
      demo: false,
      note: `No se pudo persistir el lead en Supabase (${error.code ?? "unknown"}). Revisa la configuración del backend.`,
    };
  }

  return {
    ok: true,
    leadId: data.id,
    persisted: true,
    demo: false,
    note: "Lead guardado en Supabase y disponible en el CRM.",
  };
}

/* ------------------------------------------------------------------ */
/* Leads desde eventos (Fase 2)                                         */
/* ------------------------------------------------------------------ */

/**
 * Origen de un lead promovido desde un evento. Se usa como discriminador
 * en el campo `source` del lead y como tag para trazabilidad.
 *
 * - "event_confirmed": la persona confirmó asistencia (sin encuesta aún)
 * - "event_attended": la persona asistió (con o sin encuesta)
 * - "event_survey_consent": la persona respondió la encuesta Y dio consentimiento
 * - "manual": el admin lo creó a mano desde el panel
 */
export type EventLeadSource =
  | "event_confirmed"
  | "event_attended"
  | "event_survey_consent"
  | "manual";

export interface CreateLeadFromEventInput {
  /** Nombre del lead. Requerido. */
  name: string;
  /** Email (opcional, pero al menos uno de email/phone es recomendado). */
  email?: string;
  /** Phone en cualquier formato; se normaliza a E.164 MX antes de buscar/guardar. */
  phone?: string;
  /** Slug del evento (ej. "uabc-km43-marketing-ia"). Se usa como tag. */
  eventSlug: string;
  /** Origen del lead (cómo se detectó / promovió). */
  source: EventLeadSource;
  /**
   * REQUERIDO: consentimiento explícito para ser contactado comercialmente.
   * Sin esto, no se crea el lead. Defensa en profundidad (el server action
   * del survey también valida, pero acá verificamos otra vez).
   */
  consentToContact: boolean;
  /** Texto libre de la encuesta (tema de interés, comentarios). Se guarda en summary. */
  commercialInterest?: string;
  /** IDs opcionales a los records de evento (Fase 3 los tendrá). */
  surveyId?: string;
  attendeeId?: string;
  confirmationId?: string;
}

export interface CreateLeadFromEventResult {
  ok: boolean;
  leadId: string;
  /** true si se creó un lead NUEVO. false si se reusó uno existente. */
  created: boolean;
  /** true si el lead existía pero estaba en `lost`/`archived` y se reactivó. */
  reactivated: boolean;
  persisted: boolean;
  demo: boolean;
  note: string;
}

/**
 * Crea un lead desde un evento (encuesta con consentimiento, confirmación,
 * etc.) o reactiva uno existente.
 *
 * Flujo:
 *  1. Defensa en profundidad: sin `consentToContact`, rechaza.
 *  2. Busca por email (case-insensitive) o phone (normalizado E.164).
 *  3. Si encuentra:
 *     - Si está en `lost`/`archived` → reactiva a `new` y agrega tag de evento.
 *     - Si está activo → lo devuelve tal cual (no duplica). El caller puede
 *       actualizar `summary` o `next_follow_up_at` por su cuenta.
 *  4. Si no encuentra:
 *     - Crea un lead nuevo con `source='event'`, `status='new'`.
 *     - Tags: `['event:<slug>']` y (si hay surveyId) `['event:<slug>:survey:<id>']`.
 *
 * Server-only. Fallback a mock si Supabase no está configurado.
 *
 * IMPORTANTE (Fase 2 - sin eventos todavía):
 *   - Los IDs `surveyId`/`attendeeId`/`confirmationId` se guardan como TAGS
 *     (no como FK) hasta que existan las tablas `event_*` en Fase 3.
 *   - Cuando existan las tablas, agregar `metadata jsonb` o un join table.
 *   - Por ahora: un lead puede tener muchos tags, y los tags se acumulan
 *     por cada promoción.
 */
export async function createLeadFromEvent(
  input: CreateLeadFromEventInput,
): Promise<CreateLeadFromEventResult> {
  // 1. Consentimiento: no negociable.
  if (!input.consentToContact) {
    return {
      ok: false,
      leadId: "",
      created: false,
      reactivated: false,
      persisted: false,
      demo: true,
      note: "Falta consentimiento explícito. El lead no se crea.",
    };
  }
  if (!input.name?.trim()) {
    return {
      ok: false,
      leadId: "",
      created: false,
      reactivated: false,
      persisted: false,
      demo: true,
      note: "Falta el nombre del lead.",
    };
  }
  if (!input.eventSlug?.trim()) {
    return {
      ok: false,
      leadId: "",
      created: false,
      reactivated: false,
      persisted: false,
      demo: true,
      note: "Falta el eventSlug.",
    };
  }

  const normalizedEmail = input.email?.trim().toLowerCase() || null;
  const normalizedPhone = normalizePhone(input.phone);

  // Defensa en profundidad: sin email NI phone normalizable, no se puede
  // identificar al lead. Antes esto creaba un row fantasma con email
  // placeholder (`<slug>.<ts>@placeholder.local`) + tag `needs_email`. En
  // la práctica, ningún caller legítimo (formulario, encuesta, importador
  // Excel) llega sin al menos uno — esto solo se disparaba con bugs en el
  // caller o filas mal procesadas. Mejor enterarse.
  if (!normalizedEmail && !normalizedPhone) {
    return {
      ok: false,
      leadId: "",
      created: false,
      reactivated: false,
      persisted: false,
      demo: true,
      note: "Falta email o phone para crear el lead del evento.",
    };
  }

  // 2. Buscar por email o phone.
  let existing: Lead | null = null;
  if (normalizedEmail) {
    existing = await findLeadByEmail(normalizedEmail);
  }
  if (!existing && normalizedPhone) {
    existing = await findLeadByPhone(normalizedPhone);
  }

  // 3. Si existe, decidir entre reactivar o reusar.
  if (existing) {
    if (existing.status === "lost" || existing.status === "archived") {
      // Reactivar.
      return await reactivateLeadForEvent(
        existing,
        input,
        normalizedEmail,
        normalizedPhone,
      );
    }
    // Ya activo. Devolver tal cual.
    return {
      ok: true,
      leadId: existing.id,
      created: false,
      reactivated: false,
      persisted: true,
      demo: false,
      note: "El lead ya existía activo. No se duplica.",
    };
  }

  // 4. No existe → crear uno nuevo.
  return await createNewLeadForEvent(
    input,
    normalizedEmail,
    normalizedPhone,
  );
}

/**
 * Helper interno: crea un lead nuevo con source='event' y tags del evento.
 * Reutilizado por `createLeadFromEvent` (rama "no existe").
 */
async function createNewLeadForEvent(
  input: CreateLeadFromEventInput,
  normalizedEmail: string | null,
  normalizedPhone: string | null,
): Promise<CreateLeadFromEventResult> {
  const tags = buildEventTags(input);

  // El caller (createLeadFromEvent) ya garantizó que al menos uno de
  // email/phone está presente. Si llegamos acá sin email, igual podemos
  // crear el lead porque la columna `email` es NOT NULL con CHECK de
  // regex, pero necesitamos un email sintético para satisfacer la DB.
  // Usamos uno claramente etiquetado para que el admin lo limpie.
  // (Esta rama solo se ejecuta si hay phone válido pero no email.)
  const email = normalizedEmail
    ?? `no-email.${input.eventSlug}.${Date.now()}@placeholder.local`;

  const payload: InsertLeadPayload = {
    name: input.name.trim(),
    email,
    phone: normalizedPhone,
    course_of_interest: input.commercialInterest?.trim() || null,
    status: "new",
    source: "event",
    intent: "course_information",
    consent_to_contact: true,
    tags,
  };

  if (!isRealMode()) {
    // Fallback a mock: el mock no tiene `tags`, así que solo loggeamos.
    // Log SIN PII: solo flags y longitudes, no valores (cumple política
    // de datos del repo).
    // eslint-disable-next-line no-console
    console.info("[crm:demo] lead desde evento (no persistido)", {
      eventSlug: input.eventSlug,
      hasEmail: !!normalizedEmail,
      hasPhone: !!normalizedPhone,
      nameLength: input.name.trim().length,
      tagCount: tags.length,
    });
    return {
      ok: true,
      leadId: `lead_demo_${Date.now().toString(36)}`,
      created: true,
      reactivated: false,
      persisted: false,
      demo: true,
      note: "Lead de evento registrado en modo demo (tags en consola).",
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    // RACE HANDLER (auditor 2026-06-27): con los nuevos UNIQUE INDEX
    // sobre leads.email y leads.phone_normalized, 2 requests paralelos
    // para el mismo prospecto van a chocar aquí. El segundo INSERT
    // falla con 23505; hacemos SELECT del existente y lo devolvemos
    // como si fuera el "ya existía" path.
    if (error.code === "23505") {
      const existing = normalizedEmail
        ? await findLeadByEmail(normalizedEmail)
        : await findLeadByPhone(normalizedPhone ?? "");
      if (existing) {
        return {
          ok: true,
          leadId: existing.id,
          created: false,
          reactivated: false,
          persisted: true,
          demo: false,
          note: "Lead ya existía (race resuelta por UNIQUE INDEX).",
        };
      }
    }
    // Cualquier otro error: log SIN PII (solo código y evento).
    // eslint-disable-next-line no-console
    console.error("[leads-server] createLeadFromEvent: insert falló", {
      code: error.code,
      eventSlug: input.eventSlug,
    });
    return {
      ok: false,
      leadId: "",
      created: false,
      reactivated: false,
      persisted: false,
      demo: true,
      note: "No se pudo crear el lead del evento. Revisa logs.",
    };
  }

  if (!data) {
    return {
      ok: false,
      leadId: "",
      created: false,
      reactivated: false,
      persisted: false,
      demo: true,
      note: "INSERT no devolvió datos.",
    };
  }

  return {
    ok: true,
    leadId: data.id,
    created: true,
    reactivated: false,
    persisted: true,
    demo: false,
    note: "Lead del evento creado en Supabase.",
  };
}

/**
 * Helper interno: reactiva un lead en `lost`/`archived` para un nuevo
 * evento. Cambia status a `new`, agrega tag de evento, opcionalmente
 * actualiza el email/phone si el lead viejo no tenía.
 */
async function reactivateLeadForEvent(
  existing: Lead,
  input: CreateLeadFromEventInput,
  normalizedEmail: string | null,
  normalizedPhone: string | null,
): Promise<CreateLeadFromEventResult> {
  const newTags = buildEventTags(input);
  // Merge con tags existentes (sin duplicar).
  const existingTags = existing.tags ?? [];
  const mergedTags = Array.from(new Set([...existingTags, ...newTags]));

  if (!isRealMode()) {
    // eslint-disable-next-line no-console
    console.info("[crm:demo] lead reactivado (no persistido)", {
      leadId: existing.id,
      newStatus: "new",
      newTags: mergedTags,
    });
    return {
      ok: true,
      leadId: existing.id,
      created: false,
      reactivated: true,
      persisted: false,
      demo: true,
      note: "Lead reactivado en modo demo.",
    };
  }

  const supabase = createSupabaseAdminClient();
  // Tipo: solo las columnas que vamos a patchar. Supabase gen types
  // infiere el tipo exacto del update.
  const patch: Database["public"]["Tables"]["leads"]["Update"] = {
    status: "new",
    tags: mergedTags,
  };
  // Si el lead viejo no tenía email/phone y ahora los tenemos, los
  // actualizamos. Esto es un upsert "ligero" de campos opcionales.
  if (!existing.email && normalizedEmail) patch.email = normalizedEmail;
  if (!existing.phone && normalizedPhone) patch.phone = normalizedPhone;

  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", existing.id);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[leads-server] createLeadFromEvent: reactivate falló", {
      code: error.code,
      leadId: existing.id,
    });
    return {
      ok: false,
      leadId: existing.id,
      created: false,
      reactivated: false,
      persisted: false,
      demo: true,
      note: "No se pudo reactivar el lead.",
    };
  }

  return {
    ok: true,
    leadId: existing.id,
    created: false,
    reactivated: true,
    persisted: true,
    demo: false,
    note: "Lead reactivado y vinculado al evento.",
  };
}

/**
 * Construye los tags estructurados para un lead de evento.
 * Convención: `event:<slug>` (siempre) + sub-tags según IDs de records.
 * Los tags se acumulan si el lead se vincula a múltiples records.
 */
function buildEventTags(input: CreateLeadFromEventInput): string[] {
  const tags = [`event:${input.eventSlug}`];
  if (input.surveyId) tags.push(`event:${input.eventSlug}:survey:${input.surveyId}`);
  if (input.attendeeId) tags.push(`event:${input.eventSlug}:attendee:${input.attendeeId}`);
  if (input.confirmationId) tags.push(`event:${input.eventSlug}:confirmation:${input.confirmationId}`);
  return tags;
}

/* ------------------------------------------------------------------ */
/* Link lead <-> event record (STUB)                                   */
/* ------------------------------------------------------------------ */

export type EventRecordType = "confirmation" | "attendee" | "survey";

export interface LinkLeadToEventRecordInput {
  leadId: string;
  eventSlug: string;
  recordType: EventRecordType;
  recordId: string;
}

export interface LinkLeadToEventRecordResult {
  ok: boolean;
  /** true si se agregó un tag, false si ya estaba. */
  linked: boolean;
  note: string;
}

/**
 * Vincula un lead existente con un record de evento.
 *
 * Implementación (Fase 3): crea una fila en `lead_event_links`
 * (tabla de join). Esto reemplaza el STUB tag-based de Fase 2.
 *
 * Cierra el **H2 del QA round 1 de Fase 2** (race condition en tags)
 * por construcción: la tabla `lead_event_links` es INSERT-only, no
 * SELECT-then-UPDATE. Dos requests concurrentes que intenten agregar
 * el mismo link: uno gana (INSERT), el otro recibe 23505 unique
 * violation que se reporta como `linked: false` (ya estaba).
 *
 * El contrato público (input/output) se mantiene estable para que
 * el caller (Fase 2 callers + el importador de Fase 3) no cambie.
 */
export async function linkLeadToEventRecord(
  input: LinkLeadToEventRecordInput,
): Promise<LinkLeadToEventRecordResult> {
  if (!input.leadId || !input.eventSlug || !input.recordType || !input.recordId) {
    return {
      ok: false,
      linked: false,
      note: "Faltan datos (leadId/eventSlug/recordType/recordId).",
    };
  }
  // Cierra H10 del QA Fase 2: validación runtime de recordType.
  // El union de TS previene en compile time, pero JSON payloads sin tipo
  // pueden traer valores fuera del enum → la DB rechaza con CHECK constraint
  // y el caller recibe un error críptico. Mejor falla ruidoso y temprano.
  const VALID_RECORD_TYPES: readonly EventRecordType[] = [
    "confirmation",
    "attendee",
    "survey",
  ];
  if (!VALID_RECORD_TYPES.includes(input.recordType)) {
    return {
      ok: false,
      linked: false,
      note: `recordType inválido: "${input.recordType}". Valores aceptados: confirmation, attendee, survey.`,
    };
  }

  if (!isRealMode()) {
    // eslint-disable-next-line no-console
    console.info("[crm:demo] link lead-event (no persistido)", {
      leadId: input.leadId,
      eventSlug: input.eventSlug,
      recordType: input.recordType,
      recordId: input.recordId,
    });
    return {
      ok: true,
      linked: true,
      note: "Link registrado en modo demo (no persistido).",
    };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Resolver eventSlug → eventId (la FK en lead_event_links es a id, no slug).
  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("id")
    .eq("slug", input.eventSlug)
    .maybeSingle();

  if (evErr) {
    // eslint-disable-next-line no-console
    console.error("[leads-server] linkLeadToEventRecord: read event falló", {
      code: evErr.code,
      eventSlug: input.eventSlug,
    });
    return {
      ok: false,
      linked: false,
      note: `No se pudo leer el evento (${evErr.code ?? "unknown"}).`,
    };
  }
  if (!event) {
    return {
      ok: false,
      linked: false,
      note: `Evento "${input.eventSlug}" no existe.`,
    };
  }
  const eventId = event.id as string;

  // 2. INSERT con onConflict do nothing (idempotente por UNIQUE constraint).
  const { error: insErr } = await supabase
    .from("lead_event_links")
    .insert({
      lead_id: input.leadId,
      event_id: eventId,
      link_type: input.recordType,
      link_id: input.recordId,
    });

  if (!insErr) {
    return {
      ok: true,
      linked: true,
      note: "Link creado en lead_event_links.",
    };
  }

  // 23505 = unique_violation → ya existía el link, no se duplica.
  if (insErr.code === "23505") {
    return {
      ok: true,
      linked: false,
      note: "El link ya existía (idempotente).",
    };
  }

  // Cualquier otro error: falla ruidoso.
  // eslint-disable-next-line no-console
  console.error("[leads-server] linkLeadToEventRecord: insert falló", {
    code: insErr.code,
    leadId: input.leadId,
    eventId,
  });
  return {
    ok: false,
    linked: false,
    note: `No se pudo crear el link (${insErr.code ?? "unknown"}).`,
  };
}

/* ------------------------------------------------------------------ */
/* Leads vinculados a un evento (para el admin de eventos)             */
/* ------------------------------------------------------------------ */

/** Un lead con todos sus links a un evento específico. */
export interface LeadWithEventLinks {
  lead: Lead;
  links: Array<{
    linkType: LeadEventLinkType;
    linkId: string;
    createdAt: string;
  }>;
}

/**
 * Devuelve los leads que tienen al menos un link a este evento
 * (confirmation / attendee / survey).
 *
 * Un lead puede tener múltiples links al mismo evento (ej: una
 * persona que confirmó Y asistió Y respondió la encuesta — son
 * 3 rows en `lead_event_links`). Devolvemos UN row por lead con
 * TODOS sus links agrupados, para que el admin vea el panorama
 * completo de cada lead sin duplicados visuales.
 *
 * Server-only. RLS deny para anon/authenticated — el admin usa
 * service role.
 */
export async function getLeadsForEvent(
  eventId: string,
): Promise<LeadWithEventLinks[]> {
  if (!isRealMode()) return [];

  const supabase = createSupabaseAdminClient();
  // JOIN leads con lead_event_links. Seleccionamos lo necesario de
  // ambas tablas para que el cliente admin no haga 2 queries.
  const { data, error } = await supabase
    .from("lead_event_links")
    .select(
      `
      link_type,
      link_id,
      created_at,
      lead:leads (*)
    `,
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[leads-server] getLeadsForEvent falló", {
      code: error.code,
      eventId,
    });
    return [];
  }
  if (!data || data.length === 0) return [];

  // Agrupar por lead.id. El JOIN de Supabase devuelve cada row con
  // un objeto `lead` anidado (puede ser null si el lead fue borrado
  // — caso edge, lo filtramos).
  type Row = {
    link_type: LeadEventLinkType;
    link_id: string;
    created_at: string;
    lead: Parameters<typeof mapLeadRowToLead>[0] | null;
  };

  const byLeadId = new Map<string, LeadWithEventLinks>();
  for (const row of data as unknown as Row[]) {
    if (!row.lead) continue;
    const lead = mapLeadRowToLead(row.lead);
    const existing = byLeadId.get(lead.id);
    if (existing) {
      existing.links.push({
        linkType: row.link_type,
        linkId: row.link_id,
        createdAt: row.created_at,
      });
    } else {
      byLeadId.set(lead.id, {
        lead,
        links: [
          {
            linkType: row.link_type,
            linkId: row.link_id,
            createdAt: row.created_at,
          },
        ],
      });
    }
  }

  return Array.from(byLeadId.values());
}

/**
 * Contexto del evento del que provino un lead.
 *
 * Usado por el drawer del CRM (LeadDetailDrawer) para mostrar el badge
 * "📅 Vino de evento X" cuando un lead tiene source='event'. Devuelve
 * `null` si el lead no tiene links a eventos (la mayoría de los leads
 * orgánicos no).
 *
 * Si hay múltiples links (poco probable pero posible), devuelve el más
 * reciente (`ORDER BY created_at DESC LIMIT 1`).
 *
 * @server
 */
export interface LeadEventContext {
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  startsAt: string;
  /** Tipo del link: "confirmation" | "attendee" | "survey". */
  linkType: LeadEventLinkType;
  /** Solo si linkType === "survey": interés comercial declarado. */
  commercialInterest?: string;
  /** Solo si linkType === "survey": fecha de envío de la encuesta. */
  surveySubmittedAt?: string;
}

export async function getEventContextForLead(
  leadId: string,
): Promise<LeadEventContext | null> {
  if (!isRealMode()) return null;

  const supabase = createSupabaseAdminClient();

  // 1. Buscar el link más reciente del lead + datos del evento en JOIN.
  const { data: linkData, error: linkErr } = await supabase
    .from("lead_event_links")
    .select(
      `
      link_type,
      link_id,
      event:events (id, title, slug, starts_at)
    `,
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (linkErr) {
    // eslint-disable-next-line no-console
    console.error("[leads-server] getEventContextForLead link fetch falló", {
      code: linkErr.code,
      leadId,
    });
    return null;
  }
  if (!linkData) return null;

  // El JOIN de Supabase devuelve `event` como objeto anidado o array
  // según la versión del cliente. Normalizamos a objeto único.
  type EventJoin = { id: string; title: string; slug: string; starts_at: string };
  const eventRaw = linkData.event as EventJoin | EventJoin[] | null;
  const event: EventJoin | null = Array.isArray(eventRaw)
    ? eventRaw[0] ?? null
    : eventRaw;
  if (!event) return null;

  const result: LeadEventContext = {
    eventId: event.id,
    eventTitle: event.title,
    eventSlug: event.slug,
    startsAt: event.starts_at,
    linkType: linkData.link_type as LeadEventLinkType,
  };

  // 2. Si el link es de tipo survey, traer commercial_interest y fecha.
  if (result.linkType === "survey") {
    const { data: survey } = await supabase
      .from("event_surveys")
      .select("commercial_interest, submitted_at")
      .eq("id", linkData.link_id)
      .maybeSingle();
    if (survey) {
      result.commercialInterest = survey.commercial_interest ?? undefined;
      result.surveySubmittedAt = survey.submitted_at;
    }
  }

  return result;
}
