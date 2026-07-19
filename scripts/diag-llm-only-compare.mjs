// scripts/diag-llm-only-compare.mjs
// Compara solo los casos que FUERON AL LLM entre v1 y v2.
import { readFileSync } from "node:fs";

const [, , v1Arg, v2Arg] = process.argv;
const v1 = JSON.parse(readFileSync(v1Arg, "utf8"));
const v2 = JSON.parse(readFileSync(v2Arg, "utf8"));

console.log("CASOS QUE FUERON AL LLM (responseKind=text):");
console.log("");
const llmOnly = v1.results.filter((r) => r.responseKind === "text");
console.log("Total casos LLM-driven v1:", llmOnly.length);
console.log("");

for (const r1 of llmOnly) {
  const r2 = v2.results.find((r) => r.idx === r1.idx);
  if (!r2) continue;
  console.log("=== idx " + r1.idx + " (" + r1.category + ", input=\"" + r1.text + "\") ===");
  console.log("v1 (" + r1.elapsedMs + "ms):");
  console.log("  " + (r1.responsePreview || "").slice(0, 350).replace(/\n/g, " | "));
  console.log("v2 (" + r2.elapsedMs + "ms):");
  console.log("  " + (r2.responsePreview || "").slice(0, 350).replace(/\n/g, " | "));
  console.log("");
}
