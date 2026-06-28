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
import { normalizePhone } from "../crm/phone-utils.ts";

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
 *
 * Búsqueda en 2 fases:
 * 1. Match exacto contra sinonimos (HEADER_SYNONYMS).
 * 2. Fuzzy match con Levenshtein ≤ 2 para tolerar typos/acentos/1-2 chars de diff.
 *
 * Devuelve null si no matchea ninguno conocido.
 */
export function resolveHeader(rawHeader: string): string | null {
  const normalized = rawHeader.trim().toLowerCase();
  if (!normalized) return null;

  // 1. Exacto
  for (const [canonical, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.includes(normalized)) return canonical;
  }

  // 2. Fuzzy: cada sinonimo contra el header, Levenshtein ≤ 2.
  //    Útil para "nombres" (1 char), "e-mail" (1 char), "celular" vs "cel" (3),
  //    "whatsapp" vs "whatapp" (1 char omitido), etc.
  //    Threshold conservador para no matchear cosas random.
  for (const [canonical, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    for (const syn of synonyms) {
      if (levenshteinLE(syn, normalized, 2)) return canonical;
    }
  }

  return null;
}

/** Levenshtein distance. True si está dentro del threshold. O(n*m) — OK para headers cortos.
 *
 * Threshold adaptativo por longitud: para strings ≤ 3 chars exigimos
 * Levenshtein ≤ 1 (un typo es ~33-50% del string, ya es ambiguo permitir
 * 2 edits). Para strings ≥ 4 chars mantenemos el threshold del caller
 * (default 2 — un typo de 2 chars es ~33% del string, aceptable).
 *
 * Sin esto, fuzzy matchea "foo" con "ok" (synonym de `email_yes`) con
 * Levenshtein 2, false positive (test `resolveHeader: headers
 * desconocidos -> null`). */
function levenshteinLE(a: string, b: string, maxDist: number): boolean {
  const m = a.length;
  const n = b.length;
  const minLen = Math.min(m, n);
  // Para strings cortos (≤ 3 chars), un solo edit es ~33-50% del string,
  // demasiado ambiguo para fuzzy. El caller tiene el loop de exact match
  // primero, así que devolver false acá no rompe nada — solo evita
  // false positives como "a" matcheando "1" o "foo" matcheando "ok".
  if (minLen <= 3) return false;
  if (Math.abs(m - n) > maxDist) return false;

  // Fila anterior y actual de la matriz DP.
  let prev = new Array(n + 1).fill(0).map((_, i) => i);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    // Early exit: si el mínimo de la fila > maxDist, ya no puede mejorar.
    if (rowMin > maxDist) return false;
    [prev, curr] = [curr, prev];
  }
  return prev[n] <= maxDist;
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
  /** Para attendee: si asistió. `null` si la celda tenía algo pero no se pudo parsear. */
  attended?: boolean | null;
  /** Para survey: si dio consentimiento. `null` si no se pudo parsear. */
  consent?: boolean | null;
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

/**
 * Lee una fila cruda del Excel y la mapea a un `NormalizedRow` usando
 * el orden de canonical headers detectado. Aplica validación por
 * tipo de import y emite warnings de data quality.
 *
 * `orderedCanonicalHeaders` puede tener `null` en posiciones donde el
 * header del Excel no matcheó ningún canónico (ej: "#", "Fuente",
 * "Observaciones"). Esos nulls preservan el ORDEN del Excel original.
 */
function buildNormalizedRow(
  rawRow: unknown[],
  orderedCanonicalHeaders: (string | null)[],
  headerMap: Record<string, string>,
  type: EventImportType,
  rowNumber: number,
): { normalized: NormalizedRow; rowWarnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  const out: NormalizedRow = {
    rowNumber,
    name: "",
    email: null,
    phoneRaw: null,
    phoneNormalized: null,
  };

  for (let i = 0; i < orderedCanonicalHeaders.length && i < rawRow.length; i++) {
    const canonical = orderedCanonicalHeaders[i];
    if (canonical == null) continue; // columna no canónica → skip
    const cell = rawRow[i];
    if (isEmptyCell(cell)) continue;

    const value = normalizeCell(cell);

    switch (canonical) {
      case "name":
        if (typeof value === "string") {
          // Transformación determinista: trim + capitalize cada palabra.
          // "  ANA  Pérez-López  " -> "Ana Pérez-López".
          // NO corregimos typos ni juntamos/partimos palabras (eso sería
          // inventar / perder info).
          out.name = capitalizeEachWord(value.trim());
          if (out.name && !out.name.includes(" ") && out.name.length > 3) {
            warnings.push({
              row: rowNumber,
              field: "name",
              note: `nombre de una sola palabra: "${out.name}"`,
            });
          }
        }
        break;
      case "email":
        out.email = typeof value === "string" ? value.trim().toLowerCase() : null;
        if (out.email && !isValidEmailShape(out.email)) {
          warnings.push({
            row: rowNumber,
            field: "email",
            note: `email con forma inválida (${out.email.length} chars)`,
          });
          out.email = null;
        }
        break;
      case "phone": {
        const raw = typeof value === "number" ? String(value) : String(value);
        out.phoneRaw = raw;
        const normalized = normalizePhone(raw);
        out.phoneNormalized = normalized;
        if (!normalized) {
          const digits = raw.replace(/\D/g, "");
          if (digits.length === 10) {
            out.phoneNormalized = `+52${digits}`;
          } else if (digits.length === 9) {
            warnings.push({
              row: rowNumber,
              field: "phone",
              note: `phone con 9 dígitos (esperaba 10): ${digits.length} chars`,
            });
          } else {
            warnings.push({
              row: rowNumber,
              field: "phone",
              note: `phone no normalizable (${digits.length} dígitos)`,
            });
          }
        }
        break;
      }
      case "consent":
        // parseYesNo devuelve boolean | null. Preservamos null para que
        // el caller (CLI / survey promotion) pueda distinguir "no se
        // pudo parsear" de "dije no".
        out.consent = parseYesNo(value);
        break;
      case "interest":
        out.interest = typeof value === "string" ? value.trim() : null;
        break;
      case "source":
        out.sourceRaw = typeof value === "string" ? value.trim() : null;
        break;
      case "attended":
        out.attended = parseYesNo(value);
        break;
      case "status":
        // Metadata del Excel; no la usamos.
        break;
      default:
        break;
    }
  }

  // Validación específica por tipo.
  if (type === "confirmation") {
    if (!out.name) {
      warnings.push({ row: rowNumber, field: "name", note: "falta nombre" });
    }
    if (!out.email && !out.phoneNormalized) {
      warnings.push({
        row: rowNumber,
        field: "_ident",
        note: "sin email ni phone — fila no se puede identificar",
      });
    }
  } else if (type === "attendee") {
    if (!out.name && !out.email && !out.phoneNormalized) {
      warnings.push({
        row: rowNumber,
        field: "_ident",
        note: "sin nombre/email/phone — fila no se puede identificar",
      });
    }
  } else if (type === "survey") {
    if (typeof out.consent !== "boolean") {
      warnings.push({
        row: rowNumber,
        field: "consent",
        note: "consent sin valor parseable",
      });
    }
  }

  return { normalized: out, rowWarnings: warnings };
}

function isEmptyCell(cell: unknown): boolean {
  // Solo null/undefined cuentan como vacío. Strings vacíos los dejamos
  // pasar al handler — `parseYesNo("")` devuelve `false` (correcto para
  // consent/attended), y `name` lo va a tomar como "" (no es problema,
  // generamos warning de "falta nombre" abajo).
  if (cell == null) return true;
  return false;
}

/**
 * Una fila se considera "vacía" (sin data) si todos sus cells son
 * null/undefined o strings vacíos. Se usa para skip filas sin info.
 */
function isEmptyRow(rawRow: unknown[]): boolean {
  return rawRow.every((c) => {
    if (c == null) return true;
    if (typeof c === "string" && c.trim() === "") return true;
    return false;
  });
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
 *
 * ⚠️ Intencionalmente ESTRICTO: solo acepta los valores listados.
 * NO infiere "sí plis" → Sí porque eso sería fabricar consentimiento
 * (constraint legal GDPR/LFPDPPP). Si el Excel tiene variantes no
 * listadas, agregalas al array, no las "limpies" automáticamente.
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
 * Capitaliza cada palabra de un nombre. Determinista y seguro:
 * - "ana PÉREZ" → "Ana Pérez"
 * - "jose lopez" → "Jose Lopez"
 *
 * NO hace (lo dejamos para que el admin lo arregle manualmente):
 * - Detectar nombres compuestos ("María del Carmen" → ?)
 * - Corregir typos ortográficos
 * - Inferir género desde el nombre
 */
export function capitalizeEachWord(s: string): string {
  return s
    .split(/\s+/)
    .map((word) => {
      if (!word) return "";
      // Si la palabra tiene guiones, capitaliza cada parte.
      // "pérez-lópez" → "Pérez-López"
      return word
        .split("-")
        .map((part) => {
          if (!part) return "";
          // Mantenemos caracteres especiales (acentos) tal cual,
          // solo capitalizamos la primera letra respetando Unicode.
          return part.charAt(0).toLocaleUpperCase("es-MX") + part.slice(1);
        })
        .join("-");
    })
    .join(" ")
    .trim();
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
    if (isEmptyRow(rawRow)) continue;

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
 * canonical headers (con `null` donde no matchea) en el ORDEN EXACTO
 * del Excel. Esto preserva la alineación de columnas aunque haya
 * headers no canónicos (ej: "#", "Fuente", "Observaciones").
 */
function detectHeadersOrdered(
  aoa: unknown[][],
  mapOverride?: Record<string, string>,
): {
  headerRowIdx: number;
  orderedCanonical: (string | null)[];
  headerMap: Record<string, string>;
} {
  const MAX_SCAN = 20;

  for (let i = 0; i < Math.min(aoa.length, MAX_SCAN); i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;

    // Construimos orderedCanonical con nulls para preservar orden.
    const orderedCanonical: (string | null)[] = [];
    const headerMap: Record<string, string> = {};

    // Override primero: el usuario pasa {canonical: headerExcel}
    // → tenemos que matchear el headerExcel al row para saber la posición.
    // Si el override no matchea, igual registramos null en la posición
    // donde el headerExcel aparecería en este row (si lo encontramos).
    if (mapOverride) {
      for (const [canonical, excelHeader] of Object.entries(mapOverride)) {
        const pos = row.findIndex(
          (cell) =>
            typeof cell === "string" &&
            cell.trim().toLowerCase() === excelHeader.trim().toLowerCase(),
        );
        if (pos !== -1) {
          // Insertamos en la posición correcta (puede tener nulls antes).
          while (orderedCanonical.length < pos) orderedCanonical.push(null);
          orderedCanonical[pos] = canonical;
          headerMap[canonical] = excelHeader;
        }
        // Si no se encuentra el header del override, lo ignoramos
        // (el usuario va a ver el warning de "headers no reconocidos").
      }
    }

    // Auto-detección en paralelo: cells que no están ya en el override
    // y matchean un canonical conocido.
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = row[colIdx];
      if (typeof cell !== "string") continue;
      const trimmed = cell.trim();
      if (!trimmed) continue;
      const canonical = resolveHeader(trimmed);
      if (!canonical) continue;
      // Si el override ya llenó esta posición, no la sobrescribimos.
      if (orderedCanonical[colIdx] != null) continue;
      // Si el canonical ya está en headerMap (por override), skip.
      if (headerMap[canonical]) continue;
      while (orderedCanonical.length < colIdx) orderedCanonical.push(null);
      orderedCanonical[colIdx] = canonical;
      headerMap[canonical] = trimmed;
    }

    // Necesitamos al menos 1 match para considerar que es la fila de
    // headers. Con threshold=1, Excels con un solo header reconocido
    // (ej: solo "Nombre") también funcionan.
    const matchCount = orderedCanonical.filter((c) => c != null).length;
    if (matchCount >= 1) {
      return { headerRowIdx: i, orderedCanonical, headerMap };
    }
  }

  return { headerRowIdx: -1, orderedCanonical: [], headerMap: {} };
}
