/**
 * Operaciones admin sobre `handoff_requests` (Server-only, Fase 7a.3 → G-10).
 *
 * Leads que cliclkean "Hablar con humano" en el bot de WhatsApp quedan
 * persistidos en `public.handoff_requests` (status pending/contacted/closed).
 * Antes de G-10 no había UI admin: David tenía que mirar la DB a mano para
 * ver quién pidió hablar. Esta lib expone las operaciones de lectura
 * (`listHandoffs`) y actualización de status (`updateHandoffStatus`) con
 * audit log.
 *
 * Server-only. Usa createSupabaseAdminClient() (service role, bypass RLS).
 * El caller (server component / server action) ya validó admin vía
 * requireAdmin().
 *
 * **Tipado:** la tabla `handoff_requests` NO está en el typegen
 * (`src/types/supabase.ts`) porque las migrations se agregaron después de
 * la última corrida de `gen types`. Usamos `from("handoff_requests" as never)`
 * y casteamos los rows a `HandoffRow` manualmente. Regenerar types para
 * tipado fuerte: `npx supabase gen types typescript`.
 *
 * @server
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/supabase";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { logAdminAction } from "./audit-server";

// ─────────────────────────────────────────────────────────────
// Tipos del dominio
// ─────────────────────────────────────────────────────────────

/** Status válidos de `handoff_requests.status` (consistente con el CHECK del SQL). */
export type HandoffStatus = "pending" | "contacted" | "closed";

const HANDOFF_STATUSES: readonly HandoffStatus[] = [
  "pending",
  "contacted",
  "closed",
];

function isHandoffStatus(value: string): value is HandoffStatus {
  return (HANDOFF_STATUSES as readonly string[]).includes(value);
}

/** Item dentro de `last_messages` (jsonb array). */
export interface HandoffMessage {
  direction: "inbound" | "outbound";
  body: string;
  timestamp?: string;
}

/**
 * Fila de `handoff_requests` ya normalizada al dominio.
 * Compatible con `as never` casts desde el query builder (ver notas arriba).
 */
export interface HandoffRow {
  id: string;
  lead_id: string | null;
  lead_name: string;
  lead_phone: string;
  lead_email: string | null;
  last_messages: HandoffMessage[];
  status: HandoffStatus;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  contacted_at: string | null;
  closed_at: string | null;
}

/**
 * Fila cruda devuelta por el query builder (snake_case) — la casteamos
 * a `HandoffRow` antes de devolver al caller.
 */
interface HandoffRowRaw {
  id: string;
  lead_id: string | null;
  lead_name: string;
  lead_phone: string;
  lead_email: string | null;
  last_messages: HandoffMessage[] | null;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  contacted_at: string | null;
  closed_at: string | null;
}

function mapHandoffRow(row: HandoffRowRaw): HandoffRow {
  return {
    id: row.id,
    lead_id: row.lead_id,
    lead_name: row.lead_name ?? "",
    lead_phone: row.lead_phone,
    lead_email: row.lead_email,
    last_messages: Array.isArray(row.last_messages) ? row.last_messages : [],
    status: isHandoffStatus(row.status) ? row.status : "pending",
    assigned_to: row.assigned_to,
    notes: row.notes,
    created_at: row.created_at,
    contacted_at: row.contacted_at,
    closed_at: row.closed_at,
  };
}

// ─────────────────────────────────────────────────────────────
// Filtros / opciones
// ─────────────────────────────────────────────────────────────

export interface ListHandoffsFilters {
  /** Filtra por status exacto. `undefined`/vacío → todos. */
  status?: HandoffStatus | "";
  /** ISO date string. Filtra `created_at >= from`. */
  from?: string;
  /** ISO date string. Filtra `created_at <= to`. */
  to?: string;
  /** Límite (default 50, máx 200). */
  limit?: number;
  /** Offset para paginación. */
  offset?: number;
}

export interface ListHandoffsResult {
  ok: boolean;
  rows: HandoffRow[];
  /** Total de filas que matchean (count sin paginación). */
  total: number;
  /** Mensaje de error (si ok=false). */
  error?: string;
}

export interface ListHandoffsOptions {
  filters?: ListHandoffsFilters;
  /** Inyectado en tests; default = createSupabaseAdminClient(). */
  supabase?: SupabaseClient;
}

/**
 * Lista handoffs con filtros opcionales: status, from, to, paginación.
 *
 * Devuelve `{ ok, rows, total }`. `total` permite a la UI mostrar
 * "Mostrando X de Y".
 *
 * En modo demo (Supabase no configurado) devuelve `{ ok: true, rows: [], total: 0 }`.
 */
export async function listHandoffs(
  options: ListHandoffsOptions = {},
): Promise<ListHandoffsResult> {
  if (!checkSupabaseConfig().configured) {
    return { ok: true, rows: [], total: 0 };
  }

  const { filters = {}, supabase: injected } = options;
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const supabase = injected ?? createSupabaseAdminClient();

  // Cast a never: la tabla `handoff_requests` no está en el typegen
  // (`src/types/supabase.ts`). Mantenemos el chain sin tipos estrictos y
  // casteamos el resultado final a `HandoffRowRaw[]`.
  let chain: any = (
    supabase.from("handoff_requests" as never) as unknown as { select: (cols: string, opts?: { count?: "exact" }) => any }
  ).select("*", { count: "exact" });

  if (filters.status && isHandoffStatus(filters.status)) {
    chain = chain.eq("status", filters.status);
  }
  if (filters.from) {
    chain = chain.gte("created_at", filters.from);
  }
  if (filters.to) {
    chain = chain.lte("created_at", filters.to);
  }

  chain = chain.order("created_at", { ascending: false });

  const { data, count, error } = await chain.range(offset, offset + limit - 1);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[handoffs-server] listHandoffs falló", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, rows: [], total: 0, error: error.message ?? "unknown" };
  }

  const rawRows = (data ?? []) as HandoffRowRaw[];
  return {
    ok: true,
    rows: rawRows.map(mapHandoffRow),
    total: count ?? rawRows.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Actualización de status
// ─────────────────────────────────────────────────────────────

export interface UpdateHandoffStatusInput {
  handoffId: string;
  newStatus: HandoffStatus;
  /** Email del admin (para audit log). */
  actorEmail: string;
  /** Notas opcionales que se persisten en `handoff_requests.notes`. */
  notes?: string | null;
}

export interface UpdateHandoffStatusResult {
  ok: boolean;
  note?: string;
  handoff?: HandoffRow;
}

export interface UpdateHandoffStatusOptions {
  /** Inyectado en tests; default = createSupabaseAdminClient(). */
  supabase?: SupabaseClient;
}

/**
 * Cambia el status de un handoff. Server-only, admin.
 *
 * Validaciones:
 *   - Supabase configurado.
 *   - actorEmail y handoffId no vacíos.
 *   - newStatus ∈ {pending, contacted, closed}.
 *
 * Side effects:
 *   - Si newStatus='contacted' → setea `contacted_at = now()`.
 *   - Si newStatus='closed' → setea `closed_at = now()`.
 *   - Escribe en `admin_audit_log` (action='handoff_status_change') con
 *     `before`/`after` snapshots (Fase 5 Bloque 2).
 *
 * Devuelve la fila actualizada.
 */
export async function updateHandoffStatus(
  input: UpdateHandoffStatusInput,
  options: UpdateHandoffStatusOptions = {},
): Promise<UpdateHandoffStatusResult> {
  if (!checkSupabaseConfig().configured) {
    return { ok: false, note: "Supabase no configurado." };
  }
  if (!input.handoffId || !input.actorEmail) {
    return { ok: false, note: "Faltan datos (handoffId/actor)." };
  }
  if (!isHandoffStatus(input.newStatus)) {
    return { ok: false, note: `Status inválido: ${input.newStatus}.` };
  }

  const supabase = options.supabase ?? createSupabaseAdminClient();

  // 1. Leemos el row actual para snapshot `before` y para el cast a HandoffRow
  //    post-update. Validamos que el handoff exista antes de tocar nada.
  // Cast a any: la tabla `handoff_requests` no está en el typegen.
  const fromQuery = (
    supabase.from("handoff_requests" as never) as unknown as { select: (cols: string) => any }
  );
  const { data: prevRow, error: prevErr } = await fromQuery
    .select("*")
    .eq("id", input.handoffId)
    .maybeSingle();

  if (prevErr) {
    // eslint-disable-next-line no-console
    console.error("[handoffs-server] updateHandoffStatus: no se pudo leer row previo", {
      code: (prevErr as { code?: string }).code,
    });
    return { ok: false, note: "No se pudo leer el handoff antes de actualizar." };
  }
  if (!prevRow) {
    return { ok: false, note: "Handoff no existe." };
  }
  const prev = mapHandoffRow(prevRow as HandoffRowRaw);

  if (prev.status === input.newStatus) {
    // No-op: evita ruido en audit log y writes innecesarias.
    return { ok: true, note: `El handoff ya estaba en "${input.newStatus}".`, handoff: prev };
  }

  // 2. UPDATE atómico. Usamos un update condicional sobre `status` para
  //    cerrar la race window entre el SELECT y el UPDATE (mismo patrón que
  //    leads-admin-server.ts).
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status: input.newStatus };
  if (input.newStatus === "contacted") {
    patch.contacted_at = nowIso;
  }
  if (input.newStatus === "closed") {
    patch.closed_at = nowIso;
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes;
  }

  const updateChain = (
    supabase.from("handoff_requests" as never) as unknown as {
      update: (patch: Record<string, unknown>) => any;
    }
  );

  const { data: updatedRow, error: updateErr } = await updateChain
    .update(patch)
    .eq("id", input.handoffId)
    .eq("status", prev.status)
    .select("*")
    .maybeSingle();

  if (updateErr) {
    // eslint-disable-next-line no-console
    console.error("[handoffs-server] updateHandoffStatus falló", {
      code: updateErr.code,
    });
    return { ok: false, note: "No se pudo actualizar el handoff." };
  }
  if (!updatedRow) {
    // El WHERE no matcheó (otro proceso cambió el status entre SELECT y UPDATE).
    return {
      ok: false,
      note: `Conflicto: el handoff ya no estaba en "${prev.status}". Recarga y reintenta.`,
    };
  }

  const next = mapHandoffRow(updatedRow);

  // 3. Audit log con from/to + snapshots before/after.
  await logAdminAction({
    actor_email: input.actorEmail,
    action: "handoff_status_change",
    entity_type: "handoff_request",
    entity_id: input.handoffId,
    metadata: {
      from: prev.status,
      to: input.newStatus,
      lead_phone: prev.lead_phone,
    },
    before: { status: prev.status } as unknown as Json,
    after: { status: input.newStatus } as unknown as Json,
  });

  return { ok: true, note: `Handoff marcado como ${input.newStatus}.`, handoff: next };
}

// ─────────────────────────────────────────────────────────────
// Cross-table lookup: evento más reciente del lead (opcional, mejor UX)
// ─────────────────────────────────────────────────────────────

export interface RecentEventContext {
  eventId: string;
  eventTitle: string | null;
  /** ISO timestamp del evento. */
  startsAt: string | null;
  /** ISO del confirmation_at. */
  confirmedAt: string | null;
}

/**
 * Busca el evento más reciente que el lead (por `phone_normalized`) confirmó.
 *
 * **OJO:** `handoff_requests` no tiene FK a `events`. Matcheamos por
 * `phone_normalized` contra `event_confirmations.phone_normalized` (que
 * tiene índice). Best-effort: si la query falla, devuelve `null` y la UI
 * sigue funcionando sin el contexto.
 *
 * Server-only. Inyectable para tests.
 */
export async function getRecentEventForHandoff(
  phoneNormalized: string,
  options: { supabase?: SupabaseClient } = {},
): Promise<RecentEventContext | null> {
  if (!checkSupabaseConfig().configured) return null;
  if (!phoneNormalized) return null;

  const supabase = options.supabase ?? createSupabaseAdminClient();

  // Cast a any para event_confirmations (puede estar en typegen, pero lo
  // blindamos por si la columna cambia).
  const chain = (
    supabase.from("event_confirmations" as never) as unknown as {
      select: (cols: string) => any;
    }
  );
  const { data, error } = await chain
    .select("event_id, confirmed_at, events:event_id(id, title, starts_at)")
    .eq("phone_normalized", phoneNormalized)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const d = data as {
    event_id: string;
    confirmed_at: string | null;
    events: { id: string; title: string | null; starts_at: string | null } | null;
  };

  return {
    eventId: d.events?.id ?? d.event_id,
    eventTitle: d.events?.title ?? null,
    startsAt: d.events?.starts_at ?? null,
    confirmedAt: d.confirmed_at,
  };
}
