// Append bug 12 documentation to PROJECT-LOG.md
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const LOG_PATH = join(ROOT, "data/PROJECT-LOG.md");

if (!existsSync(LOG_PATH)) {
  console.error("PROJECT-LOG.md no existe en", LOG_PATH);
  process.exit(1);
}

const content = readFileSync(LOG_PATH, "utf-8");

const APPEND = `

### Bug 12: tras pagar con tarjeta, redirige a /dashboard (como si fuera curso)

David reporto que despues de pagar con tarjeta el evento Marketing + IA
para Emprendedores ($1000 MXN), era redirigido a /dashboard, como si
se hubiera inscripto al curso. El CheckoutButton del evento YA mandaba
los successUrl/cancelUrl correctos en el body al endpoint, pero el
endpoint los IGNORABA.

**Causa raiz:**

\`/api/payments/create-checkout\` (route.ts, lineas 213-216 antes
del fix) armaba sus PROPIAS success/cancel/pending URLs usando
\`\${requestOrigin}/pagar/\${productRef.slug}/exito\`. Para un evento
con slug \`marketing-ia-para-emprendedores-pago\`, eso generaba
\`\${origin}/pagar/marketing-ia-para-emprendedores-pago/exito\` — que
matchea la pagina de exito del CURSO (\`/pagar/[courseSlug]/exito/page.tsx\`),
NO la del evento (\`/pagar/evento/[slug]/exito/page.tsx\`).

La pagina de exito del CURSO, al no encontrar el slug como curso
(porque era un evento, no un curso), ejecutaba \`redirect("/dashboard")\`
o, si el webhook habia grant con la tabla \`payments\` legacy de cursos,
veia \`accessActive=true\` y mostraba "Ir al dashboard" con
\`ctaHref="/dashboard?paid=ok"\`.

**Cadena del bug:**

1. David paga con tarjeta el evento.
2. Endpoint arma successUrl = \`/pagar/marketing-ia-.../exito\` (ruta CURSO).
3. Stripe redirige ahi.
4. \`/pagar/[courseSlug]/exito\` no encuentra curso con ese slug.
5. O bien \`redirect("/dashboard")\` directo, o bien ve \`accessActive=true\`
   (grant del webhook en tabla payments legacy) y dice "Ir al dashboard".

**Fix (route.ts):**

El endpoint ahora:
1. Acepta \`successUrl\`/\`cancelUrl\`/\`pendingUrl\` del body con
   validacion (URL absoluta + mismo origin del request; defense vs
   open redirect).
2. Si el cliente no las manda, arma el default con el prefijo correcto
   segun \`productKind\`:
   - event → \`/pagar/evento/[slug]/exito\`
   - course → \`/pagar/[slug]/exito\`

**Refactor:**

Helper \`resolveCheckoutUrl\` extraido a
\`src/lib/payments/checkout-url-resolver.ts\` para poder testearlo
sin levantar \`next/server\`. Exporta la funcion pura con
\`unknown\` (input) + \`string\` (default) + \`string\` (origin) + \`string\` (field name).

**Tests (\`tests/api-payments-create-checkout.test.mjs\`):**

9 tests cubriendo:
- URL undefined/null/empty → usa default.
- URL valida del mismo origin → se respeta.
- URL de otro origin → se descarta (defense vs open redirect).
- URL invalida (no-URL string) → se descarta.
- URL relativa → se descarta.
- Armado de default URL por productKind (event vs course).

**Verificacion:**

- type-check OK.
- lint OK.
- 1417/1417 tests pasan.
- POST \`/api/payments/create-checkout\` con \`productKind=event\` retorna
  200 con \`redirectUrl\` de Stripe (test E2E real con tarjeta 4242
  requiere Playwright/browser automation; el unit test del helper
  cubre la logica critica).
- Deploy: \`qlick-9gq2lx9ml\` ready (commit \`84dd09e\`).

**Archivos tocados:**

- \`src/lib/payments/checkout-url-resolver.ts\` — helper nuevo.
- \`src/app/api/payments/create-checkout/route.ts\` — usar helper +
  default con prefijo correcto por productKind.
- \`tests/api-payments-create-checkout.test.mjs\` — 9 tests del helper.

Commit: \`84dd09e fix(checkout): create-checkout respeta successUrl/cancelUrl del body + default por productKind\`.

**Proximo paso:**

David prueba el flow completo desde el celular: ir a
\`/pagar/evento/marketing-ia-para-emprendedores-pago\`, pagar con tarjeta
4242 4242 4242 4242, y verificar que redirige a
\`/pagar/evento/marketing-ia-para-emprendedores-pago/exito?session_id=cs_test_...\`
(en vez de \`/dashboard\`). El copy de la pagina de exito del evento
dice "Listo! Ya tienes tu entrada" con CTA "Ver el evento".
`;

const updated = content + APPEND;
writeFileSync(LOG_PATH, updated, "utf-8");
console.log("Appended bug 12 to PROJECT-LOG.md");
