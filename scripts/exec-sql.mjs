#!/usr/bin/env node
/**
 * scripts/exec-sql.mjs
 *
 * Ejecuta SQL arbitrario contra la DB de Supabase via pg (node-postgres).
 * Necesita DB_PASSWORD en env. NO usar para operaciones destructivas
 * sin supervision de David.
 *
 * USO:
 *   $env:SUPABASE_DB_PASSWORD = "tu-db-password"
 *   node --env-file=.env.local scripts/exec-sql.mjs archivo.sql
 */

import pg from "pg";
import { readFileSync } from "node:fs";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "";
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD ?? "";

if (!PROJECT_REF || !DB_PASSWORD) {
  console.error("Faltan SUPABASE_PROJECT_REF o SUPABASE_DB_PASSWORD.");
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: node exec-sql.mjs <archivo.sql>");
  process.exit(1);
}

const sql = readFileSync(filePath, "utf8");

// Connection pooler URL (transaction mode, port 6543).
// Funciona para DDL y DML.
const connectionString = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(
  DB_PASSWORD
)}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

const client = new pg.Client({ connectionString });

async function main() {
  console.log(`[exec-sql] Conectando a ${PROJECT_REF}...`);
  await client.connect();
  console.log(`[exec-sql] Conectado. Ejecutando SQL...`);
  console.log("---SQL---");
  console.log(sql);
  console.log("---END---");
  try {
    const result = await client.query(sql);
    console.log(`[exec-sql] OK. Filas afectadas: ${result.rowCount ?? 0}`);
    if (result.rows && result.rows.length > 0) {
      console.log("[exec-sql] Resultado:", JSON.stringify(result.rows, null, 2));
    }
  } catch (err) {
    console.error("[exec-sql] ERROR:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[exec-sql] FATAL:", err);
  process.exit(1);
});