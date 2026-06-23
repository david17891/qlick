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
  type LeadRow,
} from "./leads-mapper";

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
  return (data ?? []).map((row) => mapLeadRowToLead(row as never));
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
  return mapLeadRowToLead(data as never);
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
  // El cliente admin no tiene `Database` tipado todavía (sin typegen de
  // Supabase, que requiere proyecto creado). Casteamos la fila a LeadRow para
  // mantener tipado seguro en el dominio sin acoplarse al query builder.
  const { data, error } = await supabase
    .from("leads")
    .insert(payload as unknown as never[])
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

  const row = data as unknown as Pick<LeadRow, "id">;
  return {
    ok: true,
    leadId: row.id,
    persisted: true,
    demo: false,
    note: "Lead guardado en Supabase y disponible en el CRM.",
  };
}
