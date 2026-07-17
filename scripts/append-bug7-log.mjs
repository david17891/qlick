// Append sprint entry a data/PROJECT-LOG.md (idempotente via marker).
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const path = join(ROOT, "data", "PROJECT-LOG.md");
if (!existsSync(path)) {
  console.error("PROJECT-LOG.md no encontrado");
  process.exit(1);
}
const text = readFileSync(path, "utf8");
const marker = "## 2026-07-17 05:50";
if (text.includes(marker)) {
  console.log("entry ya existe, no append");
  process.exit(0);
}
const NL = text.includes("\r\n") ? "\r\n" : "\n";
const entry = `${NL}## 2026-07-17 05:50 \u2014 Bug 7: checkout de evento redirigia a flow de curso${NL}${NL}### TL;DR${NL}El \`CheckoutButton.tsx\` del evento NO pasaba \`successUrl\` ni \`cancelUrl\` al${NL}\`/api/payments/create-checkout\`. El provider usaba el default${NL}\`${"${slug}"}/exito\` que apuntaba a \`/pagar/[courseSlug]/exito\` (ruta de CURSO,${NL}no evento). Stripe redirigia al flow de curso, que mandaba al usuario${NL}a \`/dashboard?paid=ok\`. Pagaba por un evento, lo trataba como curso.${NL}${NL}### Diagnostico${NL}${NL}1. David reporto: despues de pagar con tarjeta, lo mandaba a /dashboard.${NL}2. El default del provider (\`src/lib/payments/stripe-provider.ts:140\`) usa${NL}   \`${"${slug}"}/exito\` que es la ruta de CURSO.${NL}3. El page.tsx de curso (\`src/app/pagar/[courseSlug]/exito/page.tsx:117\`) en${NL}   su branch principal redirige a \`/dashboard?paid=ok\`.${NL}4. \`CheckoutButton.tsx\` del evento (\`src/app/pagar/evento/[slug]/CheckoutButton.tsx:65-71\`)${NL}   NO pasaba successUrl ni cancelUrl.${NL}${NL}### Fix${NL}${NL}\`src/app/pagar/evento/[slug]/CheckoutButton.tsx\`: ahora pasa URLs explicitas${NL}que apuntan a la pagina de exito del EVENTO:${NL}${NL}\`\`\`js${NL}successUrl: \`${"${baseUrl}"}/pagar/evento/${"${eventSlug}"}/exito?session_id={CHECKOUT_SESSION_ID}\`,${NL}cancelUrl: \`${"${baseUrl}"}/pagar/evento/${"${eventSlug}"}/cancelled=1\`,${NL}\`\`\`${NL}${NL}Commit: \`c09b201 fix(checkout): event CheckoutButton pasa successUrl/cancelUrl correctos\`.${NL}${NL}### Credenciales de git (manual)${NL}${NL}David se quejo de que mis commits aparecian como "GitHub user not found"${NL}con author \`bot@qlick.digital\`. Causa: estaba usando${NL}\`git -c user.email=bot@qlick.digital -c user.name=Mavis commit ...\` que${NL}SOBREESCRIBE la config global de git de David.${NL}${NL}Regla preventiva: NUNCA usar \`-c user.name\` ni \`-c user.email\` en commits.${NL}La config global tiene los datos correctos. Verificar antes de commit con${NL}\`git config --get user.name && git config --get user.email\`.${NL}${NL}Commit \`c09b201\` ya uso la config global: aparece como${NL}\`David A. <41293320+david17891@users.noreply.github.com>\`.${NL}`;
writeFileSync(path, text + entry, "utf8");
console.log("entry appendada");
