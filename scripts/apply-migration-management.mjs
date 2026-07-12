#!/usr/bin/env node
/**
 * scripts/apply-migration-management.mjs
 *
 * Ejecuta SQL arbitrario contra la DB de Supabase via Management API.
 * Resuelve el problema de "David tiene que correr SQL a mano" que el
 * scripts/exec-sql.mjs (vía pg + pooler) no podía por:
 *   - Pooler DNS intermitente (ENOTFOUND aws-0-us-west-1.pooler.supabase.com).
 *   - Host directo 5432 con password drift (28P01 auth failed).
 *
 * El Management API usa el SUPABASE_ACCESS_TOKEN (NO el DB password) y
 * funciona consistentemente desde el runtime de Mavis.
 *
 * USO:
 *   node --env-file=.env.local scripts/apply-migration-management.mjs archivo.sql
 *   node --env-file=.env.local scripts/apply-migration-management.mjs archivo.sql --dry-run
 *
 * El flag --dry-run imprime el SQL sin ejecutarlo (útil para preview).
 *
 * LIMITACIONES:
 *   - Endpoint requiere permisos de Management API en el access token.
 *   - El access token está en .env.local (NO committeable, en .gitignore).
 *   - Rate limit: Supabase no documenta límites específicos, pero uso
 *     humano (no automatizado) está bien.
 *
 * REFERENCIAS:
 *   - Documentación: https://supabase.com/docs/reference/api
 *   - Memory del proyecto: qlick-funnel.md §"Drift vault vs Windows env"
 *                          + memory.md "MEMORY: A-2 Regenerar typegen"
 */

import { readFileSync } from "node:fs";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? "";

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error(
    "Faltan SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN en .env.local."
  );
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error(
    "Uso: node apply-migration-management.mjs <archivo.sql> [--dry-run]"
  );
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const sql = readFileSync(filePath, "utf8");

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function main() {
  console.log(`[apply-mgmt] project=${PROJECT_REF} file=${filePath}`);
  console.log(`[apply-mgmt] sqlBytes=${sql.length} dryRun=${dryRun}`);
  if (dryRun) {
    console.log("---SQL---");
    console.log(sql);
    console.log("---END---");
    console.log("[apply-mgmt] DRY RUN: no se ejecutó.");
    return;
  }
  console.log("---SQL---");
  console.log(sql);
  console.log("---END---");
  console.log("[apply-mgmt] Ejecutando via Management API...");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: sql })
  });
  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = body;
  }
  if (!res.ok) {
    console.error(
      `[apply-mgmt] ERROR status=${res.status} body=${JSON.stringify(parsed).slice(0, 1000)}`
    );
    process.exit(1);
  }
  console.log(`[apply-mgmt] OK status=${res.status}`);
  if (Array.isArray(parsed) && parsed.length > 0) {
    console.log("[apply-mgmt] Resultado (primeras 20 filas):");
    console.log(JSON.stringify(parsed.slice(0, 20), null, 2));
    if (parsed.length > 20) {
      console.log(`[apply-mgmt] ... y ${parsed.length - 20} filas más.`);
    }
  } else if (parsed !== null && parsed !== undefined) {
    console.log("[apply-mgmt] Resultado:", JSON.stringify(parsed).slice(0, 500));
  }
}

main().catch((err) => {
  console.error("[apply-mgmt] FATAL:", err.message);
  process.exit(1);
});
