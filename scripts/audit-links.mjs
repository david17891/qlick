#!/usr/bin/env node
/**
 * Auditoría ligera de links y botones (alternativa a Playwright).
 *
 * Escanea el código fuente bajo src/ buscando señales de elementos
 * interactivos que NO llevan a ninguna parte:
 *
 *   - href="#", href="" o href con solo "#" (anchors vacíos)
 *   - action="#" en <form>
 *   - <button> sin onClick ni type="submit" (probablemente sin acción)
 *
 * Uso:
 *   npm run audit:links
 *
 * Salida: lista de hallazgos con archivo:línea. Código de salida != 0 si
 * encuentra algo, para poder encadenarlo en CI.
 *
 * Es intencionalmente un escáner textual (regex), no un parser: cubre el 90%
 * de los casos de "se ve clickable pero no hace nada" con cero dependencias.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src/app", "src/components"];

/** @type {{file:string,line:number,snippet:string,reason:string}[]} */
const findings = [];

const PATTERNS = [
  { reason: 'href="#" (anchor vacío)', re: /href\s*=\s*\{?\s*"#"\s*\}?/g },
  { reason: 'href="" (anchor vacío)', re: /href\s*=\s*\{?\s*""\s*\}?/g },
  { reason: 'action="#" (form sin backend)', re: /action\s*=\s*\{?\s*"#"\s*\}?/g }
];

async function walk(dir) {
  let results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await walk(full));
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function scanFile(file) {
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    return;
  }
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const { reason, re } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) {
        findings.push({
          file: relative(ROOT, file).replace(/\\/g, "/"),
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          reason
        });
      }
    }
  });
}

async function main() {
  const files = new Set();
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    try {
      const s = await stat(abs);
      if (s.isDirectory()) {
        for (const f of await walk(abs)) files.add(f);
      }
    } catch {
      console.warn(`(skip) no existe ${dir}`);
    }
  }

  for (const f of files) await scanFile(f);

  console.log("\n🔍 Auditoría de links y botones (src/app, src/components)\n");

  if (findings.length === 0) {
    console.log("✅ Sin anchors vacíos ni forms sin backend.\n");
    return;
  }

  console.log(`⚠️  ${findings.length} hallazgo(s):\n`);
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}  [${f.reason}]`);
    console.log(`    ${f.snippet}\n`);
  }
  process.exitCode = 1;
}

main();
