// scripts/_audit-voseo-templates.mjs
//
// Sprint cierre-eventos-virtuales (FIX 2026-07-11).
// Audita archivos con copy visible al cliente buscando conjugaciones
// voseantes argentinas explícitas. NO busca terminaciones -ás genéricas
// porque esas también aparecen en futuros del indicativo tuteo
// ("lo usarás", "llegarás") que son correctos en MX.
//
// v2: ampliado a múltiples directorios (email templates, whatsapp,
// contact, components, app pages).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const VOSE_WORDS = [
  // imperativos voseantes
  "\\bdecí\\b", "\\bdecime\\b", "\\bdecinos\\b", "\\bdecinote\\b",
  "\\bhacé\\b", "\\bhacelo\\b", "\\bmandá\\b", "\\bmandame\\b",
  "\\bandá\\b", "\\btené\\b", "\\babrí\\b", "\\besperá\\b",
  "\\banotá\\b", "\\bavisame\\b", "\\bavisanos\\b",
  "\\bcopiá\\b", "\\bpegá\\b", "\\bcontestá\\b", "\\bdejá\\b",
  "\\bfijate\\b", "\\bfijáte\\b", "\\bpará\\b", "\\bsentate\\b",
  "\\bmirá\\b", "\\bmiráte\\b", "\\bprobá\\b", "\\bprobalo\\b",
  "\\bcomprá\\b", "\\bcomprálo\\b", "\\bcompletá\\b", "\\benviá\\b",
  "\\benvialo\\b", "\\bpasá\\b", "\\bpasame\\b", "\\bdeja\\b",
  // presente voseante
  "\\btenés\\b", "\\bquerés\\b", "\\bpensás\\b", "\\bdecís\\b",
  "\\bhablás\\b", "\\bsabés\\b", "\\bpodés\\b", "\\bvenís\\b",
  "\\bvolvés\\b", "\\btraés\\b", "\\bponés\\b", "\\bsalís\\b",
  "\\bsos\\b",
  "\\bcreés\\b", "\\bcrees\\b",
  // pronombres
  "\\bvos\\b",
  // muletillas
  "\\bche\\b", "\\bboludo\\b", "\\bpibe\\b", "\\bchabón\\b",
  "\\brecontra\\b", "\\bmorfar\\b", "\\bcopado\\b", "\\bpiola\\b",
  "\\bposta\\b", "\\bguita\\b", "\\bfaso\\b",
];

const VOSE_REGEX = new RegExp(VOSE_WORDS.join("|"), "gi");

const ALLOWLIST = [
  /despu[ée]s/i, /m[áa]s\b/i, /at[áa]s\b/i, /detr[áa]s\b/i,
  /inter[ée]s/i, /pa[íi]s\b/i, /mes(es)?\b/i, /\-[áa]s\b/i,
  // Falsos positivos por \b Unicode: sustantivos que terminan en -á/-ás
  // pero NO son voseo.
  /\bpar[áa]metros?\b/i, /\bkil[óo]metros?\b/i, /\bmil[íi]metros?\b/i,
  /\bd[íi]as?\b/i, /\bsemanas?\b/i, /\bmeses?\b/i,
  // "deja" sin tilde es imperativo tuteo ("tú deja"). Voseo sería
  // "dejá" con tilde. Mi regex detecta ambas porque está case-insensitive.
  /\bdeja\b/i, // ← NO incluir en voseo (es tuteo)
  /\bmira\b/i,  // "mira" sin tilde = tuteo
  /\bpara\b/i,  // "para" preposición, no voseo
  /\bavisa\b/i,  // "avisa" sin tilde = tuteo
  /\bcuenta\b/i,  // "cuenta" sin tilde = tuteo
  /\bencuentra\b/i,
];

function isAllowedMatch(word, fullLine) {
  // Si la línea es un regex literal (entre /.../ o dentro de un array
  // de strings de detección de input del usuario), skip — son patterns
  // para matchear lo que el usuario tipea, no copy del bot.
  if (
    /\/\w*[aá]s\\b\w*\/i\.test/i.test(fullLine) ||
    /\[\s*["'].*\b\w+[áa]s\b.*["']\s*,/.test(fullLine) ||
    /\.test\([^)]*\bdecime\b/i.test(fullLine) ||
    /\.test\([^)]*\b\w+[áa]s\b[^)]*\)/i.test(fullLine)
  ) {
    return true;
  }
  for (const re of ALLOWLIST) {
    if (re.test(word)) return true;
  }
  return false;
}

function findVoseInLine(line) {
  const matches = [];
  const re = new RegExp(VOSE_REGEX.source, "gi");
  let m;
  while ((m = re.exec(line)) !== null) {
    if (!isAllowedMatch(m[0], line)) {
      matches.push({ word: m[0], index: m.index });
    }
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

console.log(`Audit de copy visible al cliente:`);
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
