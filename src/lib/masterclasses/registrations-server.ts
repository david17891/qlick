/**
 * Servicios server-side para registros de masterclass.
 *
 * Server-only. Service role (bypass RLS).
 *
 * REGLA DE FALLBACK:
 * - Si Supabase NO está configurado → mock in-memory + demo: true.
 * - Si Supabase SÍ está configurado → tabla real.
 *
 * Operaciones:
 * - createMasterclassRegistration: server action público (sin auth admin).
 *   Valida consentimiento, busca/crea lead, inserta registration.
 * - getRegistrationsByMasterclass: admin only (lo llama el panel).
 * - updateRegistrationStatus / updateAttendanceStatus /
 *   updateCommercialStatus: admin only.
 *
 * Importante: el server action público (create) NO requiere auth admin.
 * Por eso valida consentimiento y otros campos defensivamente antes de
 * insertar.
 *
 * @server
 */

import type {
  MasterclassRegistration,
  MasterclassRegistrationInput,
  CreateMasterclassRegistrationResult,
  UpdateRegistrationStatusInput,
  AdminRegistrationRow,
} from "@/types/masterclass";
import {
  mapMasterclassRegistrationRow,
  type MasterclassRegistrationRow,
} from "./masterclass-mapper";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/* ------------------------------------------------------------------ */
/* Demo fallback                                                         */
/* ------------------------------------------------------------------ */

const DEMO_REGISTRATIONS: MasterclassRegistration[] = [];

function makeDemoId(): string {
  return `reg_demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/* Crear registro (público, vía server action)                          */
/* ------------------------------------------------------------------ */

export async function createMasterclassRegistration(
  input: MasterclassRegistrationInput,
): Promise<CreateMasterclassRegistrationResult> {
  // Defensa en profundidad: sin consentimiento, nada.
  if (!input.consentToContact) {
    return {
      ok: false,
      registrationId: "",
      leadId: null,
      persisted: false,
      demo: true,
      note: "Falta consentimiento explícito para registrar.",
    };
  }
  if (!input.masterclassId || !input.name?.trim() || !input.email?.trim()) {
    return {
      ok: false,
      registrationId: "",
      leadId: null,
      persisted: false,
      demo: true,
      note: "Faltan datos requeridos (masterclass, nombre o email).",
    };
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone?.trim() || null;

  if (!isRealMode()) {
    // Fallback demo: id ficticio, sin persistencia.
    const reg: MasterclassRegistration = {
      id: makeDemoId(),
      masterclassId: input.masterclassId,
      leadId: null,
      name,
      email,
      phone,
      registrationStatus: "registered",
      attendanceStatus: "pending",
      commercialStatus: "new",
      source: "masterclass",
      utmSource: input.utmSource ?? null,
      utmCampaign: input.utmCampaign ?? null,
      consentToContact: true,
      registeredAt: new Date().toISOString(),
      attendedAt: null,
      notes: null,
    };
    DEMO_REGISTRATIONS.push(reg);
    return {
      ok: true,
      registrationId: reg.id,
      leadId: null,
      persisted: false,
      demo: true,
      note:
        "Registro capturado en modo demo. En producción se guarda en Supabase y se vincula a un lead.",
    };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Buscar lead existente por email.
  let leadId: string | null = null;
  const { data: existingLead, error: leadFindError } = await supabase
    .from("leads")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (leadFindError) {
    // Log SIN PII: solo código de error y longitud (no el email crudo,
    // cumple política de datos del repo).
    // eslint-disable-next-line no-console
    console.error(
      "[registrations-server] búsqueda de lead falló",
      { code: leadFindError.code, emailLength: email.length, emailDomain: email.split("@")[1] ?? "(none)" },
    );
    // No es bloqueante: seguimos y creamos el lead si no existe.
  } else if (existingLead) {
    leadId = existingLead.id;
  } else {
    // 2. Crear lead nuevo (consentimiento + nombre + email son los mínimos
    // exigidos por la política RLS `leads_public_insert_form`).
    //
    // Nota: `lead_source` no incluye 'masterclass' aún (pertenece a la tabla
    // lead_source enum del schema v0.4). Usamos 'other' y dejamos el detalle
    // del origen en `source` del registration. Si más adelante se extiende
    // el enum, este código puede cambiar a 'masterclass' directamente.
    const { data: newLead, error: leadInsertError } = await supabase
      .from("leads")
      .insert({
        name,
        email,
        phone,
        status: "new",
        source: "other",
        intent: "course_information",
        consent_to_contact: true,
        message: null,
      })
      .select("id")
      .single();

    if (leadInsertError || !newLead) {
      // Log SIN PII: solo código de error y longitud/dominio del email.
      // eslint-disable-next-line no-console
      console.error(
        "[registrations-server] creación de lead falló",
        { code: leadInsertError?.code, emailLength: email.length, emailDomain: email.split("@")[1] ?? "(none)" },
      );
      // Si falla el lead, igual intentamos crear el registration sin lead_id
      // para no perder la captura (el admin puede vincularlo después).
    } else {
      leadId = newLead.id;
    }
  }

  // 3. Crear el registration.
  const { data: reg, error: regError } = await supabase
    .from("masterclass_registrations")
    .insert({
      masterclass_id: input.masterclassId,
      lead_id: leadId,
      name,
      email,
      phone,
      registration_status: "registered",
      attendance_status: "pending",
      commercial_status: "new",
      source: "masterclass",
      utm_source: input.utmSource ?? null,
      utm_campaign: input.utmCampaign ?? null,
      consent_to_contact: true,
    })
    .select("id")
    .single();

  if (regError || !reg) {
    // eslint-disable-next-line no-console
    console.error(
      "[registrations-server] creación de registration falló",
      { code: regError?.code, masterclassId: input.masterclassId },
    );
    return {
      ok: false,
      registrationId: "",
      leadId,
      persisted: false,
      demo: true,
      note:
        "No se pudo registrar; intenta de nuevo o contacta al equipo de Qlick.",
    };
  }

  return {
    ok: true,
    registrationId: reg.id,
    leadId,
    persisted: true,
    demo: false,
    note: "Registro guardado en Supabase. Te contactaremos con los detalles.",
  };
}

/* ------------------------------------------------------------------ */
/* Lecturas admin                                                        */
/* ------------------------------------------------------------------ */

export async function getRegistrationsByMasterclass(
  masterclassId: string,
): Promise<AdminRegistrationRow[]> {
  if (!isRealMode()) {
    return DEMO_REGISTRATIONS.filter((r) => r.masterclassId === masterclassId).map(
      (registration) => ({
        registration,
        lead: null,
      }),
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("masterclass_registrations")
    .select("*")
    .eq("masterclass_id", masterclassId)
    .order("registered_at", { ascending: false });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error(
      "[registrations-server] getRegistrationsByMasterclass falló",
      { code: error?.code, masterclassId },
    );
    return [];
  }

  const regs = (data as MasterclassRegistrationRow[]).map(
    mapMasterclassRegistrationRow,
  );

  // Hidratar leads vinculados.
  const leadIds = Array.from(
    new Set(regs.map((r) => r.leadId).filter((id): id is string => Boolean(id))),
  );

  type LeadRow = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
  };

  let leadsById: Record<string, LeadRow> = {};
  if (leadIds.length > 0) {
    const { data: leadsData, error: leadsError } = await supabase
      .from("leads")
      .select("id, name, email, phone, status")
      .in("id", leadIds);

    if (!leadsError && leadsData) {
      leadsById = Object.fromEntries(
        (leadsData as LeadRow[]).map((l) => [l.id, l]),
      );
    }
  }

  return regs.map((registration) => ({
    registration,
    lead: registration.leadId ? leadsById[registration.leadId] ?? null : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Updates admin                                                         */
/* ------------------------------------------------------------------ */

export interface AdminUpdateResult {
  ok: boolean;
  note?: string;
}

const REG_STATUSES = [
  "registered",
  "cancelled",
  "no_show",
  "attended",
] as const;
const ATT_STATUSES = ["pending", "attended", "no_show"] as const;
const COM_STATUSES = [
  "new",
  "interested",
  "not_interested",
  "converted",
  "lost",
] as const;

export async function updateRegistrationStatus(
  input: UpdateRegistrationStatusInput,
): Promise<AdminUpdateResult> {
  if (!isRealMode()) {
    return { ok: false, note: "Modo demo: cambios no se persisten." };
  }
  if (!input.registrationId) {
    return { ok: false, note: "Falta registrationId." };
  }

  const patch: Record<string, unknown> = {};
  if (input.registrationStatus) {
    if (!(REG_STATUSES as readonly string[]).includes(input.registrationStatus)) {
      return { ok: false, note: "registrationStatus inválido." };
    }
    patch.registration_status = input.registrationStatus;
  }
  if (input.attendanceStatus) {
    if (!(ATT_STATUSES as readonly string[]).includes(input.attendanceStatus)) {
      return { ok: false, note: "attendanceStatus inválido." };
    }
    patch.attendance_status = input.attendanceStatus;
    if (input.attendanceStatus === "attended") {
      patch.attended_at = new Date().toISOString();
    }
  }
  if (input.commercialStatus) {
    if (!(COM_STATUSES as readonly string[]).includes(input.commercialStatus)) {
      return { ok: false, note: "commercialStatus inválido." };
    }
    patch.commercial_status = input.commercialStatus;
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, note: "Nada que actualizar." };
  }

  const supabase = createSupabaseAdminClient();
  // Cast: `patch` se construye con campos validados arriba. El tipo Update
  // del typegen es estricto; aquí ya validamos cada clave.
  const { error } = await supabase
    .from("masterclass_registrations")
    .update(patch as never)
    .eq("id", input.registrationId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      "[registrations-server] updateRegistrationStatus falló",
      { code: error.code, registrationId: input.registrationId },
    );
    return { ok: false, note: "No se pudo actualizar el registro." };
  }
  return { ok: true };
}