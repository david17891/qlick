#!/usr/bin/env node
/**
 * scripts/apply-migration.mjs
 *
 * Aplica una migration SQL a Supabase via REST API.
 * Solo para DDL simples (ALTER TABLE, CREATE INDEX, etc).
 *
 * USO:
 *   node --env-file=.env.local scripts/apply-migration.mjs <file.sql>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

if (!PROJECT_REF || !SECRET_KEY) {
  console.error("Faltan SUPABASE_PROJECT_REF o SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: node apply-migration.mjs <file.sql>");
  process.exit(1);
}

const sql = readFileSync(filePath, "utf8");

// Supabase REST API no ejecuta SQL arbitrario. Para DDL hay 2 opciones:
// 1. Supabase Management API (requiere access token, no service role)
// 2. Conexion directa via psql o pg client
//
// El service_role key no permite DDL via REST. PERO podemos ejecutar
// queries via el endpoint /rest/v1/rpc/<function_name> SOLO si la funcion
// ya existe en DB (creada via SQL editor o dashboard).
//
// Para esta migration (ALTER TABLE simple), lo mas limpio es:
// 1. Imprimir el SQL para que David lo pegue en SQL editor, o
// 2. Usar el endpoint /pg/query (no existe en REST standard).
//
// Por simplicidad, este script SOLO verifica el estado actual de la tabla
// para confirmar si la migration ya fue aplicada. Si no, imprime el SQL
// para aplicacion manual.

function maskKey(s) {
  if (!s || s.length < 12) return "***";
  return s.slice(0, 8) + "***" + s.slice(-4);
}
console.log(`[apply-migration] projectRef=${PROJECT_REF} secretKey=${maskKey(SECRET_KEY)}`);
console.log(`[apply-migration] file=${filePath}`);

const supabase = createClient(
  `https://${PROJECT_REF}.supabase.co`,
  SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function checkMigration() {
  // Para esta migration, verificamos si la columna `requires_name` existe
  // en `events`. Si existe, ya está aplicada. Si no, hay que aplicar.
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, title, requires_name")
    .limit(1);

  if (error) {
    if (error.code === "42703") { // undefined_column
      console.log("\n[estado] Columna `requires_name` NO existe en `events`.");
      console.log("[estado] La migration NO está aplicada.");
      return false;
    }
    console.error("[estado] ERROR consultando events:", error);
    return null;
  }

  console.log("\n[estado] Columna `requires_name` SÍ existe en `events`.");
  if (data && data.length > 0) {
    console.log("[estado] Ejemplo de evento:", data[0]);
  }
  return true;
}

async function main() {
  const applied = await checkMigration();

  if (applied === true) {
    console.log("\n[OK] Migration ya aplicada. Nada que hacer.");
    return;
  }

  if (applied === false) {
    console.log("\n[ACCION REQUERIDA] La migration NO está aplicada.");
    console.log("\nSQL a aplicar (manual desde SQL editor o supabase db push):");
    console.log("---");
    console.log(sql);
    console.log("---");
    console.log("\n[alternativa] Si tenes supabase CLI instalado:");
    console.log(`  supabase db push --db-url "postgresql://postgres:[password]@db.${PROJECT_REF}.supabase.co:5432/postgres"`);
  }
}

main().catch((err) => {
  console.error("[apply-migration] FATAL:", err);
  process.exit(1);
});