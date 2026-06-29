/**
 * Smoke test del wrapper de Resend (src/lib/email/resend-client.ts).
 *
 * Uso:
 *   npx --yes dotenv-cli -e .env.local -- node --experimental-strip-types scripts/smoke-resend.mjs
 *
 *   O sin dotenv-cli (no carga .env.local):
 *   node --experimental-strip-types scripts/smoke-resend.mjs
 *
 * Devuelve:
 *   - { ok: true,  id: "...", mode: "prod" }  → email enviado vía API
 *   - { ok: true,            mode: "dev"  }  → wrapper degrada a console.log (sin API key)
 *   - { ok: false, error: "...", mode: ... }  → algo falló
 *
 * Si el send es exitoso y NODE_ENV=production, revisar el inbox del destinatario
 * y el dashboard de Resend → Logs → confirmar status = "delivered".
 *
 * Override de destinatario vía env: SMOKE_RESEND_TO="otro@email.com"
 */

import { sendEmail } from "../src/lib/email/resend-client.ts";

const to = process.env.SMOKE_RESEND_TO ?? "david17891@gmail.com";
const isProd = process.env.NODE_ENV === "production";

const result = await sendEmail({
  to,
  subject: `Qlick · Resend smoke test (${isProd ? "prod" : "dev"} mode)`,
  html: `<!doctype html>
<html><body style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 2rem auto; color: #222;">
  <h2 style="color: #AB3FEA;">Resend está vivo</h2>
  <p>Hola — si ves este email en tu inbox, el wrapper de Resend está mandando emails
     de verdad a través de la API. Si lo estás leyendo en consola, está degradando a
     dev mode (sin <code>RESEND_API_KEY</code>).</p>
  <hr>
  <p style="font-size: 0.85em; color: #666;">
    Enviado: ${new Date().toISOString()}<br>
    From: ${process.env.RESEND_FROM_ADDRESS ?? "(no configurado)"}<br>
    Mode esperado: ${isProd ? "prod" : "dev"}<br>
    Para volver a este smoke test: <code>node --experimental-strip-types scripts/smoke-resend.mjs</code>
  </p>
</body></html>`,
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
