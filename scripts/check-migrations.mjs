#!/usr/bin/env node
/**
 * scripts/check-migrations.mjs
 *
 * Verifica si las 2 migrations preexistentes (untracked hasta hoy) ya
 * fueron aplicadas a Supabase. Si no, las aplica via REST API.
 *
 * USO:
 *   node --env-file=.env.local scripts/check-migrations.mjs
 */

import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

if (!PROJECT_REF || !SECRET_KEY) {
  console.error("[check-migrations] Faltan SUPABASE_PROJECT_REF o SUPABASE_SECRET_KEY.");
  process.exit(1);
}

function maskKey(s) {
  if (!s || s.length < 12) return "***";
  return s.slice(0, 8) + "***" + s.slice(-4);
}
console.log(`[check-migrations] projectRef=${PROJECT_REF} secretKey=${maskKey(SECRET_KEY)}`);

const supabase = createClient(
  `https://${PROJECT_REF}.supabase.co`,
  SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function checkMigration1() {
  // MIGRATION 1: leads con name='Por confirmar' → debe haber 0 filas.
  console.log("\n[migration 1] Leads con name='Por confirmar':");
  const { count: porCount, error: porErr } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("name", "Por confirmar");
  if (porErr) {
    console.error("  ERROR:", porErr);
    return false;
  }
  console.log(`  -> ${porCount ?? 0} filas pendientes`);

  // MIGRATION 1b: leads con email placeholder.
  const { count: phCount, error: phErr } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .like("email", "%@placeholder.local");
  if (phErr) {
    console.error("  ERROR:", phErr);
    return false;
  }
  console.log(`  -> ${phCount ?? 0} emails placeholder pendientes`);

  return (porCount ?? 0) === 0 && (phCount ?? 0) === 0;
}

async function checkMigration2() {
  // MIGRATION 2: evento 1 debe tener 'Sin costo' en la descripcion.
  console.log("\n[migration 2] Evento 1 (ia-marketing-primeros-pasos):");
  const { data, error } = await supabase
    .from("events")
    .select("slug, description")
    .eq("slug", "ia-marketing-primeros-pasos")
    .maybeSingle();
  if (error) {
    console.error("  ERROR:", error);
    return false;
  }
  if (!data) {
    console.log("  -> evento no encontrado");
    return false;
  }
  const desc = data.description ?? "";
  const hasGratis = /\bgratis\b/i.test(desc);
  const hasSinCosto = /sin\s*costo/i.test(desc);
  console.log(`  -> description = "${desc.slice(0, 80)}..."`);
  console.log(`  -> contiene "gratis": ${hasGratis}`);
  console.log(`  -> contiene "sin costo": ${hasSinCosto}`);
  return hasSinCosto && !hasGratis;
}

async function applyMigration1() {
  console.log("\n[aplicando migration 1] UPDATE leads...");
  const { data: upd1, error: e1 } = await supabase
    .from("leads")
    .update({ name: null })
    .eq("name", "Por confirmar")
    .select("id");
  if (e1) {
    console.error("  ERROR:", e1);
    return false;
  }
  console.log(`  -> ${upd1?.length ?? 0} leads con name='Por confirmar' actualizados`);

  const { data: upd2, error: e2 } = await supabase
    .from("leads")
    .update({ email: null })
    .or("email.like.%@placeholder.local,email.eq.demo@placeholder.local")
    .select("id");
  if (e2) {
    console.error("  ERROR:", e2);
    return false;
  }
  console.log(`  -> ${upd2?.length ?? 0} leads con email placeholder actualizados`);
  return true;
}

async function applyMigration2() {
  console.log("\n[aplicando migration 2] UPDATE events...");
  const newDescription =
    "Taller introductorio de 2 horas. Costo: Sin costo con registro previo. " +
    "Temas: fundamentos de IA aplicada a marketing, automatizacion basica, " +
    "herramientas no-code. Modalidad: presencial. Cupo limitado a 30 personas. " +
    "Incluye coffee break y materiales digitales.";
  const { data, error } = await supabase
    .from("events")
    .update({ description: newDescription, updated_at: new Date().toISOString() })
    .eq("slug", "ia-marketing-primeros-pasos")
    .select("slug");
  if (error) {
    console.error("  ERROR:", error);
    return false;
  }
  console.log(`  -> ${data?.length ?? 0} evento(s) actualizados`);
  return true;
}

async function main() {
  const m1Ok = await checkMigration1();
  const m2Ok = await checkMigration2();

  if (m1Ok && m2Ok) {
    console.log("\n[OK] Ambas migrations ya aplicadas. Nada que hacer.");
    return;
  }

  console.log("\n[detectado] Hay migrations pendientes.");
  if (!m1Ok) {
    await applyMigration1();
  }
  if (!m2Ok) {
    await applyMigration2();
  }

  console.log("\n[verificacion post-aplicacion]");
  await checkMigration1();
  await checkMigration2();
}

main().catch((err) => {
  console.error("[check-migrations] FATAL:", err);
  process.exit(1);
});