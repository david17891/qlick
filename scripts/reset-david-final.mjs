// RESET FINAL del lead de David para prueba de pago real (test mode).
// Resuelve los issues del primer reset:
//   - event_access.user_id / lead_id (typegen stale) → usa as any
//   - lead_status / whatsapp_status enum → 'new' / 'no_contactado'
//   - wizard state → metadata del último outbound (no tabla separada)
//
// Limpia:
//   1. event_access.user_id = David (con as any, typegen stale)
//   2. leads.name/email/status/whatsapp_status a defaults
//   3. metadata del último outbound (awaiting_*, pending_*, confirmation_id)
//
// Uso:
//   node --env-file=.env.local scripts/reset-david-final.mjs
//
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf-8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
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

const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };
const PHONE = process.argv[2] || "+526532935492";
const LEAD_ID = "92739b21-05cf-4421-842b-6b50ea71f2d9"; // David

console.log(`[RESET-FINAL] phone=${PHONE} lead_id=${LEAD_ID}`);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let issues = 0;

// 1. Borrar event_access del lead de David (bypasseando typegen con as any)
console.log("\n=== 1. event_access (typegen stale) ===");
try {
  // Primero leemos para confirmar que hay rows
  const { data: before, error: readErr } = await sb
    .from("event_access")
    .select("id, user_id, confirmation_id, event_id, access_status")
    .eq("user_id", LEAD_ID);
  if (readErr) {
    console.log(`  ✗ SELECT error: ${readErr.message}`);
    issues++;
  } else {
    console.log(`  event_access con user_id=David: ${before?.length ?? 0} rows`);
    if (before && before.length > 0) {
      for (const r of before) {
        console.log(`    - id=${r.id.slice(0, 8)}... event_id=${r.event_id.slice(0, 8)}... conf=${r.confirmation_id?.slice(0, 8) ?? "null"} status=${r.access_status}`);
      }
      // Borrar via as any (typegen puede no tener lead_id u otras cols)
      const { data: del, error: delErr } = await sb
        .from("event_access")
        .delete()
        .eq("user_id", LEAD_ID)
        .select("id");
      if (delErr) {
        console.log(`  ✗ DELETE error: ${delErr.message}`);
        issues++;
      } else {
        console.log(`  ✓ Borrados: ${del?.length ?? 0}`);
      }
    }
  }
} catch (e) {
  console.log(`  ✗ Excepción: ${e.message}`);
  issues++;
}

// 2. Actualizar lead con valores válidos del enum
console.log("\n=== 2. lead status / whatsapp_status ===");
try {
  const { data, error } = await sb
    .from("leads")
    .update({
      name: null,
      email: null,
      status: "new",
      whatsapp_status: "no_contactado",
    })
    .eq("id", LEAD_ID)
    .select("id, name, email, status, whatsapp_status");
  if (error) {
    console.log(`  ✗ UPDATE error: ${error.message}`);
    issues++;
  } else {
    console.log(`  ✓ Estado actual:`, data?.[0]);
  }
} catch (e) {
  console.log(`  ✗ Excepción: ${e.message}`);
  issues++;
}

// 3. Limpiar metadata del último outbound del lead
console.log("\n=== 3. wizard state (metadata del último outbound) ===");
try {
  const { data: outbounds, error: outErr } = await sb
    .from("lead_whatsapp_conversations")
    .select("id, metadata, direction, created_at")
    .eq("lead_id", LEAD_ID)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1);
  if (outErr) {
    console.log(`  ✗ SELECT error: ${outErr.message}`);
    issues++;
  } else if (!outbounds || outbounds.length === 0) {
    console.log(`  ✓ No hay outbounds previos. Nada que limpiar.`);
  } else {
    const last = outbounds[0];
    console.log(`  último outbound id=${last.id.slice(0, 8)}... created_at=${last.created_at}`);
    console.log(`  metadata actual keys: ${Object.keys(last.metadata ?? {}).join(", ") || "(vacío)"}`);
    
    const meta = last.metadata ?? {};
    const hasWizardFields = 
      meta.awaiting_survey_step != null ||
      meta.awaiting_field != null ||
      meta.awaiting_event_slug != null ||
      meta.awaiting_event_price != null ||
      meta.awaiting_confirmation_for_event_slug != null ||
      meta.pending_event_slug != null ||
      meta.pending_event_price != null ||
      meta.confirmation_id != null ||
      meta.checkout_url != null;
    
    if (!hasWizardFields) {
      console.log(`  ✓ metadata sin wizard fields. No necesita reset.`);
    } else {
      // Limpiar campos del wizard
      const cleanMeta = { ...meta };
      delete cleanMeta.awaiting_survey_step;
      delete cleanMeta.awaiting_field;
      delete cleanMeta.awaiting_event_slug;
      delete cleanMeta.awaiting_event_price;
      delete cleanMeta.awaiting_confirmation_for_event_slug;
      delete cleanMeta.pending_event_slug;
      delete cleanMeta.pending_event_price;
      delete cleanMeta.confirmation_id;
      delete cleanMeta.checkout_url;
      
      const { error: updErr } = await sb
        .from("lead_whatsapp_conversations")
        .update({ metadata: cleanMeta })
        .eq("id", last.id);
      if (updErr) {
        console.log(`  ✗ UPDATE metadata error: ${updErr.message}`);
        issues++;
      } else {
        console.log(`  ✓ Metadata limpiada. Keys restantes: ${Object.keys(cleanMeta).join(", ") || "(vacío)"}`);
      }
    }
  }
} catch (e) {
  console.log(`  ✗ Excepción: ${e.message}`);
  issues++;
}

// 4. lead_profile
console.log("\n=== 4. lead_profile ===");
try {
  const { error } = await sb
    .from("lead_profile")
    .delete()
    .eq("lead_id", LEAD_ID);
  if (error) {
    console.log(`  ✗ DELETE error: ${error.message}`);
    issues++;
  } else {
    console.log(`  ✓ lead_profile borrado`);
  }
} catch (e) {
  console.log(`  ✗ Excepción: ${e.message}`);
  issues++;
}

// 5. Verificación final
console.log("\n=== 5. Verificación final ===");
const { data: finalLead } = await sb
  .from("leads")
  .select("id, name, email, status, whatsapp_status")
  .eq("id", LEAD_ID)
  .single();
console.log("  lead:", finalLead);

const { data: finalAccess } = await sb
  .from("event_access")
  .select("id, user_id, confirmation_id, access_status")
  .eq("user_id", LEAD_ID);
console.log(`  event_access count: ${finalAccess?.length ?? 0}`);

const { data: finalConf } = await sb
  .from("event_confirmations")
  .select("id, event_id, payment_status")
  .eq("phone_normalized", PHONE);
console.log(`  event_confirmations count: ${finalConf?.length ?? 0}`);

const { data: finalQr } = await sb
  .from("event_qr_tokens")
  .select("id, attendee_phone_normalized, event_id")
  .eq("attendee_phone_normalized", PHONE);
console.log(`  event_qr_tokens count: ${finalQr?.length ?? 0}`);

console.log(`\n[RESET-FINAL] issues encontrados: ${issues}`);
console.log(`[RESET-FINAL] Estado limpio: ${issues === 0 ? "SÍ ✓" : "NO ✗"}`);
process.exit(issues === 0 ? 0 : 1);
