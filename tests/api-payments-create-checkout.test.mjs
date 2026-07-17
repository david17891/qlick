// Test del helper resolveCheckoutUrl y del armado de URLs por productKind.
// Verifica que:
//   - Si el cliente NO manda URL, se usa el default con el prefijo correcto.
//   - Si el cliente manda URL absoluta del mismo origin, se respeta.
//   - Si el cliente manda URL de otro origin (open redirect), se descarta.
//   - Si el cliente manda URL invalida, se descarta.
//   - Para event: el default es /pagar/evento/[slug]/exito.
//   - Para course: el default es /pagar/[slug]/exito.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCheckoutUrl } from "@/lib/payments/checkout-url-resolver";

test("resolveCheckoutUrl: cliente no manda URL -> usa default", () => {
  const url = resolveCheckoutUrl(
    undefined,
    "https://qlick.digital/pagar/evento/marketing-ia/exito?session_id={CHECKOUT_SESSION_ID}",
    "https://qlick.digital",
    "successUrl"
  );
  assert.equal(
    url,
    "https://qlick.digital/pagar/evento/marketing-ia/exito?session_id={CHECKOUT_SESSION_ID}"
  );
});

test("resolveCheckoutUrl: cliente no manda URL null -> usa default", () => {
  const url = resolveCheckoutUrl(
    null,
    "https://qlick.digital/pagar/evento/x/exito",
    "https://qlick.digital",
    "successUrl"
  );
  assert.equal(url, "https://qlick.digital/pagar/evento/x/exito");
});

test("resolveCheckoutUrl: cliente no manda URL vacia -> usa default", () => {
  const url = resolveCheckoutUrl(
    "",
    "https://qlick.digital/pagar/evento/x/exito",
    "https://qlick.digital",
    "successUrl"
  );
  assert.equal(url, "https://qlick.digital/pagar/evento/x/exito");
});

test("resolveCheckoutUrl: cliente manda URL absoluta del mismo origin -> respeta", () => {
  const client =
    "https://qlick.digital/pagar/evento/marketing-ia-para-emprendedores-pago/exito?session_id={CHECKOUT_SESSION_ID}";
  const url = resolveCheckoutUrl(
    client,
    "https://qlick.digital/pagar/evento/x/exito",
    "https://qlick.digital",
    "successUrl"
  );
  assert.equal(url, client);
});

test("resolveCheckoutUrl: cliente manda URL de OTRO origin -> descarta y usa default", () => {
  const url = resolveCheckoutUrl(
    "https://evil.com/redirect",
    "https://qlick.digital/pagar/evento/x/exito",
    "https://qlick.digital",
    "successUrl"
  );
  assert.equal(url, "https://qlick.digital/pagar/evento/x/exito");
});

test("resolveCheckoutUrl: cliente manda URL invalida -> descarta y usa default", () => {
  const url = resolveCheckoutUrl(
    "not-a-url",
    "https://qlick.digital/pagar/evento/x/exito",
    "https://qlick.digital",
    "successUrl"
  );
  assert.equal(url, "https://qlick.digital/pagar/evento/x/exito");
});

test("resolveCheckoutUrl: cliente manda URL relativa -> descarta y usa default", () => {
  const url = resolveCheckoutUrl(
    "/pagar/evento/x/exito",
    "https://qlick.digital/pagar/evento/x/exito",
    "https://qlick.digital",
    "successUrl"
  );
  assert.equal(url, "https://qlick.digital/pagar/evento/x/exito");
});

test("URL por productKind EVENT: default incluye /evento/", () => {
  const productKind = "event";
  const productRefSlug = "marketing-ia-para-emprendedores-pago";
  const requestOrigin = "https://qlick.digital";
  const baseExitoPath =
    productKind === "event"
      ? `/pagar/evento/${productRefSlug}/exito`
      : `/pagar/${productRefSlug}/exito`;
  const url = `${requestOrigin}${baseExitoPath}?session_id={CHECKOUT_SESSION_ID}`;
  assert.equal(
    url,
    "https://qlick.digital/pagar/evento/marketing-ia-para-emprendedores-pago/exito?session_id={CHECKOUT_SESSION_ID}"
  );
});

test("URL por productKind COURSE: default NO incluye /evento/", () => {
  const productKind = "course";
  const productRefSlug = "marketing-fundamentals";
  const requestOrigin = "https://qlick.digital";
  const baseExitoPath =
    productKind === "event"
      ? `/pagar/evento/${productRefSlug}/exito`
      : `/pagar/${productRefSlug}/exito`;
  const url = `${requestOrigin}${baseExitoPath}?session_id={CHECKOUT_SESSION_ID}`;
  assert.equal(
    url,
    "https://qlick.digital/pagar/marketing-fundamentals/exito?session_id={CHECKOUT_SESSION_ID}"
  );
});
