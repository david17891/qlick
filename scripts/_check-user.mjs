/**
 * Verifica el estado de un user en Supabase Auth:
 * - Está en ADMIN_EMAIL_ALLOWLIST?
 * - Existe en auth.users?
 * - Qué providers tiene (Google, email, etc.)?
 *
 * Uso:
 *   node scripts/_check-user.mjs <email>
 *   node scripts/_check-user.mjs                 # usa $ADMIN_TEST_EMAIL
 *
 * El script NO tiene emails hardcodeados para evitar PII en el repo.
 * Pasá el email por CLI arg o env var.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  let k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[k] = v;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = (process.argv[2] ?? process.env.ADMIN_TEST_EMAIL ?? "").trim();
if (!email) {
  console.error("✗ Falta email. Uso: node scripts/_check-user.mjs <email>");
  console.error("   O setea ADMIN_TEST_EMAIL en el entorno.");
  process.exit(1);
}

// 1. Verificar ADMIN_EMAIL_ALLOWLIST (ya lo vimos en .env.local, pero confirmo)
const allowlist = (env.ADMIN_EMAIL_ALLOWLIST || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
console.log(`[1] ADMIN_EMAIL_ALLOWLIST: ${JSON.stringify(allowlist)}`);
console.log(`[1] '${email}' en allowlist?`, allowlist.includes(email.toLowerCase()));

// 2. Buscar user en auth.users
const { data: userList, error: listErr } = await sb.auth.admin.listUsers({ perPage: 200 });
if (listErr) {
  console.error("[2] Error listando users:", listErr.message);
  process.exit(1);
}
const user = userList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.log(`[2] '${email}' NO existe en auth.users. Habría que crearlo.`);
  process.exit(0);
}
console.log(`[2] User existe: id=${user.id}, created_at=${user.created_at}, last_sign_in=${user.last_sign_in_at}`);
console.log(`[2] Email confirmado?`, user.email_confirmed_at ? "SÍ" : "NO");
console.log(`[2] Providers:`);
for (const p of user.app_metadata?.providers ?? []) {
  console.log(`     - ${p}`);
}
if (user.identities) {
  console.log(`[2] Identities:`);
  for (const idn of user.identities) {
    console.log(`     - provider=${idn.provider} identity_id=${idn.identity_id?.slice(0, 12)}...`);
  }
}
