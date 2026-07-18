// Verifica si la columna metadata existe en payments (DB real).
import { readFileSync } from "node:fs";

const envText = readFileSync("C:/Users/User/Documents/Click/.env.local", "utf8");
function getEnv(key) {
  const m = envText.match(new RegExp(`^${key}="([^"]*)"`, "m"));
  return m?.[1] ?? "";
}
const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const key = getEnv("SUPABASE_SECRET_KEY");

const res = await fetch(
  `${url}/rest/v1/payments?select=id,metadata&limit=1`,
  {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }
);
console.log("status:", res.status);
const text = await res.text();
console.log("first 500:", text.slice(0, 500));

// Tambien intentar con HEAD en una sola fila para ver columnas.
const res2 = await fetch(
  `${url}/rest/v1/payments?select=*&limit=0`,
  {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }
);
console.log("\nHEAD-like status:", res2.status);
const text2 = await res2.text();
console.log("body:", text2 || "(empty)");
