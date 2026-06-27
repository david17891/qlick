/**
 * Borra un user de auth.users.
 *
 * Uso:
 *   node scripts/_delete-user.mjs <email>
 *   node scripts/_delete-user.mjs                 # usa $ADMIN_TEST_EMAIL
 *
 * El script NO tiene emails hardcodeados para evitar PII en el repo.
 * Pasá el email por CLI arg o env var.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  let k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[k] = v;
}

const email = (process.argv[2] ?? process.env.ADMIN_TEST_EMAIL ?? "").trim();
if (!email) {
  console.error("✗ Falta email. Uso: node scripts/_delete-user.mjs <email>");
  console.error("   O setea ADMIN_TEST_EMAIL en el entorno.");
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: list } = await sb.auth.admin.listUsers({ perPage: 200 });
const u = list.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
if (!u) { console.log("User no existe, nada que borrar"); process.exit(0); }
const { error } = await sb.auth.admin.deleteUser(u.id);
if (error) { console.error("Error:", error.message); process.exit(1); }
console.log("✓ User borrado:", u.id);
