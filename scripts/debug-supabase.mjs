#!/usr/bin/env node
/**
 * scripts/debug-supabase.mjs
 *
 * Script de debug para inspeccionar/limpiar el estado de Supabase del
 * sandbox de David (+1 555 201 7643).
 *
 * Sesion 2026-07-02: despues de muchas pruebas del bot, la DB tiene
 * tokens de event_qr_tokens y leads viejos que confunden las pruebas
 * (ej. "Ya registraste tu asistencia" porque el token viejo esta
 * checked-in). Este script lista y limpia.
 *
 * USO:
 *
 *   1) Setear las env vars (runtime only, NO en .env.local):
 *
 *        $env:SUPABASE_PROJECT_REF = "tu-project-ref"
 *        $env:SUPABASE_SECRET_KEY = "sb_secret_..."
 *
 *   2) Listar (NO destructivo):
 *
 *        node scripts/debug-supabase.mjs
 *
 *   3) Limpiar tokens y leads del sandbox (destructivo, requiere --cleanup):
 *
 *        node scripts/debug-supabase.mjs --cleanup
 *
 *   4) Limpiar un phone especifico (en vez del default +15552017643):
 *
 *        node scripts/debug-supabase.mjs --phone +521555555555 --cleanup
 *
 * SEGURIDAD:
 *   - El script NUNCA escribe la key a disco ni a logs.
 *   - El script enmascara la key si la imprime por error.
 *   - El script NO commitea nada.
 *
 * Server-only. No expone datos al cliente.
 */

import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────
// Args
// ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const CLEANUP = args.includes("--cleanup");
const phoneIdx = args.indexOf("--phone");
const PHONE =
  phoneIdx >= 0 && args[phoneIdx + 1]
    ? args[phoneIdx + 1]
    : "+526532935492"; // default: phone real de David (México)

// ──────────────────────────────────────────────────────────────────
// Env vars
// ──────────────────────────────────────────────────────────────────

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

if (!PROJECT_REF) {
  console.error(
    "[debug-supabase] Falta SUPABASE_PROJECT_REF. Setear antes de correr:",
  );
  console.error('  $env:SUPABASE_PROJECT_REF = "tu-project-ref"');
  process.exit(1);
}
if (!SECRET_KEY) {
  console.error(
    "[debug-supabase] Falta SUPABASE_SECRET_KEY. Setear antes de correr:",
  );
  console.error('  $env:SUPABASE_SECRET_KEY = "sb_secret_..."');
  process.exit(1);
}

// Enmascarar la key si la imprimimos por error.
function maskKey(s) {
  if (!s) return "(empty)";
  if (s.length < 12) return "***";
  return s.slice(0, 8) + "***" + s.slice(-4);
}
console.log(`[debug-supabase] projectRef=${PROJECT_REF}`);
console.log(`[debug-supabase] secretKey=${maskKey(SECRET_KEY)}`);

// ──────────────────────────────────────────────────────────────────
// Cliente
// ──────────────────────────────────────────────────────────────────

const url = `https://${PROJECT_REF}.supabase.co`;
const supabase = createClient(url, SECRET_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// ──────────────────────────────────────────────────────────────────
// 1) Listar tokens del sandbox
// ──────────────────────────────────────────────────────────────────

async function listTokens() {
  console.log(`\n[1] Tokens del phone ${PHONE}:`);
  const { data, error } = await supabase
    .from("event_qr_tokens")
    .select(
      "id, event_id, token, attendee_name, attendee_email, attendee_phone_normalized, checked_in_at, expires_at, created_at",
    )
    .eq("attendee_phone_normalized", PHONE)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("  ERROR:", error);
    return [];
  }
  if (data.length === 0) {
    console.log("  (ninguno en este phone)");
  } else {
    for (const t of data) {
      console.log(
        `  - token=${t.token.slice(0, 12)}... event_id=${t.event_id.slice(0, 8)}... ` +
          `phone=${t.attendee_phone_normalized} ` +
          `name=${t.attendee_name ?? "?"} email=${t.attendee_email ?? "?"} ` +
          `checked_in_at=${t.checked_in_at ?? "(null)"} ` +
          `expires=${t.expires_at} created=${t.created_at}`,
      );
    }
  }

  // FIX 2026-07-02: listar TODOS los tokens para detectar phone NULL
  // o phone con formato distinto (problema del token fantasma).
  const { data: allTokens, error: allErr } = await supabase
    .from("event_qr_tokens")
    .select(
      "id, event_id, token, attendee_name, attendee_email, attendee_phone_normalized, checked_in_at, expires_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (allErr) {
    console.error("  ERROR listando todos:", allErr);
  } else {
    console.log(`\n[1b] TODOS los tokens (limit 50): ${allTokens.length}`);
    for (const t of allTokens) {
      console.log(
        `  - token=${t.token.slice(0, 12)}... event_id=${t.event_id.slice(0, 8)}... ` +
          `phone=${t.attendee_phone_normalized ?? "(NULL)"} ` +
          `email=${t.attendee_email ?? "?"} ` +
          `checked_in_at=${t.checked_in_at ?? "(null)"}`,
      );
    }
  }
  return data;
}

// ──────────────────────────────────────────────────────────────────
// 2) Listar eventos publicados
// ──────────────────────────────────────────────────────────────────

async function listEvents() {
  console.log(`\n[2] Eventos publicados (status=published):`);
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, title, status, starts_at, ends_at, location")
    .eq("status", "published")
    .order("starts_at", { ascending: true });
  if (error) {
    console.error("  ERROR:", error);
    return [];
  }
  if (data.length === 0) {
    console.log("  (ninguno)");
    return [];
  }
  for (const e of data) {
    console.log(
      `  - ${e.slug}: "${e.title}" starts=${e.starts_at} location=${e.location ?? "?"}`,
    );
  }
  return data;
}

// ──────────────────────────────────────────────────────────────────
// 3) Listar leads del sandbox
// ──────────────────────────────────────────────────────────────────

async function listLeads() {
  console.log(`\n[3] Leads del phone ${PHONE}:`);
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, email, status, whatsapp_status, created_at")
    .eq("phone_normalized", PHONE)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("  ERROR:", error);
    return [];
  }
  if (data.length === 0) {
    console.log("  (ninguno)");
    return [];
  }
  for (const l of data) {
    console.log(
      `  - ${l.id.slice(0, 8)}... name="${l.name}" email=${l.email} ` +
        `status=${l.status} whatsapp_status=${l.whatsapp_status ?? "?"} ` +
        `created=${l.created_at}`,
    );
  }
  return data;
}

// ──────────────────────────────────────────────────────────────────
// 4) Cleanup (con confirmacion)
// ──────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log(`\n[4] Limpiando datos del phone ${PHONE}...`);

  // Tokens
  const { data: tdata, error: terr } = await supabase
    .from("event_qr_tokens")
    .delete()
    .eq("attendee_phone_normalized", PHONE)
    .select("id");
  if (terr) {
    console.error("  ERROR borrando tokens:", terr);
  } else {
    console.log(`  - Borrados ${tdata?.length ?? 0} tokens`);
  }

  // Leads
  const { data: ldata, error: lerr } = await supabase
    .from("leads")
    .delete()
    .eq("phone_normalized", PHONE)
    .select("id");
  if (lerr) {
    console.error("  ERROR borrando leads:", lerr);
  } else {
    console.log(`  - Borrados ${ldata?.length ?? 0} leads`);
  }
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────

async function main() {
  await listTokens();
  await listEvents();
  await listLeads();
  if (CLEANUP) {
    console.log("\n[cleanup] --cleanup detectado. Borrando datos del sandbox...");
    await cleanup();
    console.log("\n[verificacion post-cleanup]");
    await listTokens();
    await listLeads();
  } else {
    console.log(
      "\n[hint] Para limpiar tokens y leads del sandbox, correr con --cleanup:",
    );
    console.log("  node scripts/debug-supabase.mjs --cleanup");
  }
}

main().catch((err) => {
  console.error("[debug-supabase] FATAL:", err);
  process.exit(1);
});
