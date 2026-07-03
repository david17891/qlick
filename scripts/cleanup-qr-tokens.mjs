#!/usr/bin/env node
/**
 * scripts/cleanup-qr-tokens.mjs
 *
 * Ejecuta el job de limpieza de tokens QR viejos manualmente (sin esperar
 * al cron de Vercel). Útil cuando David quiere forzar la limpieza después
 * de probar el flow muchas veces.
 *
 * USO:
 *
 *   1) Setear las env vars (runtime only, NO en .env.local):
 *
 *        $env:SUPABASE_PROJECT_REF = "tu-project-ref"
 *        $env:SUPABASE_SECRET_KEY = "sb_secret_..."
 *
 *   2) Correr con grace period default (30 dias):
 *
 *        node --env-file=.env.local scripts/cleanup-qr-tokens.mjs
 *
 *   3) Custom grace period (e.g. 7 dias):
 *
 *        node --env-file=.env.local scripts/cleanup-qr-tokens.mjs --grace-days 7
 *
 *   4) Dry-run (NO borra, solo cuenta):
 *
 *        node --env-file=.env.local scripts/cleanup-qr-tokens.mjs --dry-run
 *
 * SEGURIDAD:
 *   - El script NUNCA escribe la key a disco ni a logs.
 *   - El script enmascara la key si la imprime por error.
 */

import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────
// Args
// ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const graceIdx = args.indexOf("--grace-days");
const GRACE_DAYS =
  graceIdx >= 0 && args[graceIdx + 1] ? parseInt(args[graceIdx + 1], 10) : 30;

// ──────────────────────────────────────────────────────────────────
// Env vars
// ──────────────────────────────────────────────────────────────────

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

if (!PROJECT_REF) {
  console.error("[cleanup-qr-tokens] Falta SUPABASE_PROJECT_REF.");
  process.exit(1);
}
if (!SECRET_KEY) {
  console.error("[cleanup-qr-tokens] Falta SUPABASE_SECRET_KEY.");
  process.exit(1);
}

function maskKey(s) {
  if (!s) return "(empty)";
  if (s.length < 12) return "***";
  return s.slice(0, 8) + "***" + s.slice(-4);
}
console.log(`[cleanup-qr-tokens] projectRef=${PROJECT_REF}`);
console.log(`[cleanup-qr-tokens] secretKey=${maskKey(SECRET_KEY)}`);
console.log(`[cleanup-qr-tokens] graceDays=${GRACE_DAYS} dryRun=${DRY_RUN}`);

// ──────────────────────────────────────────────────────────────────
// Cliente
// ──────────────────────────────────────────────────────────────────

const url = `https://${PROJECT_REF}.supabase.co`;
const supabase = createClient(url, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
console.log(`[cleanup-qr-tokens] cutoff (iso)=${cutoff}`);

async function main() {
  // Primero, contar cuántos tokens viejos hay.
  const { count, error: countErr } = await supabase
    .from("event_qr_tokens")
    .select("id", { count: "exact", head: true })
    .lt("expires_at", cutoff)
    .is("checked_in_at", null);

  if (countErr) {
    console.error("[cleanup-qr-tokens] ERROR contando:", countErr);
    process.exit(1);
  }

  console.log(`[cleanup-qr-tokens] Candidatos a borrar: ${count ?? 0}`);

  if (DRY_RUN) {
    console.log("[cleanup-qr-tokens] --dry-run detectado. No se borró nada.");
    return;
  }

  if ((count ?? 0) === 0) {
    console.log("[cleanup-qr-tokens] Nada que borrar.");
    return;
  }

  // Confirmar antes de borrar (defensive UX).
  console.log("[cleanup-qr-tokens] Borrando... (esto puede tardar unos segundos)");

  const { data, error: delErr } = await supabase
    .from("event_qr_tokens")
    .delete()
    .lt("expires_at", cutoff)
    .is("checked_in_at", null)
    .select("id");

  if (delErr) {
    console.error("[cleanup-qr-tokens] ERROR borrando:", delErr);
    process.exit(1);
  }

  console.log(`[cleanup-qr-tokens] OK: borrados ${data?.length ?? 0} tokens.`);
}

main().catch((err) => {
  console.error("[cleanup-qr-tokens] FATAL:", err);
  process.exit(1);
});