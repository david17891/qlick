import { createClient } from "@supabase/supabase-js";

const ref = process.env.SUPABASE_PROJECT_REF ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";

if (!ref || !key) {
  console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const sb = createClient(`https://${ref}.supabase.co`, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Just get the first 3 rows so we see actual columns
const { data, error } = await sb
  .from("courses")
  .select("*")
  .gt("price_mxn", 0)
  .order("price_mxn", { ascending: false })
  .limit(3);

if (error) {
  console.error("Query error:", error.message);
  process.exit(2);
}

if (!data || data.length === 0) {
  // Fallback: list any courses
  const { data: anyData, error: anyErr } = await sb
    .from("courses")
    .select("*")
    .limit(3);
  if (anyErr) { console.error("Fallback error:", anyErr.message); process.exit(2); }
  console.log("No courses with price_mxn > 0. Any courses:");
  console.log(JSON.stringify(anyData, null, 2));
} else {
  console.log(JSON.stringify(data, null, 2));
}
