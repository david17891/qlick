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
import type { Lead, LeadStatus } from "@/types";

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
