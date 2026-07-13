// scripts/audit-voseo.mjs
//
// Audita archivos con copy visible al cliente buscando conjugaciones
// voseantes argentinas explícitas. NO busca terminaciones -ás genéricas
// porque esas también aparecen en futuros del indicativo tuteo
// ("lo usarás", "llegarás") que son correctos en MX.
//
// v3 (súper-auditoría 2026-07-12, AUDIT-008): refinado el ALLOWLIST
// para que matchee contra la LÍNEA completa (no solo la palabra matched).
// Esto elimina falsos positivos como "Parámetros", "diámetro",
// "kilómetros" que el script v2 marcaba incorrectamente porque rompía
// la palabra y solo veía "pará", "diá", "kiló".
//
// Uso: npm run audit:voseo
// Exit 0 = limpio, Exit 1 = matches encontrados.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const VOSE_WORDS = [
  // imperativos voseantes
  "\\bdecí\\b", "\\bdecime\\b", "\\bdecinos\\b",
  "\\bhacé\\b", "\\bhacelo\\b", "\\bmandá\\b", "\\bmandame\\b",
  "\\bandá\\b", "\\btené\\b", "\\babrí\\b", "\\besperá\\b",
  "\\banotá\\b", "\\bavisame\\b", "\\bavisanos\\b",
  "\\bcopiá\\b", "\\bpegá\\b", "\\bcontestá\\b",
  "\\bfijate\\b", "\\bfijáte\\b", "\\bpará\\b", "\\bsentate\\b",
  "\\bmirá\\b", "\\bmiráte\\b", "\\bprobá\\b", "\\bprobalo\\b",
  "\\bcomprá\\b", "\\bcomprálo\\b", "\\bcompletá\\b", "\\benviá\\b",
  "\\benvialo\\b", "\\bpasá\\b", "\\bpasame\\b",
  // presente voseante
  "\\btenés\\b", "\\bquerés\\b", "\\bpensás\\b", "\\bdecís\\b",
  "\\bhablás\\b", "\\bsabés\\b", "\\bpodés\\b", "\\bvenís\\b",
  "\\bvolvés\\b", "\\btraés\\b", "\\bponés\\b", "\\bsalís\\b",
  "\\bsos\\b",
  "\\bcreés\\b",
  // pronombres
  "\\bvos\\b",
  // muletillas
  "\\bche\\b", "\\bboludo\\b", "\\bpibe\\b", "\\bchabón\\b",
  "\\brecontra\\b", "\\bmorfar\\b", "\\bcopado\\b", "\\bpiola\\b",
  "\\bposta\\b", "\\bguita\\b", "\\bfaso\\b",
];

const VOSE_REGEX = new RegExp(VOSE_WORDS.join("|"), "gi");

// ALLOWLIST v3: aplicada contra la LÍNEA COMPLETA (no solo la palabra
// matched). Esto filtra falsos positivos legítimos:
// - "Parámetros", "diámetro", "kilómetros" (sustantivos técnicos)
// - "decime" / "pasame" dentro de regex literals (patrones de matching
//   de input del usuario, no copy del bot)
// - Strings dentro de arrays de detección (ej. lista de sinónimos del bot)
const ALLOWLIST = [
  // Sustantivos técnicos con tildes que el script v2 marcaba como falso positivo
  /par[áa]metros?/i, /di[áa]metros?/i, /kil[óo]metros?/i,
  /mil[íi]metros?/i, /cent[íi]metros?/i,
  // Plurales y adverbios comunes
  /despu[ée]s/i, /m[áa]s\b/i, /at[áa]s\b/i, /detr[áa]s\b/i,
  /inter[ée]s/i, /pa[íi]s\b/i, /mes(es)?\b/i,
  /d[íi]as?\b/i, /semanas?\b/i, /meses?\b/i,
  // "deja" / "mira" / "para" / "avisa" / "cuenta" sin tilde = tuteo
  /\bdeja\b/i, /\bmira\b/i, /\bpara\b/i, /\bavisa\b/i, /\bcuenta\b/i,
  // "decime" / "pasame" / "avisame" / "mandame" como parte de regex de matching
  /\/(decime|pasame|avisame|mandame)[^/]*\/i\.test\(/i,
  /\.test\([^)]*(decime|pasame|avisame|mandame)[^)]*\)/i,
  // Arrays de sinónimos del bot (listas para matching de input)
  /["'][^"']*\b(decime|pasame|avisame|mandame|anotáme|anotame|anotá)\b[^"']*["']/i,
];

function isAllowedMatch(fullLine) {
  for (const re of ALLOWLIST) {
    if (re.test(fullLine)) return true;
  }
  return false;
}

function findVoseInLine(line) {
  const matches = [];
  // Skip si la línea entera está en ALLOWLIST (ej. regex, arrays de sinónimos)
  if (isAllowedMatch(line)) return matches;

  const re = new RegExp(VOSE_REGEX.source, "gi");
  let m;
  while ((m = re.exec(line)) !== null) {
    matches.push({ word: m[0], index: m.index });
  }
  return matches;
}

const AUDIT_DIRS = [
  "src/lib/email/templates",
  "src/lib/whatsapp",
  "src/lib/contact",
  "src/components",
  "src/app",
];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
}

const files = [];
for (const dir of AUDIT_DIRS) {
  try {
    statSync(dir);
    walk(dir, files);
  } catch {
    // dir doesn't exist, skip
  }
}

let totalMatches = 0;
let cleanFiles = 0;
const issues = [];

for (const f of files) {
  const content = readFileSync(f, "utf-8");
  const lines = content.split("\n");
  let fileHasMatches = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) {
      continue;
    }
    const matches = findVoseInLine(line);
    if (matches.length === 0) continue;

    fileHasMatches = true;
    totalMatches += matches.length;
    issues.push({
      file: f,
      line: i + 1,
      text: line.trim().slice(0, 150),
      matches: matches.map((m) => m.word),
    });
  }

  if (!fileHasMatches) cleanFiles++;
}

console.log(`Audit de copy visible al cliente (v3, ALLOWLIST contra línea completa):`);
console.log(`  Archivos escaneados: ${files.length}`);
console.log(`  Archivos limpios: ${cleanFiles}`);
console.log(`  Archivos con matches: ${files.length - cleanFiles}`);
console.log(`  Matches totales: ${totalMatches}`);
console.log("");

if (issues.length === 0) {
  console.log("✓ Cero voseo detectado en el código visible al cliente.");
  process.exit(0);
}

console.log("✗ Matches encontrados:");
for (const i of issues) {
  console.log(`  ${i.file}:${i.line} → [${i.matches.join(", ")}]`);
  console.log(`    ${i.text}`);
}
process.exit(1);
