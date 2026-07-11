import { createClient } from "@supabase/supabase-js";

const ref = process.env.SUPABASE_PROJECT_REF ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";

const sb = createClient(`https://${ref}.supabase.co`, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Check ANY recent activity in payments OR in Stripe-related tables
console.log("\n🔍 Recent payment activity in DB (last 30 min):\n");

const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

const { data: recentPayments, error } = await sb
  .from("payments")
  .select("id, user_id, provider, status, amount_mxn, external_reference, created_at")
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(10);

if (error) {
  console.error("Query error:", error.message);
  process.exit(1);
}

if (!recentPayments || recentPayments.length === 0) {
  console.log("❌ NO hay pagos creados en los últimos 30 minutos.");
  console.log("   Implicación: el cargo NUNCA se procesó. La pantalla blanca es de Stripe procesando/colgado.");
} else {
  console.log(`✅ ${recentPayments.length} pagos en los últimos 30 min:\n`);
  for (const p of recentPayments) {
    console.log(`  - ${p.created_at} provider=${p.provider} status=${p.status} amount=${p.amount_mxn} extref=${p.external_reference ?? "(null)"}`);
  }
}
