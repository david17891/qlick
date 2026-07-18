// Regenera src/types/supabase.ts via la API de Supabase.
// Usa SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF de .env.local.
import { writeFileSync, readFileSync, existsSync, statSync } from "node:fs";

const envFile = "C:/Users/User/Documents/Click/.env.local";
const envText = readFileSync(envFile, "utf8");
function getEnv(key) {
  const m = envText.match(new RegExp(`^${key}="([^"]*)"`, "m"));
  return m?.[1] ?? "";
}
const token = getEnv("SUPABASE_ACCESS_TOKEN");
const projectRef = getEnv("SUPABASE_PROJECT_REF");
if (!token || !projectRef) {
  console.error("Faltan SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF en .env.local");
  process.exit(1);
}

const outPath = "C:/Users/User/Documents/Click/src/types/supabase.ts";
const before = existsSync(outPath) ? statSync(outPath).size : 0;

console.log("Llamando a la API de Supabase para regenerar typegen...");
console.log("  project:", projectRef);
console.log("  output:", outPath);
console.log("  size antes:", before, "bytes");

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/types/typescript`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  }
);
if (!res.ok) {
  console.error("Error:", res.status, await res.text());
  process.exit(1);
}
// La API responde { "types": "..." } — extraer el código TS real.
const json = await res.json();
const text = json.types;
if (typeof text !== "string" || !text.startsWith("export ")) {
  console.error("Respuesta inesperada. keys:", Object.keys(json), "first 100:", String(text).slice(0, 100));
  process.exit(1);
}
writeFileSync(outPath, text, "utf8");
const after = statSync(outPath).size;
console.log("  size despues:", after, "bytes");
console.log("  delta:", after - before, "bytes");
console.log("\nPrimeras 20 lineas del typegen:");
for (const line of text.split("\n").slice(0, 20)) {
  console.log("  " + line);
}
