#!/usr/bin/env node
/**
 * scripts/get-latest-token.mjs
 *
 * Devuelve el token completo (no truncado) del último check-in para
 * un phone. Solo para debugging/testing.
 *
 * USO:
 *   node --env-file=.env.local scripts/get-latest-token.mjs
 */

import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

if (!PROJECT_REF || !SECRET_KEY) {
  console.error("Faltan env vars.");
  process.exit(1);
}

const supabase = createClient(
  `https://${PROJECT_REF}.supabase.co`,
  SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function main() {
  const { data, error } = await supabase
    .from("event_qr_tokens")
    .select("token, attendee_email, checked_in_at, expires_at, attendee_name, attendee_phone_normalized")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.log("(no tokens)");
    return;
  }
  const t = data[0];
  console.log(JSON.stringify({
    token: t.token,
    email: t.attendee_email,
    name: t.attendee_name,
    phone: t.attendee_phone_normalized,
    checked_in_at: t.checked_in_at,
    expires_at: t.expires_at
  }, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});