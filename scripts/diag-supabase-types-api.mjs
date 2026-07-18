// Diagnostico: que devuelve realmente la API de Supabase para typegen.
import { readFileSync } from "node:fs";

const envText = readFileSync("C:/Users/User/Documents/Click/.env.local", "utf8");
const tok = envText.match(/SUPABASE_ACCESS_TOKEN="([^"]*)"/)[1];
const ref = envText.match(/SUPABASE_PROJECT_REF="([^"]*)"/)[1];

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/types/typescript`,
  { headers: { Authorization: `Bearer ${tok}` } }
);
const ct = res.headers.get("content-type");
console.log("status:", res.status, "content-type:", ct);
const text = await res.text();
console.log("text length:", text.length);
console.log("first 300 chars:", JSON.stringify(text.slice(0, 300)));
try {
  const j = JSON.parse(text);
  console.log("parsed as JSON. keys:", Object.keys(j));
  if (j.types) {
    console.log("j.types length:", j.types.length);
    console.log("j.types first 200:", JSON.stringify(j.types.slice(0, 200)));
  }
} catch (e) {
  console.log("not JSON. raw text starts with:", JSON.stringify(text.slice(0, 50)));
}
