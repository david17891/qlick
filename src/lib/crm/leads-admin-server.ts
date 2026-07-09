/**
 * Operaciones admin sobre leads (server-only).
 *
 * Escrituras que realiza el admin autenticado: cambio de status. Las lecturas
 * (getLeads/getLeadById) viven en leads-server.ts (compartidas con el flujo
 * público). Aquí solo las operaciones que requieren admin.
 *
 * Modelo (D-018): usa createSupabaseAdminClient() (service role, bypass RLS).
 * El `actorEmail` se registra en el audit log y, donde aplica, como
 * created_by_email de entidades relacionadas (interacciones).
 *
 * No implementa fallback demo: las operaciones admin son exclusivamente reales.
 * El caller (route handler) ya validó admin vía requireAdmin().
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { mapLeadRowToLead, type LeadRow } from "./leads-mapper";
import { logAdminAction } from "./audit-server";
import { normalizePhone } from "./phone-utils";
import { extractEmailFromText } from "../whatsapp/email-extract";
import type { Lead, LeadStatus } from "@/types";

/**
 * FIX 2026-07-08 (sesión David "registrados sin nombre/correo/teléfono"):
 * Campos que el admin puede editar manualmente desde el drawer del CRM.
 *
 * Aplica solo a campos del propio `Lead`. El status sigue yendo por
 * `updateLeadStatus` (mantiene optimistic lock y audit con from/to reales).
 *
 * Reglas:
 *   - name:    1–100 chars después de trim. No se permite dejar vacío
 *              (rompería saludos `Hola ${name}` del bot).
 *   - email:   formato RFC-lite (`/[^\s@]+@[^\s@]+\.[^\s@]+/`).
 *              Se extrae con `extractEmailFromText` antes de validar
 *              (caso real: "su email es david@x.com" → extrae david@x.com).
 *   - phone:   normalizado a E.164 vía `normalizePhone`. Si llega vacío,
 *              se limpia (null). Si llega con formato inválido, error.
 *
 * El payload es `Partial<>`: el caller puede pasar 1, 2 o los 3 campos.
 * Solo se persisten los que cambian (diff contra DB antes del UPDATE) para
 * que el audit log solo registre lo realmente modificado.
 */
export interface LeadFieldUpdate {
  name?: string;
  email?: string;
  phone?: string;
}

/** Resultado de una operación admin sobre un lead. */
export interface AdminLeadOpResult {
  ok: boolean;
  /** Lead actualizado si la op tuvo éxito; undefined si no. */
  lead?: Lead;
  note?: string;
}

/**
 * Valida que un string sea un LeadStatus válido del dominio.
 * Evita aceptar cualquier string y llevarlo a la DB.
 */
const LEAD_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "info_requested",
  "payment_pending",
  "enrolled",
  "active_student",
  "lost",
  "archived",
];

function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Cambia el status de un lead. Server-only, admin.
 *
 * @param leadId  UUID del lead.
 * @param status  Nuevo status (validado contra el dominio).
 * @param actorEmail Email del admin (para audit log).
 */
export async function updateLeadStatus(
  leadId: string,
  status: string,
  actorEmail: string,
): Promise<AdminLeadOpResult> {
  if (!checkSupabaseConfig().configured) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!isLeadStatus(status)) {
    return { ok: false, note: "Status inválido." };
  }
  if (!leadId || !actorEmail) {
    return { ok: false, note: "Faltan datos (leadId/actor)." };
  }

  const supabase = createSupabaseAdminClient();

  // 1. Leemos el status actual para el audit log. Sin esto, el audit log
  //    registra "to: X" pero no "from: Y", y no se puede responder
  //    "¿quién cambió este lead de Y a X?". Necesario para trazabilidad
  //    real.
  const { data: prevRow, error: prevErr } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle();

  if (prevErr || !prevRow) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] updateLeadStatus: no se pudo leer status previo", {
      code: prevErr?.code,
      leadId,
    });
    return {
      ok: false,
      note: prevErr
        ? "No se pudo leer el lead antes de actualizar."
        : "El lead no existe.",
    };
  }
  const prevStatus = prevRow.status as LeadStatus;

  // 2. UPDATE atómico: solo aplicamos si el status sigue siendo el que
  //    leímos. Si otro admin cambió el status en el medio, `data` viene
  //    vacío y devolvemos conflicto (no silencioso). Esto cierra la race
  //    window entre el SELECT previo y el UPDATE.
  const { data, error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .eq("status", prevStatus)
    .select("*")
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] updateLeadStatus falló", {
      code: error.code,
      leadId,
    });
    return { ok: false, note: "No se pudo actualizar el lead." };
  }

  if (!data) {
    // El WHERE no matcheó: el status cambió entre nuestro SELECT y el UPDATE.
    return {
      ok: false,
      note: `Conflicto: el lead ya no estaba en "${prevStatus}". Otro proceso pudo haberlo cambiado. Recarga y reintenta.`,
    };
  }

  const lead = mapLeadRowToLead(data as LeadRow);

  // 3. Audit log con from/to reales (trazabilidad útil).
  await logAdminAction({
    actor_email: actorEmail,
    action: "lead_status_change",
    entity_type: "lead",
    entity_id: leadId,
    metadata: { from: prevStatus, to: status },
  });

  return { ok: true, lead };
}

/**
 * FIX 2026-07-08 (sesión David "registrados sin nombre/correo/teléfono"):
 * Actualiza campos editables del lead (name/email/phone) desde el panel admin.
 *
 * Diferencias con `updateLeadStatus`:
 *   - NO usa optimistic lock (no hay race con el bot en estos campos:
 *     el bot solo escribe `name` en `provide_name` y `email` en `provide_email`,
 *     y el admin puede sobrescribirlo sin conflicto porque la fuente de verdad
 *     es el admin en este caso).
 *   - Solo aplica los campos que cambiaron (diff contra fila actual) para
 *     que el audit log registre solo lo realmente modificado.
 *   - Valida formato: email RFC-lite, phone E.164, name 1–100 chars.
 *
 * Casos cubiertos (todos los datos reales del screenshot de David 2026-07-08):
 *   1. `36249ecd` Yesy087 (tiene email real pero name="WhatsApp Lead" placeholder).
 *      → admin edita name a "Yesy" → DB y audit reflejan el cambio.
 *   2. `646bc08f` UK placeholder (name + email + phone placeholder).
 *      → admin edita los 3 → audit registra cada campo con from/to.
 *   3. `wa.xxx@placeholder.local` → admin edita email → el real contact queda
 *      en `leads.email` y el QR/email flow ya no rebota por email fake.
 *
 * @param leadId     UUID del lead.
 * @param fields     Patch parcial con los campos a actualizar.
 * @param actorEmail Email del admin (para audit log).
 * @param deps       (opcional) Inyección de dependencias para tests.
 *                  Si no se pasa, usa el cliente admin real.
 */
export async function updateLeadFields(
  leadId: string,
  fields: LeadFieldUpdate,
  actorEmail: string,
  deps?: {
    supabase?: Awaited<ReturnType<typeof createSupabaseAdminClient>> | null;
    isConfigured?: boolean;
  },
): Promise<AdminLeadOpResult> {
  const isConfigured = deps?.isConfigured ?? checkSupabaseConfig().configured;
  if (!isConfigured) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!leadId || !actorEmail) {
    return { ok: false, note: "Faltan datos (leadId/actor)." };
  }
  if (!fields || Object.keys(fields).length === 0) {
    return { ok: false, note: "Patch vacío." };
  }

  // Validaciones por campo. Cada rama devuelve error actionable (no silencioso).
  const cleaned: { name?: string; email?: string; phone?: string | null } = {};

  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (name.length === 0) {
      return { ok: false, note: "El nombre no puede estar vacío." };
    }
    if (name.length > 100) {
      return { ok: false, note: "El nombre no puede superar 100 caracteres." };
    }
    cleaned.name = name;
  }

  if (fields.email !== undefined) {
    const email = fields.email.trim();
    if (email.length === 0) {
      // Email vacío → limpiamos el campo (el admin puede querer borrar el placeholder).
      cleaned.email = "";
    } else {
      // Extraemos email embebido por si el admin pegó contexto extra
      // (mismo helper que usa el bot — consistencia).
      const extracted = extractEmailFromText(email) ?? email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extracted)) {
        return { ok: false, note: "Email con formato inválido." };
      }
      cleaned.email = extracted.toLowerCase();
    }
  }

  if (fields.phone !== undefined) {
    const phoneRaw = fields.phone.trim();
    if (phoneRaw.length === 0) {
      // Phone vacío → guardamos string vacío. El bot-engine prefiere
      // que `leads.phone` no sea null cuando existe (queries por phone).
      // Pero el admin explícitamente pidió limpiar → lo respetamos.
      cleaned.phone = "";
    } else {
      if (normalizePhone(phoneRaw) === null) {
        return { ok: false, note: "Teléfono inválido (debe tener código de país, ej. +52...)." };
      }
      // Guardamos el formato original (con espacios/guiones) para que el
      // admin vea lo que tipeó. `phone_normalized` se calcula abajo.
      cleaned.phone = phoneRaw;
    }
  }

  const supabase = deps?.supabase ?? createSupabaseAdminClient();

  // 1. SELECT previo: necesitamos los valores actuales para el diff del audit
  //    log ("from: 'WhatsApp Lead' → to: 'Yesy'"). Sin esto, el audit pierde
  //    el "antes" y queda solo con el "después" — inútil para auditoría real.
  const { data: prevRow, error: prevErr } = await supabase
    .from("leads")
    .select("id, name, email, phone")
    .eq("id", leadId)
    .maybeSingle();

  if (prevErr || !prevRow) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] updateLeadFields: no se pudo leer lead previo", {
      code: prevErr?.code,
      leadId,
    });
    return {
      ok: false,
      note: prevErr
        ? "No se pudo leer el lead antes de actualizar."
        : "El lead no existe.",
    };
  }

  // 2. Diff: solo mandamos al UPDATE los campos que efectivamente cambian.
  //    Si el admin manda name="Yesy" pero la DB ya tiene "Yesy", lo skipeamos.
  //    Beneficio: audit log limpio (solo lo realmente modificado), UPDATE
  //    idempotente, no triggerea updated_at innecesariamente.
  const payload: Record<string, string | null> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (cleaned.name !== undefined && cleaned.name !== prevRow.name) {
    payload.name = cleaned.name;
    before.name = prevRow.name;
    after.name = cleaned.name;
  }
  if (cleaned.email !== undefined && cleaned.email !== prevRow.email) {
    // El schema de `leads.email` es NOT NULL; usamos "" para "limpiar" en vez de null.
    payload.email = cleaned.email;
    before.email = prevRow.email;
    after.email = cleaned.email;
  }
  if (cleaned.phone !== undefined) {
    // Para phone, normalizamos para comparar (admin puede tipear "+52 686..."
    // vs la DB con "+52686..."). Si difieren en formato pero matchean
    // normalizados, no actualizamos el campo pero sí actualizamos
    // `phone_normalized` por si quedó stale.
    const prevNorm = normalizePhone(prevRow.phone);
    const nextNorm = normalizePhone(cleaned.phone);
    if (prevNorm !== nextNorm || prevRow.phone !== cleaned.phone) {
      payload.phone = cleaned.phone === "" ? "" : cleaned.phone;
      if (nextNorm) payload.phone_normalized = nextNorm;
      before.phone = prevRow.phone;
      after.phone = cleaned.phone === "" ? "" : cleaned.phone;
    }
  }

  // Trackear qué keys mandó el admin ORIGINALMENTE (no los derivados como
  // phone_normalized) para que el audit `metadata.fields_changed` refleje
  // solo lo que el admin cambió explícitamente.
  const inputKeys: string[] = [];
  if (cleaned.name !== undefined && "name" in payload) inputKeys.push("name");
  if (cleaned.email !== undefined && "email" in payload) inputKeys.push("email");
  if (cleaned.phone !== undefined && "phone" in payload) inputKeys.push("phone");

  // Si no hay diff real (todo igual), respondemos OK con el lead sin cambios.
  // No error: el admin hizo click pero los datos ya estaban bien.
  if (Object.keys(payload).length === 0) {
    const { data: sameRow } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();
    return {
      ok: true,
      lead: sameRow ? mapLeadRowToLead(sameRow as LeadRow) : undefined,
      note: "Sin cambios (los datos ya estaban así).",
    };
  }

  // 3. UPDATE atómico (sin optimistic lock — ver doc arriba).
  const { data, error } = await supabase
    .from("leads")
    // Cast a `never` porque Supabase infiere `UpdateInput<>` que no acepta
    // string index. Mismo patrón que el resto del archivo.
    .update(payload as never)
    .eq("id", leadId)
    .select("*")
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] updateLeadFields falló", {
      code: error.code,
      leadId,
    });
    return { ok: false, note: "No se pudo actualizar el lead." };
  }
  if (!data) {
    return { ok: false, note: "El lead desapareció entre el SELECT y el UPDATE." };
  }

  const lead = mapLeadRowToLead(data as LeadRow);

  // 4. Audit log con before/after (diff view). Una sola entry por PATCH,
  //    contiene todos los campos cambiados en el JSONB. Más fácil de
  //    agrupar/buscar que N entries por campo.
  await logAdminAction({
    actor_email: actorEmail,
    action: "lead_field_edit",
    entity_type: "lead",
    entity_id: leadId,
    before,
    after,
    metadata: {
      fields_changed: inputKeys,
    },
  });

  return { ok: true, lead };
}

/**
 * Alias semántico de `updateLeadStatus` para el contexto del flujo de
 * eventos (Fase 2). En la terminología del cliente, el campo `status`
 * del lead representa su "estado comercial" en el pipeline de ventas
 * (new → contacted → interested → enrolled, etc.).
 *
 * Por ahora es el mismo campo en la misma tabla; este alias es solo
 * claridad de lectura en el código de eventos. Si en el futuro el
 * pipeline comercial se separa del "status del funnel" (ej. cuando
 * tengamos marketing-qualified vs sales-qualified), se puede partir
 * en una columna `commercial_status` propia sin romper el contrato
 * público de esta función.
 */
export async function updateLeadCommercialStatus(
  leadId: string,
  status: string,
  actorEmail: string,
): Promise<AdminLeadOpResult> {
  return updateLeadStatus(leadId, status, actorEmail);
}

/**
 * Archiva un lead (soft delete). El row NO se borra de la tabla:
 * solo cambia `status='archived'`. Esto preserva `lead_consent_log`
 * (prueba de consentimiento LGPD/LFPDPPP) y mantiene la trazabilidad
 * con `event_attendees`, `event_qr_tokens` y demás tablas que se
 * linkean por `phone_normalized` (sin FK a `leads.id`).
 *
 * Optimistic locking: si el bot de WhatsApp (o cualquier otro writer)
 * cambió el `status` del lead entre nuestro SELECT y el UPDATE, el
 * WHERE no matchea y devolvemos conflicto. El admin recarga y reintenta.
 *
 * Regla de compliance: hard delete (`DELETE FROM leads`) está PROHIBIDO
 * en esta fase porque borraría en CASCADE `lead_consent_log`. Si en el
 * futuro hace falta por derecho al olvido, hay que anonimizar el row
 * y transferir la prueba de consentimiento a una tabla archivo ANTES.
 *
 * @param leadId     UUID del lead.
 * @param actorEmail Email del admin (para audit log).
 */
export async function archiveLead(
  leadId: string,
  actorEmail: string,
): Promise<AdminLeadOpResult> {
  if (!checkSupabaseConfig().configured) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!leadId || !actorEmail) {
    return { ok: false, note: "Faltan datos (leadId/actor)." };
  }

  const supabase = createSupabaseAdminClient();

  // 1. SELECT previo del status para audit log con from/to reales
  //    (mismo patrón que updateLeadStatus).
  const { data: prevRow, error: prevErr } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle();

  if (prevErr || !prevRow) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] archiveLead: no se pudo leer status previo", {
      code: prevErr?.code,
      leadId,
    });
    return {
      ok: false,
      note: prevErr
        ? "No se pudo leer el lead antes de archivar."
        : "El lead no existe.",
    };
  }
  const prevStatus = prevRow.status as LeadStatus;

  // 2. UPDATE atómico con optimistic lock. Si el status cambió entre
  //    el SELECT y el UPDATE (bot corrió provide_name o reset status),
  //    el WHERE no matchea y data viene vacío → conflicto reportable.
  const { data, error } = await supabase
    .from("leads")
    .update({ status: "archived" })
    .eq("id", leadId)
    .eq("status", prevStatus)
    .select("*")
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] archiveLead falló", {
      code: error.code,
      leadId,
    });
    return { ok: false, note: "No se pudo archivar el lead." };
  }

  if (!data) {
    return {
      ok: false,
      note: `Conflicto: el lead ya no estaba en "${prevStatus}". Otro proceso pudo haberlo cambiado. Recarga y reintenta.`,
    };
  }

  const lead = mapLeadRowToLead(data as LeadRow);

  // 3. Audit log con acción 'lead_archive' para distinguirlo de
  //    'lead_status_change' genérico (más fácil de buscar/reportes).
  await logAdminAction({
    actor_email: actorEmail,
    action: "lead_archive",
    entity_type: "lead",
    entity_id: leadId,
    metadata: { from: prevStatus, to: "archived" },
  });

  return { ok: true, lead };
}

/**
 * Acciones soportadas por `bulkUpdateLeads`.
 *
 * - `status`: cambia el status comercial del lead (`value` = LeadStatus).
 * - `archive`: archiva el lead (soft delete). `value` se ignora.
 * - `owner`: reasigna el responsable del lead. `value` = owner id (UUID).
 *
 * ⚠️ No soporta borrado físico (DELETE). El derecho al olvido se maneja
 * anonimizando el row, no borrándolo (ver comentario en `archiveLead`).
 */
export type BulkAction = "status" | "archive" | "owner";

/**
 * Resultado de una operación bulk sobre N leads.
 *
 * - `succeeded` = aplicados OK (optimistic lock pasó).
 * - `conflicted` = el status del lead cambió entre SELECT y UPDATE
 *   (probablemente el bot lo tocó en medio). El admin ve el conflicto
 *   y puede reintentar.
 * - `failed` = error de DB / no existe / input inválido.
 */
export interface BulkUpdateLeadsResult {
  ok: boolean;
  totalRequested: number;
  succeeded: number;
  conflicted: number;
  failed: number;
  bulkActionId: string;
  errors?: Array<{ leadId: string; reason: string }>;
  note?: string;
}

/**
 * Aplica una acción en bulk a una lista de leads con optimistic locking.
 *
 * Defensa contra race conditions:
 *   1. SELECT previo del status actual de TODOS los leads (1 query con
 *      `.in('id', leadIds)`).
 *   2. UPDATE por-lead con `.eq("status", prevStatus)` (N queries en
 *      paralelo via `Promise.allSettled`).
 *   3. Si entre el SELECT y el UPDATE el bot cambió el status de algún
 *      lead, el WHERE no matchea y `data` viene vacío → contamos como
 *      `conflicted` (no silencioso).
 *
 * Auditoría: N entradas en `admin_audit_log` (una por lead modificado
 * con éxito), todas con `metadata.bulk_action_id` compartido para que
 * se puedan agrupar en queries/reportes. Esto preserva trazabilidad
 * por-lead a 6 meses vista ("cuándo se archivó el lead X").
 *
 * Rate limit: responsabilidad del route handler (`/api/admin/leads/bulk`).
 * Esta función NO se autolimita — confia en que el caller lo haga.
 *
 * @param leadIds    Lista de UUIDs de leads a modificar.
 * @param action     Tipo de acción bulk.
 * @param value      Valor nuevo (status string, owner id, o vacío para archive).
 * @param actorEmail Email del admin (para audit log).
 */
export async function bulkUpdateLeads(
  leadIds: string[],
  action: BulkAction,
  value: string,
  actorEmail: string,
): Promise<BulkUpdateLeadsResult> {
  const bulkActionId = crypto.randomUUID();
  const empty: BulkUpdateLeadsResult = {
    ok: false,
    totalRequested: leadIds.length,
    succeeded: 0,
    conflicted: 0,
    failed: 0,
    bulkActionId,
    errors: [],
    note: "",
  };

  if (!checkSupabaseConfig().configured) {
    return {
      ...empty,
      note: "Supabase no configurado.",
    };
  }
  if (!leadIds || leadIds.length === 0) {
    return {
      ...empty,
      note: "leadIds vacío.",
    };
  }
  if (!actorEmail) {
    return {
      ...empty,
      note: "Falta actorEmail.",
    };
  }
  if (action === "status" && !isLeadStatus(value)) {
    return {
      ...empty,
      note: `Status inválido: ${value}`,
    };
  }
  // action='archive' ignora value. action='owner' lo acepta como string
  // (validación de UUID se hace al insertar en leads.owner_id FK).

  const supabase = createSupabaseAdminClient();

  // 1. SELECT previo del status de TODOS los leads en una sola query.
  //    Esto es el "snapshot" contra el que validamos con optimistic lock.
  const { data: prevRows, error: prevErr } = await supabase
    .from("leads")
    .select("id, status")
    .in("id", leadIds);

  if (prevErr) {
    // eslint-disable-next-line no-console
    console.error("[leads-admin] bulkUpdateLeads: SELECT previo falló", {
      code: prevErr.code,
      requested: leadIds.length,
    });
    return {
      ...empty,
      note: "No se pudieron leer los leads antes del bulk.",
    };
  }

  // Index prev rows por id para lookup O(1) en el paso 2.
  const prevById = new Map<string, string>();
  for (const r of prevRows ?? []) {
    prevById.set(r.id as string, r.status as string);
  }

  // 2. UPDATE por-lead en paralelo. Cada uno con su propio optimistic
  //    lock (prevStatus del paso 1).
  const updateOne = async (
    leadId: string,
  ): Promise<
    | { kind: "ok"; leadId: string; prevStatus: string; newRow: LeadRow }
    | { kind: "conflict"; leadId: string; prevStatus: string | undefined }
    | { kind: "not_found"; leadId: string }
    | { kind: "error"; leadId: string; reason: string }
  > => {
    const prevStatus = prevById.get(leadId);
    if (!prevStatus) {
      // El lead no estaba en el SELECT previo → no existe o fue borrado
      // entre el inicio de bulkUpdateLeads y ahora.
      return { kind: "not_found", leadId };
    }

    // El payload es unión discriminada: status es enum estricto (validado
    //    arriba con isLeadStatus), owner_id es string arbitrario. Usamos
    //    `as never` porque Supabase infiere tipos muy estrechos para
    //    columnas enum y aquí ya validamos runtime.
    const updatePayload: never =
      action === "archive"
        ? ({ status: "archived" } as never)
        : action === "status"
        ? ({ status: value } as never)
        : ({ owner_id: value } as never);

    const { data, error } = await supabase
      .from("leads")
      .update(updatePayload)
      .eq("id", leadId)
      .eq("status", prevStatus as never) // optimistic lock (cast: query builder strict)
      .select("*")
      .maybeSingle();

    if (error) {
      return { kind: "error", leadId, reason: error.message };
    }
    if (!data) {
      // WHERE no matcheó: el status cambió entre SELECT y UPDATE.
      return { kind: "conflict", leadId, prevStatus };
    }
    return { kind: "ok", leadId, prevStatus, newRow: data as LeadRow };
  };

  const settled = await Promise.allSettled(leadIds.map((id) => updateOne(id)));

  let succeeded = 0;
  let conflicted = 0;
  let failed = 0;
  const errors: Array<{ leadId: string; reason: string }> = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const leadId = leadIds[i];
    if (result.status === "rejected") {
      failed++;
      errors.push({ leadId, reason: String(result.reason) });
      continue;
    }
    const r = result.value;
    if (r.kind === "ok") {
      succeeded++;
      // 3. Audit log por-lead (N entries, agrupadas por bulk_action_id).
      //    Mejor que una entry masiva porque preserva trazabilidad
      //    individual ("cuándo se archivó el lead X").
      await logAdminAction({
        actor_email: actorEmail,
        action:
          action === "archive"
            ? "lead_archive"
            : action === "status"
            ? "lead_status_change"
            : "lead_owner_change",
        entity_type: "lead",
        entity_id: r.leadId,
        metadata: {
          bulk_action_id: bulkActionId,
          from: r.prevStatus,
          to: action === "archive" ? "archived" : value || null,
        },
      });
    } else if (r.kind === "conflict") {
      conflicted++;
      errors.push({
        leadId: r.leadId,
        reason: `Conflicto: el lead ya no estaba en "${r.prevStatus}". Otro proceso pudo haberlo cambiado.`,
      });
    } else if (r.kind === "not_found") {
      failed++;
      errors.push({ leadId: r.leadId, reason: "Lead no existe." });
    } else {
      failed++;
      errors.push({ leadId: r.leadId, reason: r.reason });
    }
  }

  return {
    ok: succeeded > 0,
    totalRequested: leadIds.length,
    succeeded,
    conflicted,
    failed,
    bulkActionId,
    errors: errors.length > 0 ? errors : undefined,
    note:
      succeeded === leadIds.length
        ? `OK: ${succeeded}/${leadIds.length}.`
        : `${succeeded} OK, ${conflicted} con conflicto, ${failed} con error.`,
  };
}
