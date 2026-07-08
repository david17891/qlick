// scripts/_patch-event-rules-no-affirm.mjs
// FIX urgente (sesion 2026-07-07 ~21:35): las conversaciones del bot
// del 8 de julio muestran al LLM diciendo "ya tienes tu lugar apartado"
// o "ya tienes tu lugar asegurado" sin haber completado el flow de
// inscripcion (no hay email del lead capturado). Eso es una alucinacion
// que rompe la confianza del lead.
//
// El event_rules del evento ya tiene reglas generales contra esto
// ("No decir que registraste informacion si no ocurrio", "No confirmar
// inscripciones"), pero el LLM las ignora en contexto conversacional
// largo. Agrego reglas mas explicitas y operativas.
//
// Tambien agrego reglas para el nuevo comportamiento:
//   - Captura desordenada: el bot debe procesar nombre+email aunque
//     lleguen en cualquier orden o en el mismo mensaje.
//   - No re-preguntar si ya tiene el dato.
//   - Loop "Si": no afirmar inscripcion solo por un "Si" sin haber
//     completado el flow (nombre + email validos + QR generado).

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
  console.error("Faltan env vars.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// 1) Leer las reglas actuales para preservarlas.
const { data: current, error: getErr } = await sb
  .from("events")
  .select("id, slug, title, event_rules")
  .eq("short_code", "AA4E")
  .maybeSingle();

if (getErr) {
  console.error("ERR leyendo evento:", getErr.message);
  process.exit(1);
}
if (!current) {
  console.error("[ERROR] Evento AA4E no encontrado.");
  process.exit(1);
}

const currentRules = current.event_rules ?? { personality: "", rules: [] };
const existingRules = new Set(currentRules.rules ?? []);

// 2) Reglas nuevas (idempotentes: si ya existen, no duplicar).
const NEW_RULES = [
  // Anti-alucinacion de inscripcion
  "No afirmar que el lugar del lead esta apartado o asegurado a menos que el sistema haya confirmado la inscripcion real (nombre completo + email + QR generado).",
  "No usar frases como 'ya tienes tu lugar' o 'queda confirmado' si el bot todavia no proceso el email del lead.",
  "Si el lead respondio 'Si' o cualquier afirmacion ambigua pero el flow de captura no esta completo, NO saltar pasos: primero pedir nombre, luego email.",
  // Captura desordenada (sesion 2026-07-07)
  "Si el lead entrega nombre y email en el mismo mensaje (o en orden distinto al esperado), procesar ambos: guardar nombre, capturar email, completar inscripcion.",
  "Si el bot pidio nombre y el lead hace una pregunta en su lugar, responder la pregunta brevemente y volver a pedir el nombre al final del mensaje.",
  // Loop "Si" / Si por favor
  "Si el lead responde 'Si por favor' o 'Si' despues de que el bot pidio el email, interpretar el 'Si' como confirmacion para capturar el email en ese mismo turno (no como inscripcion ya hecha)."
];

let added = 0;
for (const rule of NEW_RULES) {
  if (!existingRules.has(rule)) {
    existingRules.add(rule);
    added += 1;
  }
}

const updatedRules = {
  ...currentRules,
  rules: Array.from(existingRules)
};

// 3) UPDATE.
const { error: updErr } = await sb
  .from("events")
  .update({ event_rules: updatedRules })
  .eq("id", current.id);

if (updErr) {
  console.error("ERR actualizando event_rules:", updErr.message);
  process.exit(1);
}

console.log(`[OK] event_rules actualizado. Reglas totales: ${updatedRules.rules.length}. Nuevas agregadas: ${added}.`);
