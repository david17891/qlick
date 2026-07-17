// Lee env vars de WhatsApp.
import { readFileSync, existsSync } from "node:fs";
const envText = readFileSync(".env.local", "utf-8");
const env = {};
for (const l of envText.split(/\r?\n/)) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (m) {
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
}
console.log("=== WhatsApp env vars ===");
console.log("NEXT_PUBLIC_WHATSAPP_PROVIDER:", env.NEXT_PUBLIC_WHATSAPP_PROVIDER || "(undefined)");
console.log("WHATSAPP_CLOUD_PHONE_NUMBER_ID:", env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "(undefined)");
console.log("WHATSAPP_CLOUD_ACCESS_TOKEN:", env.WHATSAPP_CLOUD_ACCESS_TOKEN?.slice(0, 30) || "(undefined)");
console.log("NEXT_PUBLIC_WHATSAPP_SALES_NUMBER:", env.NEXT_PUBLIC_WHATSAPP_SALES_NUMBER || "(undefined)");

// Verificar providers disponibles.
const fs = await import("node:fs");
console.log("\n=== Providers disponibles ===");
const providers = fs.readdirSync("src/lib/whatsapp/providers");
for (const p of providers) console.log("  -", p);
