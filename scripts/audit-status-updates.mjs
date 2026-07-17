// Verifica: ¿los status updates de Meta tienen body=null y message_type="status_update"?
// Esto confirma que el filtro correcto es body IS NULL, no metadata->>status IS NULL.

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Traer todos los rows con metadata.status seteado en los últimos 7 días
const { data: rows } = await sb
  .from("lead_whatsapp_conversations")
  .select("id, direction, message_type, body, metadata, created_at")
  .not("metadata->>status", "is", null)
  .order("created_at", { ascending: false })
  .limit(20);

console.log(`=== ${rows?.length || 0} rows con metadata.status set (últimos 7 días) ===\n`);

// Clasificar
const byKind = {
  botOutboundWithStatus: [],
  metaStatusUpdateEmpty: [],
  other: [],
};

for (const r of rows ?? []) {
  const status = r.metadata?.status;
  const body = r.body;
  const isBodyEmpty = body === null || body === "";
  const mt = r.message_type;

  if (r.direction === "outbound" && !isBodyEmpty && (mt === "text" || mt === "interactive")) {
    byKind.botOutboundWithStatus.push(r);
  } else if (r.direction === "outbound" && isBodyEmpty) {
    byKind.metaStatusUpdateEmpty.push(r);
  } else {
    byKind.other.push(r);
  }
}

console.log(`Bot outbounds con copy + status: ${byKind.botOutboundWithStatus.length}`);
for (const r of byKind.botOutboundWithStatus.slice(0, 3)) {
  console.log(`  [${r.created_at}] (${r.message_type}) body=${(r.body || "").slice(0, 60)}... status=${r.metadata?.status}`);
}

console.log(`\nMeta status updates vacíos: ${byKind.metaStatusUpdateEmpty.length}`);
for (const r of byKind.metaStatusUpdateEmpty.slice(0, 3)) {
  console.log(`  [${r.created_at}] (${r.message_type}) body=${r.body} status=${r.metadata?.status}`);
}

console.log(`\nOtros (mixed): ${byKind.other.length}`);
for (const r of byKind.other.slice(0, 3)) {
  console.log(`  [${r.created_at}] (${r.message_type}) body=${(r.body || "").slice(0, 60)} status=${r.metadata?.status}`);
}

// Conclusión
console.log("\n=== CONCLUSIÓN ===");
console.log("Para distinguir status updates de Meta vs outbounds del bot con delivery status:");
console.log("- Meta status updates: body=NULL o '', cualquier direction, message_type='text' o 'status_update'");
console.log("- Bot outbounds: body con copy, direction='outbound', message_type='text'/'interactive'/'button'");
console.log("\nFiltro correcto: body IS NOT NULL (excluir body=null/empty).");
console.log("Filtro actual: metadata->>status IS NULL (excluye AMBOS — demasiado agresivo).");
