#!/usr/bin/env node
/**
 * Validador de variables de entorno de Supabase.
 *
 * Uso:
 *   npm run check:supabase
 *
 * Qué hace:
 *   - Lee .env.local si existe (y .env como fallback), como Next.js hace en dev.
 *   - Reporta presencia/ausencia de cada variable requerida.
 *   - NUNCA imprime valores de claves (solo presencia y longitud enmascarada).
 *   - Exit code:
 *       0  si todo OK, o si faltan variables (modo demo es válido).
 *       1  solo si hay un formato claramente inválido (ej. URL no supabase.co,
 *          clave que no es JWT). Es decir, "mal configurado", no "no configurado".
 *
 * Reglas (docs/SUPABASE_CONNECTION_BOOTSTRAP.md):
 *   - El modo demo (sin variables) es perfectamente válido → exit 0.
 *   - Una URL mal formada o una clave truncada sí es un error real → exit 1.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Variables a validar (alias modernos + legacy).
const VARS = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", kind: "url", legacy: [] },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", kind: "key", legacy: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"] },
  { name: "SUPABASE_SECRET_KEY", kind: "key", legacy: ["SUPABASE_SERVICE_ROLE_KEY"] },
  { name: "SUPABASE_PROJECT_REF", kind: "ref", legacy: [] },
  { name: "NEXT_PUBLIC_APP_URL", kind: "appurl", legacy: [] },
];

/**
 * Parser mínimo de .env: soporta KEY=value, comillas y # comentarios.
 * No soporta valores multilínea ni expansión de variables (no los usamos).
 */
function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Quitar comentarios al final (solo si el valor no está entre comillas).
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    // Quitar comillas envolventes.
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

async function loadEnv() {
  const merged = {};
  // Orden: .env < .env.local (local pisa al base). Imita el orden de Next.
  for (const file of [".env", ".env.local"]) {
    const p = join(ROOT, file);
    if (existsSync(p)) {
      try {
        const text = await readFile(p, "utf8");
        Object.assign(merged, parseEnv(text));
      } catch {
        /* ignore */
      }
    }
  }
  return merged;
}

function isValidSupabaseUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function looksLikeJwt(value) {
  if (!value) return false;
  const parts = value.split(".");
  return parts.length >= 3 && parts.every((p) => p.length > 0);
}

function looksLikeProjectRef(value) {
  // UUID v4-ish. No validamos estrictamente, solo forma.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Enmascara un valor para mostrar longitud sin revelar contenido. */
function maskLen(value) {
  if (!value) return "—";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 3)}…${value.slice(-2)} (${value.length} car.)`;
}

async function main() {
  const env = await loadEnv();
  const hasLocal = existsSync(join(ROOT, ".env.local"));
  const hasEnv = existsSync(join(ROOT, ".env"));

  console.log("\n🔍 Validador de env de Supabase\n");
  console.log(`  .env       ${hasEnv ? "presente" : "ausente"}`);
  console.log(`  .env.local ${hasLocal ? "presente" : "ausente"}\n`);

  const errors = [];
  const rows = [];

  for (const v of VARS) {
    let value = env[v.name] ?? "";
    let source = v.name;
    if (!value) {
      // Probar alias legacy.
      for (const alias of v.legacy) {
        if (env[alias]) {
          value = env[alias];
          source = `${v.name} (vía legacy ${alias})`;
          break;
        }
      }
    }

    const present = Boolean(value);
    let valid = null; // null = no aplica / ausente
    let status = "ausente";

    if (present) {
      switch (v.kind) {
        case "url":
          valid = isValidSupabaseUrl(value);
          status = valid ? "OK (url válida)" : "INVÁLIDA";
          if (!valid) errors.push(`${v.name}: URL con formato inválido (debe ser https://*.supabase.co).`);
          break;
        case "appurl":
          try {
            // Cualquier URL absoluta válida.
            new URL(value);
            valid = true;
            status = "OK";
          } catch {
            valid = false;
            status = "INVÁLIDA";
            errors.push(`${v.name}: no es una URL válida.`);
          }
          break;
        case "key":
          valid = looksLikeJwt(value);
          status = valid ? "OK (JWT)" : "¿truncada?";
          if (!valid) errors.push(`${v.name}: no parece un JWT (3 segmentos separados por punto).`);
          break;
        case "ref":
          valid = looksLikeProjectRef(value);
          status = valid ? "OK (UUID)" : "¿formato raro?";
          // ref con formato raro no es error fatal (puede ser ref nuevo).
          break;
        default:
          valid = true;
          status = "OK";
      }
    }

    // Para claves y secretos NO imprimimos el valor, solo longitud enmascarada.
    const display = v.kind === "key" ? maskLen(value) : value ? "presente" : "—";

    rows.push({
      name: v.name,
      source,
      present,
      valid,
      status,
      display,
    });
  }

  // Tabla simple.
  const nameW = Math.max(...rows.map((r) => r.name.length));
  console.log(
    `  ${"Variable".padEnd(nameW)}  Estado           Detalle`,
  );
  console.log(`  ${"-".repeat(nameW)}  ${"---------------"}  ${"----------"}`);
  for (const r of rows) {
    const flag = !r.present ? "·" : r.valid === false ? "✗" : "✓";
    console.log(
      `  ${r.name.padEnd(nameW)}  ${flag} ${r.status.padEnd(13)}  ${r.display}`,
    );
  }

  // Diagnóstico global.
  const url = env[VARS[0].name] ?? "";
  const pub = env[VARS[1].name] ?? env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "";
  const configured = isValidSupabaseUrl(url) && Boolean(pub);

  console.log("");
  if (configured) {
    console.log("✅ Supabase configurado (modo 'configured').");
    console.log("   Recuerda: falta RLS + aviso de privacidad antes de datos reales.");
  } else {
    console.log("ℹ️  Supabase NO configurado (modo 'demo').");
    console.log("   Esto es perfectamente válido: la app corre con mocks.");
    console.log("   Cuando tengas un proyecto, completa .env.local y vuelve a correr este script.");
  }

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} error(es) de formato:`);
    for (const e of errors) console.log(`   - ${e}`);
    process.exitCode = 1;
  } else {
    console.log("\n✅ Sin errores de formato.\n");
  }
}

main();
