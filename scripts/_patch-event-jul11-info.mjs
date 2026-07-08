// scripts/_patch-event-jul11-info.mjs
// FIX urgente (sesion 2026-07-07 ~21:25): las conversaciones del WhatsApp
// del evento "Marketing + IA para Emprendedores" (11 jul) muestran que
// el bot no puede responder dudas basicas (costo, constancia, link Zoom)
// porque la DB no tiene esos datos cargados. David confirmo:
//   - Costo: gratuito
//   - Constancia: si, emitida por la empresa (sin validez oficial)
//   - Link Zoom: se envia 24h antes (no publicado aun)
//   - Modalidad: virtual / Zoom
//
// Lo que hago: UPDATE del campo `description` del evento con un bloque
// "Precios y logistica" al inicio. El resto del description (temario,
// audiencia) se preserva.
//
// Esto le da al bot informacion oficial para responder sin improvisar.
// No toco schema, no toco bot-engine, no toco event_rules.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(p) {
  const out = {};
  if (!existsSync(p)) return out;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// 1) Cargar description actual para preservarla.
const { data: current, error: getErr } = await sb
  .from("events")
  .select("id, slug, title, description, location, event_rules")
  .eq("short_code", "AA4E")
  .eq("status", "published")
  .maybeSingle();

if (getErr) {
  console.error("ERR leyendo evento:", getErr.message);
  process.exit(1);
}
if (!current) {
  console.error("[ERROR] Evento AA4E no encontrado.");
  process.exit(1);
}

console.log("[OK] Evento encontrado:", current.slug, "->", current.title);

// 2) Construir el nuevo bloque de info oficial para prepend al description.
//    Formato deliberadamente conciso para que el system prompt del bot lo lea
//    sin ambiguedad. NO inventa: cada dato viene confirmado por David en
//    sesion 2026-07-07 ~21:22.
const NEW_INFO_BLOCK = [
  "Precios y logistica (informacion oficial):",
  "- Costo: gratuito. No tiene ningun costo para el asistente.",
  "- Constancia: si, se entrega constancia de asistencia al finalizar el taller, emitida por Qlick Marketing Digital (es una constancia de la empresa, no tiene validez oficial ni curricular).",
  "- Modalidad: 100% virtual por Zoom.",
  "- Enlace de Zoom: NO se publica de antemano. Se envia por correo electronico al asistente 24 horas antes del evento (el viernes previo).",
  "",
  "(Para temario, ver la seccion 'Temario' mas abajo.)",
  ""
].join("\n");

const newDescription = NEW_INFO_BLOCK + (current.description ?? "");

// 3) UPDATE.
const { error: updErr } = await sb
  .from("events")
  .update({ description: newDescription })
  .eq("id", current.id);

if (updErr) {
  console.error("ERR actualizando:", updErr.message);
  process.exit(1);
}

console.log("[OK] description actualizado.");
console.log("");
console.log("--- NUEVO description (preview, primeros 1200 chars) ---");
console.log(newDescription.slice(0, 1200));
