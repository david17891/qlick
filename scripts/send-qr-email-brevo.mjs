// Envia email del QR via Brevo API directo (bypassea sendQrPassForConfirmation
// que tiene aliases de TS).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

const BREVO_API_KEY = env.BREVO_API_KEY;
const BREVO_FROM = env.BREVO_FROM_ADDRESS || "Qlick Marketing <noreply@qlick.digital>";
const BREVO_REPLY_TO = env.BREVO_REPLY_TO || "david17891@gmail.com";

const TEST_EMAIL = "qlick-stripe4242-mrotzh2c@mailinator.com";
const TEST_NAME = "Test E2E 4242";
const CHECKIN_URL = "https://www.qlick.digital/check-in/3Sn4A1UdF3V0s-0HS_Rx63GyyKMTKyal";
const EVENT_TITLE = "Marketing + IA para Emprendedores (Copia - Pago)";
const EVENT_VENUE = "CANACA, Mexicali";
const EVENT_STARTS_AT = "17 de julio de 2026, 11:00 am";

// HTML simple.
const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Tu entrada — Marketing + IA para Emprendedores</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 24px;">
  <table width="100%" style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    <tr>
      <td style="background: linear-gradient(135deg, #ab3fea 0%, #6a2dbf 100%); padding: 32px 24px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">¡Listo! Tu pago se confirmó</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Tu entrada para ${EVENT_TITLE}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px;">
        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px; margin-bottom: 24px; text-align: center;">
          <p style="color: #166534; font-weight: 600; margin: 0; font-size: 14px;">✓ PAGO CONFIRMADO</p>
          <p style="color: #166534; margin: 4px 0 0 0; font-size: 12px;">$1,000 MXN — Stripe</p>
        </div>

        <p style="color: #111; font-size: 16px; line-height: 1.5; margin: 0 0 16px 0;">Hola <strong>${TEST_NAME}</strong>,</p>

        <p style="color: #374151; font-size: 14px; line-height: 1.5; margin: 0 0 16px 0;">Aquí está tu pase de acceso al evento:</p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 100px;">Evento</td><td style="padding: 8px 0; color: #111; font-size: 14px; font-weight: 500;">${EVENT_TITLE}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Cuándo</td><td style="padding: 8px 0; color: #111; font-size: 14px;">${EVENT_STARTS_AT}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Dónde</td><td style="padding: 8px 0; color: #111; font-size: 14px;">${EVENT_VENUE}</td></tr>
        </table>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${CHECKIN_URL}" style="display: inline-block; background: #ab3fea; color: white; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: 600; font-size: 15px;">Ver mi pase y QR</a>
        </div>

        <p style="color: #6b7280; font-size: 12px; line-height: 1.5; margin: 24px 0 0 0; text-align: center;">Si tienes dudas, responde a este correo.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

const text = `¡Listo! Tu pago se confirmó

Hola ${TEST_NAME},

Tu entrada para ${EVENT_TITLE} está confirmada.

Evento: ${EVENT_TITLE}
Cuándo: ${EVENT_STARTS_AT}
Dónde: ${EVENT_VENUE}

Ver tu pase y QR: ${CHECKIN_URL}

Si tienes dudas, responde a este correo.`;

console.log("[BREVO-EMAIL] Enviando email de prueba con QR...");
console.log("  to:", TEST_EMAIL);
console.log("  from:", BREVO_FROM);
console.log("  checkin_url:", CHECKIN_URL);

const r = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": BREVO_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    sender: { name: "Qlick Marketing", email: BREVO_FROM.match(/<(.+)>/)?.[1] || BREVO_FROM },
    to: [{ email: TEST_EMAIL, name: TEST_NAME }],
    replyTo: { email: BREVO_REPLY_TO },
    subject: `Tu entrada — ${EVENT_TITLE} [PAGADO]`,
    htmlContent: html,
    textContent: text,
    tags: ["stripe-test-4242", "qr-pass"],
  }),
});
const respBody = await r.text();
console.log("[BREVO-EMAIL] status:", r.status);
console.log("[BREVO-EMAIL] body:", respBody);
