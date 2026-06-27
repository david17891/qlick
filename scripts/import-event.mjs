#!/usr/bin/env node
// scripts/import-event.mjs
//
// Importador CLI de Excels para eventos (Fase 3).
//
// Lee un .xlsx con confirmados/asistentes/encuestas y los inserta en
// Supabase usando los server libs equivalentes (replicados aquí
// porque los aliases @/ no resuelven con --experimental-strip-types).
//
// Uso:
//   node --experimental-strip-types scripts/import-event.mjs \
//     --event <slug> \
//     --type <confirmation|attendee|survey> \
//     --file <path-to-xlsx> \
//     [--dry-run] \
//     [--map '{"telefono":"phone"}'] \
//     [--batch-id <uuid>]
//
// Ejemplo:
//   node --experimental-strip-types scripts/import-event.mjs \
//     --event uabc-km43 --type attendee \
//     --file ./lista-asistencia.xlsx --dry-run
//
// Salida:
//   - Reporte en JSON con inserted/skipped/duplicates/warnings.
//   - Exit code 0 si OK, 1 si falla.
//
// PRIVACIDAD: NUNCA pasar archivos con datos personales al repo. El
// archivo se lee de --file (ruta local) o QLICK_IMPORT_PATH (env var).
// El .gitignore ya excluye los nombres típicos (lista_*.xlsx, etc.).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { parseXlsxForImport, parseYesNo } from "../src/lib/events/importer.ts";
import { normalizePhone } from "../src/lib/crm/phone-utils.ts";

// ─────────────────────────────────────────────────────────────
// Mini parser de .env.local (mismo patrón que _test-fase2.mjs).
// ─────────────────────────────────────────────────────────────
function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...parseEnvFile(join(ROOT, ".env.local")),
  ...process.env,
};
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error(
    "❌ Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en .env.local.\n",
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Parse args.
// ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--event") args.event = argv[++i];
    else if (arg === "--type") args.type = argv[++i];
    else if (arg === "--file") args.file = argv[++i];
    else if (arg === "--map") args.mapOverride = JSON.parse(argv[++i]);
    else if (arg === "--batch-id") args.batchId = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`❌ Argumento desconocido: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Uso: node --experimental-strip-types scripts/import-event.mjs [opciones]

Opciones:
  --event <slug>       Slug del evento (REQUIRED). Ej: uabc-km43
  --type <tipo>        Tipo de import: confirmation | attendee | survey (REQUIRED)
  --file <path>        Ruta al .xlsx. Si no se pasa, usa $QLICK_IMPORT_PATH
  --map <json>         Mapping manual {canonical: headerExcel}. Opcional.
                       Ej: '{"telefono":"phone","acepta":"consent"}'
  --batch-id <uuid>    ID de batch manual (default: uuid v4 nuevo)
  --dry-run            Parsea y reporta pero NO inserta en la DB.
  --help, -h           Muestra esta ayuda.

Ejemplos:
  # Ver qué se importaría (sin tocar la DB):
  node --experimental-strip-types scripts/import-event.mjs \\
    --event uabc-km43 --type attendee --file ./lista.xlsx --dry-run

  # Importar con mapping custom (si el Excel tiene headers raros):
  node --experimental-strip-types scripts/import-event.mjs \\
    --event uabc-km43 --type survey --file ./encuesta.xlsx \\
    --map '{"acepta contacto":"consent","tema":"interest"}'
`);
}

const args = parseArgs(process.argv);
if (!args.event || !args.type || !args.file) {
  console.error("❌ Faltan argumentos requeridos (--event, --type, --file).");
  printHelp();
  process.exit(1);
}
if (!["confirmation", "attendee", "survey"].includes(args.type)) {
  console.error(`❌ --type debe ser confirmation | attendee | survey. Recibido: ${args.type}`);
  process.exit(1);
}

const filePath = resolve(args.file);
if (!existsSync(filePath)) {
  console.error(`❌ Archivo no encontrado: ${filePath}`);
  process.exit(1);
}
const batchId = args.batchId || randomUUID();

// ─────────────────────────────────────────────────────────────
// Cliente Supabase + resolver event.
// ─────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: event, error: evErr } = await supabase
  .from("events")
  .select("id, slug, title")
  .eq("slug", args.event)
  .maybeSingle();

if (evErr || !event) {
  console.error(`❌ Evento "${args.event}" no existe en la DB. Créalo primero.`);
  process.exit(1);
}
const eventId = event.id;
console.log(`✓ Evento encontrado: "${event.title}" (${eventId})`);
console.log(`  Tipo de import: ${args.type}`);
console.log(`  Archivo: ${filePath}`);
console.log(`  Batch ID: ${batchId}`);
console.log(`  Dry run: ${args.dryRun ? "SÍ (no se va a tocar la DB)" : "NO (insert real)"}`);
console.log("");

// ─────────────────────────────────────────────────────────────
// Parsear Excel.
// ─────────────────────────────────────────────────────────────
const buffer = readFileSync(filePath);
const parsed = parseXlsxForImport(buffer, args.type, {
  mapOverride: args.mapOverride,
});

console.log(`📋 Headers detectados: ${Object.keys(parsed.headers).join(", ") || "(ninguno)"}`);
console.log(`📋 Filas parseadas: ${parsed.rows.length}`);
console.log(`⚠️  Warnings de data quality: ${parsed.warnings.length}`);
for (const w of parsed.warnings.slice(0, 10)) {
  console.log(`     row ${w.row} | ${w.field} | ${w.note}`);
}
if (parsed.warnings.length > 10) {
  console.log(`     ... y ${parsed.warnings.length - 10} más`);
}
console.log("");

if (args.dryRun) {
  console.log("🔍 DRY RUN — no se insertó nada en la DB.");
  console.log("");
  console.log("Resumen:");
  console.log(`  Filas listas para insertar: ${parsed.rows.length}`);
  console.log(`  Warnings: ${parsed.warnings.length}`);
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────
// Insertar en batch. Replica la lógica de los server libs
// (confirmation/attendee/survey) pero sin los aliases @/.
// ─────────────────────────────────────────────────────────────
const summary = {
  totalRows: parsed.rows.length,
  inserted: 0,
  skippedDuplicates: 0,
  skippedInvalid: 0,
  errors: [],
};

for (const row of parsed.rows) {
  try {
    if (args.type === "confirmation") {
      if (!row.name?.trim()) {
        summary.skippedInvalid += 1;
        continue;
      }
      const upsertResult = await supabase
        .from("event_confirmations")
        .upsert(
          {
            event_id: eventId,
            name: row.name.trim(),
            email: row.email,
            phone_raw: row.phoneRaw,
            phone_normalized: row.phoneNormalized,
            source: "imported_excel",
            import_batch_id: batchId,
          },
          { onConflict: "event_id,email", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (upsertResult.error && upsertResult.error.code !== "23505") {
        // Si es unique violation por phone, lo manejamos aparte.
        if (upsertResult.error.code === "23505") {
          summary.skippedDuplicates += 1;
        } else {
          summary.errors.push({ row: row.rowNumber, error: upsertResult.error.message });
        }
      } else if (!upsertResult.data) {
        // ignoreDuplicates=true → ya existía.
        summary.skippedDuplicates += 1;
      } else {
        summary.inserted += 1;
      }
    } else if (args.type === "attendee") {
      if (!row.email && !row.phoneNormalized && !row.name) {
        summary.skippedInvalid += 1;
        continue;
      }
      // Si attended es false → skip (no es asistente real).
      if (row.attended === false) {
        summary.skippedInvalid += 1;
        continue;
      }
      const upsertResult = await supabase
        .from("event_attendees")
        .upsert(
          {
            event_id: eventId,
            name: row.name?.trim() || null,
            email: row.email,
            phone_normalized: row.phoneNormalized,
            source: "imported_excel",
            import_batch_id: batchId,
          },
          { onConflict: "event_id,email", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (upsertResult.error && upsertResult.error.code !== "23505") {
        if (upsertResult.error.code === "23505") {
          summary.skippedDuplicates += 1;
        } else {
          summary.errors.push({ row: row.rowNumber, error: upsertResult.error.message });
        }
      } else if (!upsertResult.data) {
        summary.skippedDuplicates += 1;
      } else {
        summary.inserted += 1;
      }
    } else if (args.type === "survey") {
      if (typeof row.consent !== "boolean") {
        summary.skippedInvalid += 1;
        continue;
      }
      const { data, error } = await supabase
        .from("event_surveys")
        .insert({
          event_id: eventId,
          respondent_email: row.email,
          respondent_phone: row.phoneRaw,
          phone_normalized: row.phoneNormalized,
          responses: {}, // el Excel no tiene jsonb de respuestas por ahora
          consent_to_contact: row.consent,
          commercial_interest: row.interest,
          import_batch_id: batchId,
        })
        .select("id")
        .single();
      if (error) {
        summary.errors.push({ row: row.rowNumber, error: error.message });
      } else {
        summary.inserted += 1;
      }
    }
  } catch (e) {
    summary.errors.push({ row: row.rowNumber, error: e?.message ?? String(e) });
  }
}

// ─────────────────────────────────────────────────────────────
// Reporte final.
// ─────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════");
console.log("Resumen del import:");
console.log(`  Batch ID:       ${batchId}`);
console.log(`  Evento:         ${args.event}`);
console.log(`  Tipo:           ${args.type}`);
console.log(`  Total filas:    ${summary.totalRows}`);
console.log(`  Insertadas:     ${summary.inserted}`);
console.log(`  Duplicadas:     ${summary.skippedDuplicates}`);
console.log(`  Inválidas:      ${summary.skippedInvalid}`);
console.log(`  Errores:        ${summary.errors.length}`);
if (summary.errors.length > 0) {
  console.log("");
  console.log("Errores (primeros 5):");
  for (const e of summary.errors.slice(0, 5)) {
    console.log(`  row ${e.row}: ${e.error}`);
  }
}
console.log("═══════════════════════════════════════════════════");

process.exit(summary.errors.length > 0 ? 1 : 0);
