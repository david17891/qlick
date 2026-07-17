// Crea un QR token directamente en BD (bypassea sendQrPassForConfirmation).
// Util cuando el notify fire-and-forget del webhook fallo (logs no se capturaron).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const envText = readFileSync(join(ROOT, ".env.local"), "utf-8");
const env = { ...process.env };
for (const l of envText.split(/\r?\n/)) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, eq).trim()] = v;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const CONFIRMATION_ID = "c7c43f76-1bfa-4546-bd99-e0dac92cee92";
const LEAD_ID = "1f348e05-7f5d-4d50-aa88-bc8d8f13913e";
const TEST_PHONE = "+525555555550";
const EVENT_ID = "b1afa259-4c99-44a5-87ba-4b29a52d9259";
const TEST_USER_ID = "c39870af-8934-40a1-bc76-6baeb271902e"; // auth.user del test

// Buscar el evento para endsAt.
const { data: evt } = await sb.from("events").select("id, ends_at, starts_at").eq("id", EVENT_ID).maybeSingle();
console.log("[QR-MANUAL] Evento:", evt);

// Generar token.
const token = randomBytes(24).toString("base64url").slice(0, 32);
const expiresAt = evt?.ends_at
  ? new Date(new Date(evt.ends_at).getTime() + 6 * 60 * 60 * 1000).toISOString()
  : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const payload = {
  event_id: EVENT_ID,
  attendee_phone_normalized: TEST_PHONE,
  attendee_name: "Test E2E 4242",
  attendee_email: "qlick-stripe4242-mrotzh2c@mailinator.com",
  token,
  expires_at: expiresAt,
};

console.log("[QR-MANUAL] Insertando event_qr_token...");
const { data, error } = await sb.from("event_qr_tokens").insert(payload).select("id, token, expires_at").single();
if (error) {
  console.error("[QR-MANUAL] ERROR:", error);
  process.exit(1);
}
console.log("[QR-MANUAL] ✓ Token creado:", data.id);
console.log("[QR-MANUAL]   token:", data.token);
console.log("[QR-MANUAL]   expires_at:", data.expires_at);

const checkinUrl = `https://www.qlick.digital/check-in/${data.token}`;
console.log("\n[QR-MANUAL] URL de check-in:");
console.log("  ", checkinUrl);
