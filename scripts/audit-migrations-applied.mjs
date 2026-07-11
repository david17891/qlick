#!/usr/bin/env node
/**
 * scripts/audit-migrations-applied.mjs
 *
 * Compara las migrations locales (.sql) contra la DB de Supabase y
 * reporta qué objetos (tablas, columnas, índices) están pendientes
 * de aplicar.
 *
 * USO:
 *   node --env-file=.env.local scripts/audit-migrations-applied.mjs
 *
 * Salida: 3 secciones
 *   - TABLAS pendientes (CREATE TABLE en migration, no existe en DB)
 *   - COLUMNAS pendientes (ADD COLUMN en migration, no existe en DB)
 *   - ÍNDICES pendientes (CREATE INDEX en migration, no existe en DB)
 *
 * No verifica ENUMs, FUNCTIONS, TRIGGERS, POLICIES (esos tienen su
 * propio check manual). Solo lo crítico para detectar migrations
 * "fantasma" (commitadas pero no aplicadas a prod).
 *
 * Sesión 2026-07-11: este script existe porque la migration
 * 20260703180000_event_survey_tokens.sql estaba en el repo pero NUNCA
 * se aplicó a prod. El código de Qlick la asumía existente y los
 * tokens de encuesta se "perdía" silenciosamente hasta que el admin
 * UI empezó a fallar con PGRST205.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function parseMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const tables = new Map(); // name -> { file, ts }
  const columns = new Map(); // `${table}.${col}` -> { file, ts, type }
  const indexes = new Map(); // indexName -> { file, ts, table }
  for (const f of files) {
    const ts = f.substring(0, 14);
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    // CREATE TABLE
    const tableRe =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi;
    let m;
    while ((m = tableRe.exec(sql))) {
      if (m[1].toLowerCase() === "if") continue; // false positive
      tables.set(m[1], { file: f, ts });
    }
    // ADD COLUMN
    const colRe =
      /alter\s+table\s+(?:public\.)?(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi;
    while ((m = colRe.exec(sql))) {
      const key = `${m[1]}.${m[2]}`;
      if (!columns.has(key)) columns.set(key, { file: f, ts });
    }
    // CREATE INDEX
    const idxRe =
      /create\s+index\s+(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+(?:public\.)?(\w+)/gi;
    while ((m = idxRe.exec(sql))) {
      if (m[1].toLowerCase() === "if") continue;
      indexes.set(m[1], { file: f, ts, table: m[2] });
    }
  }
  return { tables, columns, indexes };
}

async function fetchAllTables() {
  // information_schema no se expone via PostgREST. Usamos un hack:
  // SELECT 1 FROM information_schema.tables → PGRST error? Sí se
  // puede exponer si la DB lo permite. Probemos directo.
  const r = await supabase.rpc("audit_get_tables").maybeSingle();
  if (r.error && r.error.code === "PGRST202") {
    // Function not found, fallback: OpenAPI spec.
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
    const headers = {
      apikey: process.env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
    };
    const specRes = await fetch(url, { headers });
    const spec = await specRes.json();
    const paths = Object.keys(spec.paths || {});
    const exposed = new Set();
    for (const p of paths) {
      // paths son /table_name
      const match = p.match(/^\/([a-z_][a-z0-9_]*)$/i);
      if (match) exposed.add(match[1]);
    }
    return { ok: true, source: "openapi", tables: Array.from(exposed) };
  }
  if (r.error) {
    return { ok: false, error: r.error.message };
  }
  return { ok: true, source: "rpc", data: r.data };
}

async function fetchAllColumns() {
  // RPC audit_get_columns(table_name text) — si existe, devuelve cols.
  // Si no, fallback: SELECT * FROM <table> LIMIT 0 con introspección de keys.
  // En la práctica, vamos a probar SELECT id, *, o lo que sea para cada tabla.
  // Estrategia: probar SELECT id, name, * y ver qué keys acepta PostgREST.
  // Eso es ruidoso. Mejor: usar OpenAPI spec paths con su definition.
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
  const headers = {
    apikey: process.env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
  };
  const specRes = await fetch(url, { headers });
  const spec = await specRes.json();
  const cols = new Map(); // table -> Set(col)
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    const match = path.match(/^\/([a-z_][a-z0-9_]*)$/i);
    if (!match) continue;
    const tableName = match[1];
    const get = methods.get;
    if (!get) continue;
    const ref = get.parameters?.find(
      (p) => p.name === "select" || p.schema?.$ref
    );
    // OpenAPI definitions están en spec.definitions (PostgREST antiguo)
    // o spec.components.schemas (PostgREST nuevo).
    const defs = spec.definitions || spec.components?.schemas || {};
    const tblDef = defs[tableName];
    if (tblDef?.properties) {
      cols.set(tableName, new Set(Object.keys(tblDef.properties)));
    }
  }
  return cols;
}

async function fetchAllIndexes() {
  // pg_indexes no se expone. Fallback: confiar en que si la tabla
  // existe, el índice también (no siempre cierto). Hacer un check
  // heurístico: para cada índice esperado, ver si la tabla acepta
  // un SELECT con la columna esperada (proxy).
  // Mejor: devolver warning "no verificable" para todos.
  return { ok: false, reason: "no expuesto por PostgREST" };
}

async function main() {
  console.log("[audit] Parseando migrations...");
  const { tables, columns, indexes } = parseMigrations();
  console.log(
    `[audit] Encontrados: ${tables.size} CREATE TABLE, ${columns.size} ADD COLUMN, ${indexes.size} CREATE INDEX`
  );

  console.log("\n[audit] Fetching schema de prod...");
  const t = await fetchAllTables();
  if (!t.ok) {
    console.error("  ERROR:", t.error);
    return;
  }
  console.log(`  source=${t.source}, tables expuesta: ${t.tables.length}`);
  const exposedTables = new Set(t.tables);
  const prodCols = await fetchAllColumns();
  console.log(
    `  cols introspectadas: ${prodCols.size} tablas con definición`
  );

  // TABLAS pendientes.
  console.log("\n=== TABLAS PENDIENTES (CREATE TABLE en migration, no existe en prod) ===");
  let missingTables = 0;
  for (const [name, meta] of tables) {
    if (!exposedTables.has(name)) {
      console.log(`  [FALTA] ${name}  (migration: ${meta.file})`);
      missingTables++;
    }
  }
  if (missingTables === 0) console.log("  (ninguna — todas las CREATE TABLE están aplicadas)");

  // COLUMNAS pendientes.
  console.log("\n=== COLUMNAS PENDIENTES (ADD COLUMN en migration, no existe en prod) ===");
  let missingCols = 0;
  for (const [key, meta] of columns) {
    const [table, col] = key.split(".");
    if (!exposedTables.has(table)) {
      // Tabla no existe → no podemos verificar la columna.
      continue;
    }
    const cols = prodCols.get(table);
    if (!cols) {
      console.log(`  [SKIP]  ${key} (no se pudo introspectar columnas de ${table})`);
      continue;
    }
    if (!cols.has(col)) {
      console.log(`  [FALTA] ${key}  (migration: ${meta.file})`);
      missingCols++;
    }
  }
  if (missingCols === 0) console.log("  (ninguna — todas las ADD COLUMN están aplicadas)");

  // ÍNDICES pendientes: no verificable via PostgREST.
  console.log("\n=== ÍNDICES (no verificable via PostgREST) ===");
  console.log("  Para auditar índices: en SQL Editor, correr");
  console.log("    SELECT schemaname, tablename, indexname FROM pg_indexes");
  console.log("    WHERE schemaname = 'public' ORDER BY tablename, indexname;");
  console.log(`  Total CREATE INDEX en migrations: ${indexes.size}`);

  // Resumen.
  console.log("\n=== RESUMEN ===");
  console.log(`  migrations con CREATE TABLE revisadas: ${tables.size}`);
  console.log(`  tablas faltantes: ${missingTables}`);
  console.log(`  ADD COLUMN revisadas: ${columns.size}`);
  console.log(`  columnas faltantes: ${missingCols}`);
  console.log(`  CREATE INDEX (no auditadas): ${indexes.size}`);

  if (missingTables > 0 || missingCols > 0) {
    console.log("\n[accion] Las migrations que crearon los objetos faltantes NO estan aplicadas a prod.");
    console.log("  Aplicar via SQL Editor o supabase db push, luego NOTIFY pgrst, 'reload schema';");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("[audit] FATAL:", e);
  process.exit(1);
});
