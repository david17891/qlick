// Append bug 20 entry al PROJECT-LOG (append-only).
import { readFileSync, writeFileSync } from "node:fs";

const path = "C:\\Users\\User\\Documents\\Click\\data\\PROJECT-LOG.md";
const current = readFileSync(path, "utf8");

const entry = `

---

## 2026-07-18 — Bug 20: link de pago sin confirmation_id pierde atribución del cargo

**Síntoma (David 2026-07-18 probando V4 con segundo número, modo
super_executive):** El link de pago que el bot manda en el chat
después del registro es genérico
(\`https://qlick.digital/pagar/evento/[slug]\`), sin
identificador del cliente. Si el cliente abre el link y paga con
un email DIFERENTE al de la confirmation del bot (caso típico:
esposa/secretario paga con su email), el webhook de Stripe busca
la confirmation por email y crea una NUEVA (no linkea a la del
bot). Resultado: el cargo queda atribuido a OTRA confirmation, la
del bot queda como "no pagó", y el cliente dirá "yo pagué" sin
que sepamos a quién.

David lo señaló como bloqueante para pagos reales: "estamos
planeando para pagos reales, hay que hacer que coincidan porque
si no, vamos a perder los datos, el cliente dirá que pago y no
sabremos que cliente pago".

**Causa raíz:**

El link de pago en el bot NO incluye \`?confirmation=<id>\` en
los paths principales (\`provide_name\` con implicit_capture y
\`provide_email\`). El webhook de Stripe usa
\`ensureEventConfirmation\` que busca por email del customer
(puede no coincidir con el email de la confirmation del bot).
La atribución se rompe.

**Fix aplicado (5 archivos):**

1. \`src/lib/payments/payment-provider.ts\`: agregada prop opcional
   \`confirmationId?: string\` a \`CreateCheckoutInput\`.
2. \`src/lib/payments/stripe-provider.ts\`: si \`input.confirmationId\`
   está presente, lo serializa a \`metadata.confirmation_id\` en
   el Checkout Session de Stripe.
3. \`src/app/api/payments/create-checkout/route.ts\`: acepta
   \`confirmationId\` en el body, lo pasa al \`provider.createCheckout\`.
4. \`src/app/api/webhooks/stripe/route.ts\`: lee
   \`session.metadata.confirmation_id\` PRIMERO. Si existe, lo usa
   directamente sin pasar por \`ensureEventConfirmation\`. Si no,
   fallback al comportamiento legacy (búsqueda por email). Esto
   rompe la dependencia del email del customer para la atribución.
5. \`src/app/pagar/evento/[slug]/page.tsx\` + \`CheckoutButton.tsx\`:
   la página lee \`?confirmation=xxx\` de searchParams, lo valida
   contra \`event_confirmations\` (UUID + event_id match), y lo
   pasa al CheckoutButton. El button lo incluye en el body del
   fetch. La página también muestra un hint con el email de la
   confirmation para que el cliente sepa qué email se usará.

**Verificación del fix:**

Una vez deployado:
- Link con \`?confirmation=xxx\` (bot con implicit_capture o
  link manual): el cargo se atribuye via
  \`metadata.confirmation_id\` (100% confiable).
- Link sin \`?confirmation=xxx\` (genérico): el cargo se atribuye
  via email del customer (comportamiento legacy, fix bug 13).
- Página de pago muestra hint del email de la confirmation si
  está disponible.
- Si el cliente abre el link con confirmation y paga con OTRO
  email en Stripe, el cargo IGUAL se atribuye correctamente
  (via confirmation_id, no email).

**Sprint futuro (NO este commit):**

- El bot engine debe pasar \`?confirmation=<id>\` en TODOS los
  paths de link de pago (no solo el \`pending_payment\` que ya
  lo tiene). Requiere refactor del flow de creación de
  confirmation para tener el id antes de construir el link.

**Commit:** \`fix(payments): atribucion de cargo por metadata.confirmation_id\`
`;

writeFileSync(path, current + entry, "utf8");
console.log("Appended bug 20 entry. New size:", (current + entry).length, "chars");
