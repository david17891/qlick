import assert from "node:assert/strict";
import test from "node:test";
import { getCertQrUrl } from "../src/lib/certificates/qr-helper.ts";

test("el QR del certificado abre la frase de marca de Qlick", () => {
  const previousBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  delete process.env.NEXT_PUBLIC_BASE_URL;

  try {
    assert.equal(getCertQrUrl(), "https://qlick.digital/filosofia");
  } finally {
    if (previousBaseUrl === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = previousBaseUrl;
  }
});

test("el QR respeta el dominio público configurado y siempre conserva /filosofia", () => {
  const previousBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  process.env.NEXT_PUBLIC_BASE_URL = "https://preview.qlick.digital/";

  try {
    assert.equal(getCertQrUrl(), "https://preview.qlick.digital/filosofia");
  } finally {
    if (previousBaseUrl === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = previousBaseUrl;
  }
});
