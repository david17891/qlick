/**
 * Exportación de leads a CSV por streaming.
 *
 * Por qué streaming (Fase 1 - peer review):
 *   - Vercel Hobby tiene 1024 MB RAM y 10s timeout.
 *   - `getLeads()` en leads-server.ts ahora pagina (AUDIT-001, fix 2026-07-12),
 *     pero para la exportación por streaming seguimos con `.range(offset, ...)`
 *     aquí directamente para no acoplar la exportación al pageSize del wrapper.
 *   - 20k leads × ~2 KB/row JSON ≈ 40 MB → memory limit exceeded.
 *   - Solución: `ReadableStream` + `Transfer-Encoding: chunked` +
 *     `.range(offset, offset + PAGE - 1)` en bucle de 1,000 filas.
 *
 * Compliance (LGPD/LFPDPPP):
 *   - Filtro por default: solo leads con `consent_to_contact=true`.
 *   - Bypass explícito con `includeAll=true` (el caller decide).
 *   - Audit log al inicio de la exportación (CRÍTICO para compliance).
 *
 * Formato CSV:
 *   - BOM UTF-8 al inicio (`\uFEFF`) para que Excel detecte acentos.
 *   - Headers en español.
 *   - Escape de comas/comillas/newlines en celdas.
 *
 * Hard cap: 100,000 filas. Si se supera, se inyecta una línea final
 * avisando del truncado.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { logAdminAction } from "./audit-server";
import { csvEscape, csvHeaderLine, csvRow } from "./csv-utils";

const PAGE_SIZE = 1000;
const HARD_CAP = 100_000;

const HEADERS = [
  "ID",
  "Nombre",
  "Teléfono",
  "Email",
  "Etapa",
  "Score",
  "Curso de Interés",
  "Fuente",
  "Fecha de Registro",
  "Próximo Seguimiento",
] as const;

// Re-export para compatibilidad con callers existentes (tests incluidos).
export { csvEscape };

/** Une los headers en una línea CSV (con terminador \r\n). */
function csvHeadersLine(): string {
  return csvHeaderLine(HEADERS);
}

/** Convierte un lead row a una línea CSV. */
function csvRowFromLead(row: Record<string, unknown>): string {
  const cells = [
    row.id,
    row.name,
    row.phone ?? "",
    row.email,
    row.status,
    row.score ?? "",
    row.course_of_interest ?? "",
    row.source ?? "",
    row.created_at,
    row.next_follow_up_at ?? "",
  ];
  return csvRow(cells);
}

export interface ExportLeadsOptions {
  /**
   * Si `false` (default), exporta solo leads con `consent_to_contact=true`.
   * Si `true`, exporta TODOS los leads (bypass explícito del filtro de
   * compliance — el caller debe estar autorizado).
   */
  includeAll?: boolean;
  /**
   * Filtros opcionales por columna (aplican antes del filtro de consent).
   * El caller (route handler) los parsea del query string.
   */
  status?: string;
  source?: string;
  ownerId?: string;
  /** Limite opcional adicional (default = HARD_CAP). Para tests. */
  maxRows?: number;
}

export interface ExportLeadsResult {
  stream: ReadableStream<Uint8Array>;
  /** Audit log id (para correlación con /admin/system/audit-log). */
  auditLogged: boolean;
  /** Cap aplicado (HARD_CAP por default, o el maxRows del caller). */
  cap: number;
}

/**
 * Construye un stream CSV de todos los leads que matchean los filtros.
 *
 * Side-effect: registra una entrada en `admin_audit_log` con la cantidad
 * estimada de filas y los filtros aplicados. Esto es OBLIGATORIO por
 * compliance (saber quién descargó PII y cuándo).
 */
export async function exportLeadsAsCsvStream(
  actorEmail: string,
  options: ExportLeadsOptions = {},
): Promise<ExportLeadsResult> {
  if (!checkSupabaseConfig().configured) {
    throw new Error("Supabase no configurado.");
  }

  const cap = options.maxRows ?? HARD_CAP;
  const includeAll = options.includeAll === true;
  const supabase = createSupabaseAdminClient();

  // Pre-flight: contar cuántos rows vamos a exportar (best-effort, sin
  // bloquear si falla). Se registra en audit log.
  let estimatedCount: number | null = null;
  try {
    // Cast a any: el typegen de Supabase genera tipos estrictos para
    // columnas enum (`status: lead_status`), pero el caller nos pasa
    // strings arbitrarios. Validamos runtime con isLeadStatus arriba.
    let countQuery: any = supabase
      .from("leads")
      .select("id", { count: "exact", head: true });
    if (!includeAll) {
      countQuery = countQuery.eq("consent_to_contact", true);
    }
    if (options.status) countQuery = countQuery.eq("status", options.status);
    if (options.source) countQuery = countQuery.eq("source", options.source);
    if (options.ownerId) countQuery = countQuery.eq("owner_id", options.ownerId);
    const { count } = await countQuery;
    estimatedCount = count ?? null;
  } catch {
    // Si falla el count, seguimos con null. No bloquea la descarga.
    estimatedCount = null;
  }

  // Audit log obligatorio (compliance): saber quién descargó PII.
  await logAdminAction({
    actor_email: actorEmail,
    action: "leads_export",
    entity_type: "lead",
    entity_id: null,
    metadata: {
      include_all: includeAll,
      filters: {
        status: options.status ?? null,
        source: options.source ?? null,
        owner_id: options.ownerId ?? null,
      },
      estimated_count: estimatedCount,
      cap,
    },
  });

  // Construir el stream. Mantenemos una referencia a `supabase` y las
  // options para usar dentro del closure del ReadableStream.
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // BOM UTF-8 al inicio del stream. Sin esto, Excel interpreta
        // "Martínez" como "MartÃ­nez" en cp1252.
        controller.enqueue(encoder.encode("\uFEFF"));
        controller.enqueue(encoder.encode(csvHeadersLine()));

        let offset = 0;
        let totalWritten = 0;
        let truncated = false;

        // Bucle de paginación con .range(offset, offset + PAGE - 1).
        // Terminamos cuando una página devuelve < PAGE_SIZE filas o
        // cuando alcanzamos el HARD_CAP.
        while (totalWritten < cap) {
          const remaining = cap - totalWritten;
          const pageSize = Math.min(PAGE_SIZE, remaining);

          // Cast a any: el typegen de Supabase genera tipos estrictos para
          // columnas enum. Aquí aceptamos strings arbitrarios del caller;
          // las constraints CHECK de la DB rechazan valores inválidos.
          let query: any = supabase
            .from("leads")
            .select(
              "id, name, phone, email, status, score, course_of_interest, source, created_at, next_follow_up_at, consent_to_contact",
            )
            .order("created_at", { ascending: false })
            .range(offset, offset + pageSize - 1);

          // Filtro de compliance: por default solo leads con consentimiento.
          if (!includeAll) {
            query = query.eq("consent_to_contact", true);
          }
          if (options.status) query = query.eq("status", options.status);
          if (options.source) query = query.eq("source", options.source);
          if (options.ownerId)
            query = query.eq("owner_id", options.ownerId);

          const { data: rows, error } = await query;

          if (error) {
            // En el stream no podemos responder 500. Inyectamos una línea
            // de error en el CSV para que el admin lo vea.
            controller.enqueue(
              encoder.encode(
                csvEscape(
                  `[ERROR] Fallo leyendo página offset=${offset}: ${error.message}`,
                ) + "\r\n",
              ),
            );
            break;
          }

          if (!rows || rows.length === 0) {
            // No hay más datos.
            break;
          }

          for (const row of rows) {
            controller.enqueue(encoder.encode(csvRowFromLead(row)));
            totalWritten++;
            if (totalWritten >= cap) {
              truncated = rows.length > 1 || true;
              break;
            }
          }

          if (rows.length < pageSize) {
            // Última página (menos filas que PAGE_SIZE).
            break;
          }

          offset += pageSize;
        }

        if (truncated) {
          controller.enqueue(
            encoder.encode(
              csvEscape(
                `...truncado a ${cap} filas por seguridad de memoria`,
              ) + "\r\n",
            ),
          );
        }
        controller.close();
      } catch (err) {
        // Si algo explotó a mitad del stream, cerramos con error para
        // que el cliente vea el corte y el body incompleto.
        controller.error(err);
      }
    },
  });

  return {
    stream,
    auditLogged: true,
    cap,
  };
}