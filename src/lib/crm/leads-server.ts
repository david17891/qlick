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
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  mapLeadRowToLead,
  type InsertLeadPayload,
} from "./leads-mapper";
import { normalizePhone } from "./phone-utils";

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
      email: normalized,
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
    const { phonesMatch } = await import("./phone-utils");
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

  const { phonesMatch } = await import("./phone-utils");
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
    // eslint-disable-next-line no-console
    console.error("[leads-server] createLead falló", { code: error.code });
    // Caemos a mock para no mostrar error crudo al usuario final.
    const { createLeadFromContactForm } = await import("./crm-service");
    const mock = createLeadFromContactForm({
      name: input.name,
      email: input.email,
      phone: input.phone,
      courseOfInterest: input.courseOfInterest,
      intent: payload.intent,
      source: payload.source,
      message: input.message,
      consentToContact: true,
    });
    return {
      ok: true,
      leadId: mock.leadId,
      persisted: false,
      demo: true,
      note:
        "No se pudo persistir en Supabase; se registró en modo demo. Revisa la configuración.",
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
