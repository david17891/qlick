// Sprint v0.11: add lead_id column to event_attendees typegen.
import fs from "node:fs";

const filePath = "src/types/supabase.ts";
// FIX 2026-07-14: src/types/supabase.ts está guardado en disco como
// UTF-16 LE con BOM (generado por una herramienta Windows previa, NO
// por el typegen oficial). `fs.readFileSync(path, "utf8")` lo lee
// mal — solo ve los bytes bajos de cada char UTF-16 y devuelve
// basura. Hay que especificar "utf16le" explícitamente. La línea 1
// del archivo es BOM (`ff fe`) seguido de "export" en UTF-16 LE.
const buf = fs.readFileSync(filePath);
const isUtf16 = buf[0] === 0xff && buf[1] === 0xfe;
const enc = isUtf16 ? "utf16le" : "utf8";
let content = fs.readFileSync(filePath, enc);
console.log(`[patch] archivo detectado como ${isUtf16 ? "UTF-16 LE" : "UTF-8"} (BOM: ${isUtf16})`);

// Detectar line endings (CRLF en Windows + autocrlf).
const isCRLF = content.includes("\r\n");
const NL = isCRLF ? "\r\n" : "\n";

// Idempotencia.
if (content.includes(`lead_id: string | null${NL}          name: string | null${NL}`)) {
  console.log("Already patched (lead_id present in event_attendees.Row).");
  process.exit(0);
}

// 1. Insertar `lead_id: string | null` en Row (después de import_batch_id).
const rowOld = `          import_batch_id: string | null${NL}          name: string | null${NL}          phone_normalized: string | null${NL}          source: Database["public"]["Enums"]["event_attendee_source"]`;
const rowNew = `          import_batch_id: string | null${NL}          lead_id: string | null${NL}          name: string | null${NL}          phone_normalized: string | null${NL}          source: Database["public"]["Enums"]["event_attendee_source"]`;
if (!content.includes(rowOld)) {
  console.error("ERROR: Row block not found");
  process.exit(1);
}
content = content.replace(rowOld, rowNew);

// 2. Insertar `lead_id?: string | null` en Insert.
const insertOld = `          import_batch_id?: string | null${NL}          name?: string | null${NL}          phone_normalized?: string | null${NL}          source?: Database["public"]["Enums"]["event_attendee_source"]`;
const insertNew = `          import_batch_id?: string | null${NL}          lead_id?: string | null${NL}          name?: string | null${NL}          phone_normalized?: string | null${NL}          source?: Database["public"]["Enums"]["event_attendee_source"]`;
if (!content.includes(insertOld)) {
  console.error("ERROR: Insert block not found");
  process.exit(1);
}
content = content.replace(insertOld, insertNew);

// 3. Insertar `lead_id?: string | null` en Update.
const updateOld = `          import_batch_id?: string | null${NL}          name?: string | null${NL}          phone_normalized?: string | null${NL}          source?: Database["public"]["Enums"]["event_attendee_source"]`;
const updateNew = `          import_batch_id?: string | null${NL}          lead_id?: string | null${NL}          name?: string | null${NL}          phone_normalized?: string | null${NL}          source?: Database["public"]["Enums"]["event_attendee_source"]`;
if (!content.includes(updateOld)) {
  console.error("ERROR: Update block not found");
  process.exit(1);
}
content = content.replace(updateOld, updateNew);

// 4. Agregar la relación FK a leads en el array Relationships.
const relOld = `          {${NL}            foreignKeyName: "event_attendees_event_id_fkey"${NL}            columns: ["event_id"]${NL}            isOneToOne: false${NL}            referencedRelation: "events"${NL}            referencedColumns: ["id"]${NL}          },${NL}        ]`;
const relNew = `          {${NL}            foreignKeyName: "event_attendees_event_id_fkey"${NL}            columns: ["event_id"]${NL}            isOneToOne: false${NL}            referencedRelation: "events"${NL}            referencedColumns: ["id"]${NL}          },${NL}          {${NL}            foreignKeyName: "event_attendees_lead_id_fkey"${NL}            columns: ["lead_id"]${NL}            isOneToOne: false${NL}            referencedRelation: "leads"${NL}            referencedColumns: ["id"]${NL}          },${NL}        ]`;
if (!content.includes(relOld)) {
  console.error("ERROR: Relationships block not found");
  process.exit(1);
}
content = content.replace(relOld, relNew);

fs.writeFileSync(filePath, content, enc);
console.log("Patched successfully. event_attendees now has lead_id in Row/Insert/Update + FK relationship.");
