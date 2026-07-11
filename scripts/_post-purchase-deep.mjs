import { createClient } from "@supabase/supabase-js";
const ref = process.env.SUPABASE_PROJECT_REF ?? "";
const key = process.env.SUPABASE_SECRET_KEY ?? "";
const sb = createClient(`https://${ref}.supabase.co`, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
const { data: recentPayments } = await sb
  .from("payments")
  .select("id, user_id, course_id, amount_mxn, status, external_reference, created_at")
  .gte("created_at", since)
  .order("created_at", { ascending: false });

if (!recentPayments || recentPayments.length === 0) {
  console.log("NO payments found");
  process.exit(0);
}

for (const p of recentPayments) {
  const { data: userData } = await sb.auth.admin.getUserById(p.user_id);
  const email = userData?.user?.email ?? "(no email)";
  console.log(`PAYMENT ${p.id}:`);
  console.log(`  user_email=${email}`);
  console.log(`  user_id=${p.user_id}`);
  console.log(`  amount=${p.amount_mxn} status=${p.status}`);
  console.log(`  extref=${p.external_reference}`);
  console.log("");

  // Find the course and access
  const { data: course } = await sb.from("courses").select("id, slug, title").eq("id", p.course_id).maybeSingle();
  console.log(`  course: ${course ? course.slug + " (" + course.title + ")" : "(null)"}`);

  const { data: access } = await sb.from("course_access").select("*").eq("user_id", p.user_id).eq("course_id", p.course_id);
  console.log(`  course_access rows: ${access?.length ?? 0}`);
  if (access) for (const a of access) {
    console.log(`    - access_source=${a.access_source} status=${a.status ?? "(null)"} granted_at=${a.created_at}`);
  }
  console.log("---");
}
