// Test: simular el filtro de loadConversationWindow con los rows reales.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Traer últimos 10 mensajes del lead David
const { data: rows } = await sb
  .from("lead_whatsapp_conversations")
  .select("id, direction, message_type, body, created_at, metadata, phone_normalized, lead_id")
  .eq("phone_normalized", "+526532935492")
  .order("created_at", { ascending: false })
  .limit(10);

console.log("=== TODOS LOS MENSAJES (sin filtro) ===");
for (const r of rows ?? []) {
  const meta = r.metadata ? JSON.stringify(r.metadata).slice(0, 100) : "null";
  const body = (r.body || "(null)").slice(0, 70);
  console.log(`[${r.created_at}] [${r.direction}] (${r.message_type}) ${body}`);
  console.log(`     meta: ${meta}`);
}

console.log("\n=== FILTRO ACTUAL (metadata->>status IS NULL) ===");
const filtered = (rows ?? []).filter((r) => {
  // El filtro de loadConversationWindow: is("metadata->>status", null)
  // Eso significa: incluir solo si metadata->>status es null.
  const status = r.metadata?.status;
  return status === undefined || status === null;
});
console.log(`Quedan ${filtered.length} de ${rows?.length} mensajes.`);
for (const r of filtered) {
  const body = (r.body || "(null)").slice(0, 70);
  console.log(`  [${r.direction}] (${r.message_type}) ${body}`);
}

console.log("\n=== FILTRO PROPUESTO (body IS NOT NULL) ===");
const proposed = (rows ?? []).filter((r) => r.body !== null && r.body !== "");
console.log(`Quedan ${proposed.length} de ${rows?.length} mensajes.`);
for (const r of proposed) {
  const body = (r.body || "(null)").slice(0, 70);
  console.log(`  [${r.direction}] (${r.message_type}) ${body}`);
}

console.log("\n=== ANÁLISIS ===");
const outbound3 = (rows ?? []).find((r) =>
  r.body?.startsWith("Para inscribirte al taller")
);
console.log("Outbound 3 ('Para inscribirte...'):");
console.log("  body:", outbound3?.body?.slice(0, 100));
console.log("  metadata.status:", outbound3?.metadata?.status);
console.log("  ¿Filtro actual lo excluye?", !!outbound3?.metadata?.status);
console.log("  ¿Filtro propuesto lo incluye?", !!outbound3?.body);
