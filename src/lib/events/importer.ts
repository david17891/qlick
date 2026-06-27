/**
 * Importador de Excels para eventos (Fase 3).
 *
 * Esta capa es **pura** (no toca la DB). Recibe un buffer de Excel y un
 * tipo de import (`confirmation`/`attendee`/`survey`), y devuelve filas
 * normalizadas + warnings de data quality. La capa CLI (scripts/import-event.mjs)
 * toma esas filas y las inserta con los server libs.
 *
 * Diseño basado en el Excel real del cliente (lista de asistencia
 * "Marketing + IA en UABC Km 43"):
 * - Los headers NO están en la fila 1: las primeras 3 filas son
 *   metadata del evento (título, fecha, descripción).
 * - "Asistió" puede venir como `Sí`, `Si`, `Yes`, `✓`, `true`, `1`.
 * - "Consent" (encuesta) puede venir como `Sí`/`No`, `Yes`/`No`,
 *   `true`/`false`, `1`/`0`.
 * - Teléfonos vienen como 10 dígitos sin código de país → +52 por default.
 * - Headers pueden variar entre Excels → auto-mapeo por sinonimos ES/EN
 *   con `--map` opcional para override manual.
 *
 * Privacidad: este módulo es puro, no toca DB ni loggea PII.
 */

import * as XLSX from "xlsx";
import type {
  EventImportType,
  EventConfirmationSource,
  EventAttendeeSource,
  ImportWarning,
} from "@/types/events";
import { normalizePhone } from "../crm/phone-utils";

// ─────────────────────────────────────────────────────────────
// Sinonimos de headers (ES + EN)
// ─────────────────────────────────────────────────────────────

/**
 * Mapa de headers aceptados por campo canónico.
 * El match es case-insensitive y trimmed.
 */
export const HEADER_SYNONYMS: Record<string, string[]> = {
  name: ["nombre", "nombres", "name", "full name", "fullname", "nombre completo"],
  email: [
    "correo",
    "email",
    "e-mail",
    "mail",
    "correo electronico",
    "correo electrónico",
    "email address",
  ],
  phone: [
    "teléfono",
    "telefono",
    "phone",
    "celular",
    "tel",
    "whatsapp",
    "telefono celular",
    "número",
    "numero",
  ],
  consent: [
    "consent",
    "consentimiento",
    "acepta",
    "acepta contacto",
    "contact permission",
    "permite contacto",
    "ok contactar",
    "quiero info",
    "quiero que me contacten",
  ],
  interest: [
    "interés",
    "interes",
    "interest",
    "tema de interés",
    "tema de interes",
    "commercial interest",
    "comentarios",
    "tema",
    "topic",
  ],
  source: ["fuente", "source", "origen", "canal", "channel"],
  attended: ["asistió", "asistio", "attended", "presente", "attendance"],
  status: ["estado", "status"],
  email_yes: ["si", "yes", "true", "1", "ok", "sí"],
};

/**
 * Resuelve un header del Excel al campo canónico.
 * Devuelve null si no matchea ninguno conocido.
 */
export function resolveHeader(rawHeader: string): string | null {
  const normalized = rawHeader.trim().toLowerCase();
  for (const [canonical, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.includes(normalized)) return canonical;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Tipos del importer
// ─────────────────────────────────────────────────────────────

/** Fila normalizada, lista para insertar. */
export interface NormalizedRow {
  /** Número de fila en el Excel (1-indexed, contando la fila de headers). */
  rowNumber: number;
  name: string;
  email?: string | null;
  phoneRaw?: string | null;
  phoneNormalized?: string | null;
  /** Para attendee: si asistió (boolean). */
  attended?: boolean;
  /** Para survey: si dio consentimiento. */
  consent?: boolean;
  /** Para survey: texto libre de interés comercial. */
  interest?: string | null;
  /** Fuente cruda (string del Excel), se mapea al enum abajo. */
  sourceRaw?: string | null;
}

/** Resultado de parsear un Excel entero. */
export interface ParsedSheet {
  headers: Record<string, string>; // canonical → header del Excel
  rows: NormalizedRow[];
  warnings: ImportWarning[];
}

// ─────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────

function isEmptyCell(cell: unknown): boolean {
  if (cell == null) return true;
  if (typeof cell === "string" && cell.trim() === "") return true;
  return false;
}

function normalizeCell(cell: unknown): unknown {
  if (cell == null) return "";
  return cell;
}

function isValidEmailShape(email: string): boolean {
  // Regex mínima (la DB tiene CHECK constraint más estricta).
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/**
 * Parsea un valor "sí/no" tolerante a variaciones.
 * Devuelve boolean o null si no se puede parsear.
 */
export function parseYesNo(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  const s = String(value).trim().toLowerCase();
  if (["sí", "si", "yes", "true", "1", "ok", "✓", "✔", "x"].includes(s)) return true;
  if (["no", "false", "0", "", "✗", "✘"].includes(s)) return false;
  return null;
}

/**
 * Mapea un sourceRaw (del Excel) al enum del dominio.
 */
export function mapSourceToEnum(
  sourceRaw: string | null | undefined,
  defaultValue: EventConfirmationSource | EventAttendeeSource,
): EventConfirmationSource | EventAttendeeSource {
  if (!sourceRaw) return defaultValue;
  const s = sourceRaw.toLowerCase();
  if (s.includes("messenger")) return "imported_excel";
  if (s.includes("whatsapp")) return "imported_excel";
  if (s.includes("form")) return "public_form";
  if (s.includes("manual")) return "manual";
  if (s.includes("zoom")) return "zoom_export";
  if (s.includes("check")) return "check_in";
  return defaultValue;
}

// ─────────────────────────────────────────────────────────────
// API pública para el CLI (re-exporta el parser final)
// ─────────────────────────────────────────────────────────────

/**
 * Punto de entrada del parser. El CLI usa esta función.
 *
 * Devuelve filas normalizadas + warnings, listos para que el CLI
 * los inserte en batch usando los server libs.
 */
export function parseXlsxForImport(
  buffer: Buffer | Uint8Array,
  type: EventImportType,
  options: { mapOverride?: Record<string, string> } = {},
): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      headers: {},
      rows: [],
      warnings: [{ row: 0, field: "_sheet", note: "Empty workbook" }],
    };
  }
  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });

  // 1. Detectar fila de headers (preservando ORDEN para matchear por índice).
  const headerResult = detectHeadersOrdered(aoa, options.mapOverride);
  if (headerResult.headerRowIdx === -1) {
    return {
      headers: {},
      rows: [],
      warnings: [
        {
          row: 0,
          field: "_headers",
          note:
            "No se encontraron headers reconocibles. Probá --map '{\"telefono\":\"phone\"}' para forzar.",
        },
      ],
    };
  }
  const { headerRowIdx, orderedCanonical, headerMap } = headerResult;

  // 2. Parsear filas debajo del header.
  const rows: NormalizedRow[] = [];
  const warnings: ImportWarning[] = [];

  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const rawRow = aoa[i];
    if (!Array.isArray(rawRow)) continue;
    if (rawRow.every((c) => isEmptyCell(c))) continue;

    const rowNumber = i - headerRowIdx;
    const { normalized, rowWarnings } = buildNormalizedRow(
      rawRow,
      orderedCanonical,
      headerMap,
      type,
      rowNumber,
    );
    rows.push(normalized);
    warnings.push(...rowWarnings);
  }

  return { headers: headerMap, rows, warnings };
}

/**
 * Versión "ordered" del detector de headers: devuelve el array de
 * canonical headers en el orden en que aparecen en el Excel.
 */
function detectHeadersOrdered(
  aoa: unknown[][],
  mapOverride?: Record<string, string>,
): {
  headerRowIdx: number;
  orderedCanonical: string[];
  headerMap: Record<string, string>;
} {
  const MAX_SCAN = 20;

  for (let i = 0; i < Math.min(aoa.length, MAX_SCAN); i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;

    const orderedCanonical: string[] = [];
    const headerMap: Record<string, string> = {};

    // Override primero: si el usuario pasó --map, esos headers mandan.
    if (mapOverride) {
      for (const [canonical, excelHeader] of Object.entries(mapOverride)) {
        orderedCanonical.push(canonical);
        headerMap[canonical] = excelHeader;
      }
    }

    // Auto-detección para los que no estén en el override.
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      const trimmed = cell.trim();
      if (!trimmed) continue;
      const canonical = resolveHeader(trimmed);
      if (canonical && !headerMap[canonical]) {
        orderedCanonical.push(canonical);
        headerMap[canonical] = trimmed;
      }
    }

    if (orderedCanonical.length >= 2) {
      return { headerRowIdx: i, orderedCanonical, headerMap };
    }
  }

  return { headerRowIdx: -1, orderedCanonical: [], headerMap: {} };
}
