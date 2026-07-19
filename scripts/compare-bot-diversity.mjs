// scripts/compare-bot-diversity.mjs
// Compara diversidad de respuestas entre v1 (baseline) y v2 (clon experimental).
// Genera tabla con: categoría | #variaciones | #únicas v1 | #únicas v2 | mejora.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "tests", "output");

// Argumentos: <v1.json> <v2.json>
const [, , v1Arg, v2Arg] = process.argv;
if (!v1Arg || !v2Arg) {
  console.error("Uso: node compare-bot-diversity.mjs <v1.json> <v2.json>");
  process.exit(1);
}

const v1 = JSON.parse(readFileSync(v1Arg, "utf8"));
const v2 = JSON.parse(readFileSync(v2Arg, "utf8"));

// Agrupar por categoría
function groupByCategory(results) {
  const byCat = {};
  for (const r of results) {
    if (!byCat[r.category]) byCat[r.category] = [];
    byCat[r.category].push(r.responsePreview ?? "");
  }
  return byCat;
}

const v1By = groupByCategory(v1.results);
const v2By = groupByCategory(v2.results);

const allCats = new Set([...Object.keys(v1By), ...Object.keys(v2By)]);
const rows = [];
for (const cat of [...allCats].sort()) {
  const v1Resps = v1By[cat] ?? [];
  const v2Resps = v2By[cat] ?? [];
  const v1Uniq = new Set(v1Resps).size;
  const v2Uniq = new Set(v2Resps).size;
  rows.push({
    cat,
    n: v1Resps.length || v2Resps.length,
    v1Uniq,
    v2Uniq,
    delta: v2Uniq - v1Uniq,
    v1Pct: v1Resps.length ? Math.round((v1Uniq / v1Resps.length) * 100) : 0,
    v2Pct: v2Resps.length ? Math.round((v2Uniq / v2Resps.length) * 100) : 0,
  });
}

console.log("=".repeat(86));
console.log("DIVERSIDAD v1 vs v2 (bot global mode)");
console.log("=".repeat(86));
console.log("v1 =", v1Arg);
console.log("v2 =", v2Arg);
console.log("-".repeat(86));
console.log("Categoría".padEnd(14), "N".padStart(3), "v1 únicas".padStart(11), "v2 únicas".padStart(11), "Δ".padStart(5), "v1 %".padStart(6), "v2 %".padStart(6));
console.log("-".repeat(86));
let totalN = 0, totalV1 = 0, totalV2 = 0;
for (const r of rows) {
  console.log(
    r.cat.padEnd(14),
    String(r.n).padStart(3),
    String(r.v1Uniq).padStart(11),
    String(r.v2Uniq).padStart(11),
    (r.delta >= 0 ? "+" : "") + String(r.delta).padStart(4),
    (r.v1Pct + "%").padStart(6),
    (r.v2Pct + "%").padStart(6)
  );
  totalN += r.n;
  totalV1 += r.v1Uniq;
  totalV2 += r.v2Uniq;
}
console.log("-".repeat(86));
const totV1Pct = Math.round((totalV1 / totalN) * 100);
const totV2Pct = Math.round((totalV2 / totalN) * 100);
console.log(
  "TOTAL".padEnd(14),
  String(totalN).padStart(3),
  String(totalV1).padStart(11),
  String(totalV2).padStart(11),
  (totalV2 - totalV1 >= 0 ? "+" : "") + String(totalV2 - totalV1).padStart(4),
  (totV1Pct + "%").padStart(6),
  (totV2Pct + "%").padStart(6)
);
console.log("=".repeat(86));
console.log("");
console.log("Veredicto:");
if (totalV2 > totalV1) {
  console.log(`  v2 GENERA MÁS DIVERSIDAD (+${totalV2 - totalV1} respuestas únicas, +${totV2Pct - totV1Pct} pts).`);
} else if (totalV2 === totalV1) {
  console.log("  v2 y v1 generan IGUAL diversidad.");
} else {
  console.log(`  v2 genera MENOS diversidad (${totalV2 - totalV1} vs v1). Considerar iterar el prompt.`);
}
console.log("");
console.log("Nota: el LLM tiene temperatura y es estocástico. La diferencia puede ser ruido.");
console.log("Para decisión robusta, correr 3 veces y promediar.");
