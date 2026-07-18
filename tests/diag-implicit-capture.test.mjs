// Debug: leer los archivos relevantes y entender qué está pasando
// con el test 985 que falla.
import { readFileSync } from "node:fs";

// 1. Ver el FAKE_EVENT_PRESENCIAL actualizado
const testFile = readFileSync(
  "C:/Users/User/Documents/Click/tests/whatsapp-bot-implicit-capture-paid.test.mjs",
  "utf8"
);
const startAtMatch = testFile.match(/starts_at: new Date\(.*?\)/);
console.log("FAKE_EVENT starts_at literal:", startAtMatch?.[0] || "NO ENCONTRADO");

// 2. Buscar la fecha actual y el cutoff
const now = new Date();
const cutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000);
console.log("NOW:", now.toISOString());
console.log("CUTOFF (now - 6h):", cutoff.toISOString());

// 3. Ver si el starts_at calculado está después del cutoff
if (startAtMatch) {
  const days = startAtMatch[0].match(/(\d+)\s*\*/);
  if (days) {
    const futureStart = new Date(now.getTime() + parseInt(days[1]) * 24 * 60 * 60 * 1000);
    console.log(`starts_at futuro: ${futureStart.toISOString()}`);
    console.log(`¿Pasa el filtro gte? ${futureStart >= cutoff ? "SI" : "NO"}`);
  }
}
