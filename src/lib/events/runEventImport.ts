/**
 * runEventImport — orquestador server-only del import wizard (Fase 4).
 *
 * Combina el parser puro (`importer.ts`) con los server libs de
 * confirmations/attendees/surveys para insertar filas reales en Supabase.
 * Soporta dry-run (solo parsea, no toca DB) y modo real (inserta con
 * dedup atómico por UNIQUE constraints + importBatchId para rollback).
 *
 * Server-only: usa cliente admin (bypass RLS). El caller valida admin.
 *
 * @server
 */

import { randomUUID } from "node:crypto";
import type {
  EventImportType,
  EventImportSummary,
  ImportWarning,
} from "@/types/events";
import {
  parseXlsxForImport,
  mapSourceToEnum,
  type NormalizedRow,
  type ParsedSheet,
} from "./importer";
import { createConfirmation } from "./confirmations-server";
import { createAttendee } from "./attendees-server";
import { createSurvey } from "./surveys-server";
import { promoteSurveyToLead } from "./promotion";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { logAdminAction } from "@/lib/crm/audit-server";

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

export interface RunEventImportInput {
  eventId: string;
  eventSlug: string; // para el summary (UX)
  buffer: Buffer | Uint8Array;
  type: EventImportType;
  /** Override del mapeo de headers (canonical → header Excel). Opcional. */
  mapOverride?: Record<string, string>;
  /** Si true, solo parsea + simula; NO inserta en DB. */
  dryRun: boolean;
  /** Email del admin (audit log). */
  actorEmail: string;
}

// ─────────────────────────────────────────────────────────────
// Orquestador
// ─────────────────────────────────────────────────────────────

/**
 * Ejecuta (o simula) un import. Devuelve siempre un summary con conteos
 * + warnings, listo para mostrar al admin en el wizard.
 */
export async function runEventImport(
  input: RunEventImportInput,
): Promise<EventImportSummary> {
  const startedAt = Date.now();

  if (!checkSupabaseConfig().configured) {
    return {
      batchId: "demo",
      eventSlug: input.eventSlug,
      importType: input.type,
      totalRows: 0,
      inserted: 0,
      skippedDuplicates: 0,
      skippedInvalid: 0,
      warnings: [
        {
          row: 0,
          field: "_supabase",
          note: "Supabase no configurado (modo demo). El wizard funciona solo con DB real.",
        },
      ],
      durationMs: Date.now() - startedAt,
    };
  }

  if (!input.eventId || !input.buffer || !input.type) {
    return {
      batchId: "invalid",
      eventSlug: input.eventSlug,
      importType: input.type,
      totalRows: 0,
      inserted: 0,
      skippedDuplicates: 0,
      skippedInvalid: 0,
      warnings: [
        {
          row: 0,
          field: "_input",
          note: "Faltan datos requeridos (eventId/buffer/type).",
        },
      ],
      durationMs: Date.now() - startedAt,
    };
  }

  // 1. Parsear el Excel (puro, sin DB).
  let parsed: ParsedSheet;
  try {
    parsed = parseXlsxForImport(input.buffer, input.type, {
      mapOverride: input.mapOverride,
    });
  } catch (err) {
    return {
      batchId: "parse_error",
      eventSlug: input.eventSlug,
      importType: input.type,
      totalRows: 0,
      inserted: 0,
      skippedDuplicates: 0,
      skippedInvalid: 0,
      warnings: [
        {
          row: 0,
          field: "_xlsx",
          note: `No se pudo parsear el Excel: ${err instanceof Error ? err.message : "error desconocido"}`,
        },
      ],
      durationMs: Date.now() - startedAt,
    };
  }

  const totalRows = parsed.rows.length;
  const warnings: ImportWarning[] = [...parsed.warnings];

  // Dry-run: devolvemos summary estimado sin tocar DB.
  if (input.dryRun) {
    const simInvalid = parsed.rows.filter((r) => !isInsertable(r, input.type))
      .length;
    return {
      batchId: "dryrun",
      eventSlug: input.eventSlug,
      importType: input.type,
      totalRows,
      inserted: 0,
      skippedDuplicates: 0, // no podemos saber sin DB; lo dejamos en 0
      skippedInvalid: simInvalid,
      warnings: [
        ...warnings,
        ...(simInvalid > 0
          ? [
              {
                row: 0,
                field: "_dryrun",
                note: `Dry-run: ${simInvalid} fila(s) no se insertarían (faltan datos clave).`,
              },
            ]
          : []),
        {
          row: 0,
          field: "_dryrun",
          note: "Dry-run NO tocó la DB. Marcá 'Importar de verdad' para ejecutar.",
        },
      ],
      durationMs: Date.now() - startedAt,
    };
  }

  // 2. Import real: batchId + inserts secuenciales con dedup atómico.
  const batchId = randomUUID();
  let inserted = 0;
  let skippedDuplicates = 0;
  let skippedInvalid = 0;

  for (const row of parsed.rows) {
    if (!isInsertable(row, input.type)) {
      skippedInvalid++;
      continue;
    }

    const result = await insertOne(row, input, batchId);
    if (result === "inserted") inserted++;
    else if (result === "duplicate") skippedDuplicates++;
    else skippedInvalid++;
  }

  // 3. Audit log (best-effort).
  await logAdminAction({
    actor_email: input.actorEmail,
    action: `event_import_${input.type}`,
    entity_type: "event",
    entity_id: input.eventId,
    metadata: {
      batchId,
      totalRows,
      inserted,
      skippedDuplicates,
      skippedInvalid,
    },
  });

  return {
    batchId,
    eventSlug: input.eventSlug,
    importType: input.type,
    totalRows,
    inserted,
    skippedDuplicates,
    skippedInvalid,
    warnings,
    durationMs: Date.now() - startedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────

/**
 * ¿La fila tiene los datos mínimos para ser insertada según el tipo?
 * Usado para contar `skippedInvalid` antes de gastar round-trips a DB.
 */
function isInsertable(row: NormalizedRow, type: EventImportType): boolean {
  if (type === "confirmation") {
    return !!row.name?.trim();
  }
  if (type === "attendee") {
    // Attendee acepta fila sin nombre si tiene email o phone (alguien
    // que se quedó sin decir nombre pero dejó contacto).
    return !!(
      row.name?.trim() ||
      row.email?.trim() ||
      row.phoneNormalized?.trim()
    );
  }
  if (type === "survey") {
    // Survey sin consent es "invalid" para el funnel (no genera lead,
    // pero igual lo guardamos con consent=false para visibilidad).
    // Acá sí la dejamos pasar si tiene al menos email o phone (es
    // anónimo de otra forma y no aporta nada).
    return !!(row.email?.trim() || row.phoneNormalized?.trim());
  }
  return false;
}

type InsertOutcome = "inserted" | "duplicate" | "invalid";

async function insertOne(
  row: NormalizedRow,
  input: RunEventImportInput,
  batchId: string,
): Promise<InsertOutcome> {
  if (input.type === "confirmation") {
    const res = await createConfirmation({
      eventId: input.eventId,
      name: row.name,
      email: row.email ?? null,
      phoneRaw: row.phoneRaw ?? null,
      phoneNormalized: row.phoneNormalized ?? null,
      source: mapSourceToEnum(row.sourceRaw, "imported_excel") as
        | "imported_excel"
        | "public_form"
        | "manual",
      importBatchId: batchId,
    });
    return res.created ? "inserted" : res.ok ? "duplicate" : "invalid";
  }

  if (input.type === "attendee") {
    const res = await createAttendee({
      eventId: input.eventId,
      name: row.name ?? null,
      email: row.email ?? null,
      phoneNormalized: row.phoneNormalized ?? null,
      source: mapSourceToEnum(row.sourceRaw, "imported_excel") as
        | "imported_excel"
        | "check_in"
        | "zoom_export"
        | "manual",
      checkedInBy: input.actorEmail,
      importBatchId: batchId,
    });
    return res.created ? "inserted" : res.ok ? "duplicate" : "invalid";
  }

  // type === "survey"
  // Mapeamos los campos del Excel al shape de createSurvey.
  // `responses` es jsonb libre → guardamos todo lo parseado para
  // auditoría aunque no usemos cada campo.
  const consentBool = typeof row.consent === "boolean" ? row.consent : false;
  const res = await createSurvey({
    eventId: input.eventId,
    respondentEmail: row.email ?? null,
    respondentPhone: row.phoneRaw ?? null,
    phoneNormalized: row.phoneNormalized ?? null,
    responses: {
      name: row.name,
      interest: row.interest,
      source: row.sourceRaw,
      attended: row.attended,
      consent_raw: row.consent as unknown,
    },
    consentToContact: consentBool,
    commercialInterest: row.interest ?? null,
    importBatchId: batchId,
  });
  if (!res.ok) return "invalid";

  // Si la encuesta tiene consent + datos de contacto, evaluamos promoción
  // a lead. La promoción es idempotente (si ya estaba, no duplica).
  if (res.survey && consentBool && (res.survey.respondentEmail || res.survey.phoneNormalized)) {
    await promoteSurveyToLead(res.survey.id, { actorEmail: input.actorEmail });
  }
  return "inserted";
}