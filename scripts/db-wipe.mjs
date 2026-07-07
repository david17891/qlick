import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function parseEnvFile(path) {
  try {
    const content = readFileSync(path, "utf-8");
    const out = {};
    for (let line of content.split("\n")) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error("❌ Error: Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const argv = process.argv.slice(2);
const hasConfirm = argv.includes("--confirm");
const modeArchived = argv.includes("--archived");
const modeAll = argv.includes("--all");
const modeFunnel = argv.includes("--funnel");
const modeComplete = argv.includes("--complete");

function printHelp() {
  console.log(`
🧹 Utilidad de Limpieza de Base de Datos para Qlick

Uso:
  node scripts/db-wipe.mjs [opciones] --confirm

Opciones de limpieza (elige una):
  --archived   Borra permanentemente solo los leads archivados (soft-deleted) y su historial.
  --all        Borra todos los leads de la base de datos (con sus notas, tareas, conversaciones, etc.).
  --funnel     Borra todos los registros del funnel (encuestas, asistencias, confirmaciones).
  --complete   Borra absolutamente todo (leads, eventos, encuestas, pagos, soporte, etc.).

Seguridad:
  --confirm    Obligatorio para aplicar los cambios a la base de datos. Sin este flag,
               el script corre en modo SIMULACIÓN (dry-run).
`);
}

if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (!modeArchived && !modeAll && !modeFunnel && !modeComplete) {
  console.error("❌ Debes elegir una opción de limpieza (--archived, --all, --funnel o --complete).");
  printHelp();
  process.exit(1);
}

async function wipe() {
  const confirmText = hasConfirm ? "APLICANDO CAMBIOS REALES" : "SIMULACIÓN (Dry-run)";
  console.log(`========================================`);
  console.log(`🚀 Modo: ${confirmText}`);
  console.log(`========================================\n`);

  if (modeArchived) {
    console.log("🔍 Buscando leads con estado 'archived'...");
    const { data: archivedLeads, error: fetchErr } = await supabase
      .from("leads")
      .select("id, name, email")
      .eq("status", "archived");

    if (fetchErr) {
      console.error("❌ Error consultando leads archivados:", fetchErr.message);
      return;
    }

    if (!archivedLeads || archivedLeads.length === 0) {
      console.log("ℹ️ No hay leads archivados en la base de datos.");
      return;
    }

    console.log(`Encontrados ${archivedLeads.length} leads archivados.`);
    const leadIds = archivedLeads.map((l) => l.id);

    if (hasConfirm) {
      // Eliminar logs de WhatsApp asociados
      await supabase.from("lead_whatsapp_log").delete().in("lead_id", leadIds);
      await supabase.from("lead_whatsapp_conversations").delete().in("lead_id", leadIds);
      await supabase.from("lead_interactions").delete().in("lead_id", leadIds);
      await supabase.from("lead_notes").delete().in("lead_id", leadIds);
      await supabase.from("crm_tasks").delete().in("lead_id", leadIds);
      await supabase.from("lead_event_links").delete().in("lead_id", leadIds);
      
      const { count, error } = await supabase
        .from("leads")
        .delete({ count: "exact" })
        .in("id", leadIds);

      if (error) {
        console.error("❌ Error eliminando leads archivados:", error.message);
      } else {
        console.log(`✅ Se eliminaron exitosamente ${count} leads archivados de la base de datos.`);
      }
    } else {
      console.log(`[Simulación] Se eliminarían ${archivedLeads.length} leads archivados y su historial asociado.`);
    }
  }

  if (modeAll || modeComplete) {
    console.log("🔍 Preparando limpieza completa de CRM (leads y dependencias)...");
    
    if (hasConfirm) {
      // 1. Borrar todas las relaciones
      await supabase.from("lead_whatsapp_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("lead_whatsapp_conversations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("lead_interactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("lead_notes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("crm_tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("lead_event_links").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      const { count, error } = await supabase
        .from("leads")
        .delete({ count: "exact" })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) {
        console.error("❌ Error limpiando tabla leads:", error.message);
      } else {
        console.log(`✅ Se eliminaron todos los leads (${count}) e historial del CRM.`);
      }
    } else {
      console.log("[Simulación] Se borrarían todos los leads, conversaciones, notas, tareas e interacciones.");
    }
  }

  if (modeFunnel || modeComplete) {
    console.log("🔍 Preparando limpieza de registros de funnel...");
    
    if (hasConfirm) {
      await supabase.from("event_survey_unmatched").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("event_surveys").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("event_attendees").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      const { count: cCount, error: cErr } = await supabase
        .from("event_confirmations")
        .delete({ count: "exact" })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (cErr) {
        console.error("❌ Error eliminando confirmaciones:", cErr.message);
      } else {
        console.log(`✅ Se eliminaron todas las confirmaciones (${cCount}), encuestas y registros de asistencia.`);
      }
    } else {
      console.log("[Simulación] Se borrarían todas las encuestas, asistencias y confirmaciones de eventos.");
    }
  }

  if (modeComplete) {
    console.log("🔍 Preparando limpieza de entidades principales (eventos, pagos, inscripciones)...");
    
    if (hasConfirm) {
      await supabase.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("enrollments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("admin_audit_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      const { count: evCount, error: evErr } = await supabase
        .from("events")
        .delete({ count: "exact" })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (evErr) {
        console.error("❌ Error eliminando eventos:", evErr.message);
      } else {
        console.log(`✅ Se eliminaron todos los eventos (${evCount}), logs de auditoría, pagos e inscripciones.`);
      }
    } else {
      console.log("[Simulación] Se borrarían todos los eventos, pagos, inscripciones y logs de auditoría.");
    }
  }

  console.log("\n✨ Operación completada.");
}

wipe();
