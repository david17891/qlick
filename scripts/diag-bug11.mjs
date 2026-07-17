import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1. Introspeccionar columnas
const { data: evtSample } = await sb.from("events").select("*").limit(1);
const evtCols = evtSample?.[0] ? Object.keys(evtSample[0]).sort() : [];
console.log("EVENT COLS:", evtCols.join(", "));

const { data: leadSample } = await sb.from("leads").select("*").limit(1);
const leadCols = leadSample?.[0] ? Object.keys(leadSample[0]).sort() : [];
console.log("LEAD COLS:", leadCols.join(", "));

const { data: convSample } = await sb
  .from("lead_whatsapp_conversations")
  .select("*")
  .limit(1);
const convCols = convSample?.[0] ? Object.keys(convSample[0]).sort() : [];
console.log("CONV COLS:", convCols.join(", "));

// 2. Verificar evento target
const { data: evts, error: evtErr } = await sb
  .from("events")
  .select("*")
  .eq("slug", "marketing-ia-para-emprendedores-pago")
  .maybeSingle();
console.log("\nEVENT target:", JSON.stringify(evts, null, 2));
if (evtErr) console.error("evt err:", evtErr.message);

// 3. Todos los eventos activos publicados
const statusCol = evtCols.find((c) => c.includes("status")) || "status";
const { data: publishedEvts, error: peErr } = await sb
  .from("events")
  .select("*")
  .neq(statusCol, "archived")
  .order("starts_at", { ascending: true });
console.log(`\nALL NON-ARCHIVED EVENTS: ${publishedEvts?.length || 0}`);
publishedEvts?.forEach((e) =>
  console.log(
    `  - ${e.slug} | ${e[statusCol]} | ${e.starts_at} | priceMxn=${e.price_mxn ?? e.priceMxn ?? e.price ?? "?"}`
  )
);
if (peErr) console.error("pe err:", peErr.message);

// 4. Buscar lead de David (por phone o email)
let lead = null;
const { data: leadByPhone } = await sb
  .from("leads")
  .select("*")
  .eq("phone", "+526532935492")
  .maybeSingle();
lead = leadByPhone;
if (!lead) {
  const { data: leadByEmail } = await sb
    .from("leads")
    .select("*")
    .eq("email", "david17891@gmail.com")
    .maybeSingle();
  lead = leadByEmail;
}
console.log("\nDAVID LEAD:", JSON.stringify(lead, null, 2));

if (lead) {
  // 5. Outbounds del bot (últimos 10)
  const { data: outbounds } = await sb
    .from("lead_whatsapp_conversations")
    .select("id, direction, body, message_type, created_at, metadata")
    .eq("lead_id", lead.id)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(10);
  console.log(`\nDAVID OUTBOUNDS (last ${outbounds?.length || 0}):`);
  outbounds?.forEach((c) => {
    const meta = c.metadata ? JSON.stringify(c.metadata) : "null";
    const body = (c.body || "").slice(0, 100);
    console.log(`  [${c.created_at}] (${c.message_type}) ${body}`);
    console.log(`    metadata: ${meta}`);
  });

  // 6. Inbounds del lead
  const { data: inbounds } = await sb
    .from("lead_whatsapp_conversations")
    .select("id, direction, body, message_type, created_at, metadata")
    .eq("lead_id", lead.id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log(`\nDAVID INBOUNDS (last ${inbounds?.length || 0}):`);
  inbounds?.forEach((c) => {
    const meta = c.metadata ? JSON.stringify(c.metadata).slice(0, 200) : "null";
    const body = (c.body || "").slice(0, 100);
    console.log(`  [${c.created_at}] (${c.message_type}) ${body}`);
    console.log(`    metadata: ${meta}`);
  });
}
