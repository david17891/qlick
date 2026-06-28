#!/usr/bin/env node
/**
 * Helper dev-only: pide credenciales admin temporales a
 * POST /api/dev/admin-session y las imprime por stdout en JSON.
 *
 * USO:
 *   # Variables necesarias en .env.local (o en el shell):
 *   $env:DEV_ADMIN_SECRET="<el secret de .env.local>"
 *   $env:ADMIN_EMAIL_ALLOWLIST="david17891@gmail.com"
 *
 *   node tests/playwright/dev-login.mjs                       # usa el primer email del allowlist
 *   node tests/playwright/dev-login.mjs otro@correo.com       # usa el email explícito
 *
 * OUTPUT (stdout):
 *   {"ok":true,"email":"...","password":"dev-...","userId":"...","note":"..."}
 *
 * EXIT CODES:
 *   0 → OK, credenciales en stdout (parseable como JSON).
 *   1 → Error (mensaje en stderr).
 *
 * POR QUÉ EXISTE:
 *   Ver docs/DEV_LOGIN_BYPASS.md. Este script es el "puente" entre el
 *   endpoint dev y cualquier runner (Playwright MCP, tests Node, bash, etc.).
 *   El endpoint NO está disponible en producción (devuelve 404 si
 *   NODE_ENV=production), así que este script tampoco lo está.
 *
 * PRERREQUISITOS:
 *   - Dev server corriendo en $BASE_URL (default http://localhost:3000).
 *   - .env.local con DEV_ADMIN_SECRET y ADMIN_EMAIL_ALLOWLIST configurados.
 */

// Carga .env.local si existe (no falla si no).
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const ENV_LOCAL = resolve(PROJECT_ROOT, ".env.local");

if (existsSync(ENV_LOCAL)) {
  const raw = readFileSync(ENV_LOCAL, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, valueRaw] = m;
    if (process.env[key] !== undefined) continue; // el shell gana
    let value = valueRaw.trim();
    // Quitar comillas externas si las tiene.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.DEV_ADMIN_SECRET ?? "";
const ALLOWLIST_RAW = process.env.ADMIN_EMAIL_ALLOWLIST ?? "";

if (!SECRET) {
  console.error(
    "ERROR: DEV_ADMIN_SECRET no está configurado en .env.local ni en el shell.\n" +
      "Genera uno con: openssl rand -hex 32\n" +
      "Ver docs/DEV_LOGIN_BYPASS.md para setup completo.",
  );
  process.exit(1);
}

if (!ALLOWLIST_RAW) {
  console.error(
    "ERROR: ADMIN_EMAIL_ALLOWLIST está vacío. Agrega al menos un email admin.",
  );
  process.exit(1);
}

// Si pasan un email por argv, usarlo (validar que esté en el allowlist).
// Si no, usar el primero.
const requestedEmail = (process.argv[2] ?? "").trim().toLowerCase();
const allowlist = ALLOWLIST_RAW.split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const email = requestedEmail || allowlist[0];

if (!email) {
  console.error("ERROR: no se pudo determinar un email admin.");
  process.exit(1);
}

if (!allowlist.includes(email)) {
  console.error(
    `ERROR: "${email}" no está en ADMIN_EMAIL_ALLOWLIST (${allowlist.join(", ")}).`,
  );
  process.exit(1);
}

let res;
try {
  res = await fetch(`${BASE_URL}/api/dev/admin-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, secret: SECRET }),
  });
} catch (err) {
  console.error(
    `ERROR: no se pudo conectar a ${BASE_URL}. ¿Está corriendo el dev server?\n` +
      `Detalle: ${err.message}`,
  );
  process.exit(1);
}

if (!res.ok) {
  let detail;
  try {
    detail = await res.text();
  } catch {
    detail = "(sin body)";
  }
  console.error(
    `ERROR: el endpoint devolvió ${res.status} ${res.statusText}.\n` +
      `Detalle: ${detail}\n` +
      `Ver docs/DEV_LOGIN_BYPASS.md si el error es 404 (probablemente NODE_ENV=production o falta DEV_ADMIN_SECRET).`,
  );
  process.exit(1);
}

const payload = await res.json();

// Imprimir JSON limpio a stdout (parseable por otros scripts).
console.log(JSON.stringify(payload));