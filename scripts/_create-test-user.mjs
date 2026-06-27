/**
 * Crea un user de test en auth.users (auto-confirm) y le genera un
 * magic link de login.
 *
 * Uso:
 *   node scripts/_create-test-user.mjs <email>
 *   node scripts/_create-test-user.mjs                 # usa $ADMIN_TEST_EMAIL
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
  console.error("✗ Falta email. Uso: node scripts/_create-test-user.mjs <email>");
  console.error("   O setea ADMIN_TEST_EMAIL en el entorno.");
  process.exit(1);
}

// 1. Crear el user (auto-confirm para que el magic link no requiera verificación adicional).
const { data: created, error: createErr } = await sb.auth.admin.createUser({
  email,
  email_confirm: true, // No requiere confirmación (es test).
});
if (createErr) {
  console.error("✗ Error creando user:", createErr.message);
  process.exit(1);
}
console.log(`✓ User creado: id=${created.user.id}, email=${created.user.email}`);

// 2. Generar magic link.
const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard?test=1`,
  },
});
if (linkErr) {
  console.error("✗ Error generando magic link:", linkErr.message);
  process.exit(1);
}
console.log(`\n✓ Magic link generado (válido ~1 hora):\n${linkData.properties.action_link}\n`);
console.log("Copia el link de arriba y abrilo en tu browser. Te va a loguear como student.");
console.log("Después vamos a /pagar/<slug> para simular el pago.");
