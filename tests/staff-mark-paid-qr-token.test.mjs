/**
 * REGRESION 2026-07-16 (sprint cobro-en-puerta, sesion David "la
 * persona que cobra debe poder actualizar, que en efecto pago en
 * efectivo en ese momento").
 *
 * Cubre 2 problemas del endpoint /api/staff/check-in/mark-paid:
 *
 *   1. El endpoint requeria `requireAdmin` (sesion admin), pero el
 *      scanner del staff es PUBLICO (no login). Resultado: el staff
 *      en puerta veia el banner "No admin session" en rojo y no
 *      podia cobrar. FIX: el endpoint ahora acepta auth=admin
 *      (back-compat con el panel admin) o auth=qr_token (nuevo
 *      path del scanner publico). Si ninguno, 401. Si qr_token
 *      no existe o expiro, 403. Si qr_token y confirmation son
 *      de eventos distintos, 403 (defense in depth).
 *
 *   2. El body del POST no aceptaba `qr_token` ni `staff_email`,
 *      asi que el scanner publico no tenia como autorizarse.
 *
 * Tests:
 *   - Estaticos (regex match en el source): verifican que el codigo
 *     del endpoint tiene el path de auth=qr_token (defensa contra
 *     regresion del fix).
 *   - No testean el endpoint end-to-end (eso requiere next dev /
 *     runtime de Next.js, fuera del scope de node:test).
 *
 * Si en el futuro se monta un test runner con next dev (Playwright
 * E2E o similar), este test se reemplaza por uno de integracion.
 *
 * Privacy: 0 PII.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// @ts-check

const ROUTE_PATH = path.resolve(
  "C:/Users/User/Documents/Click/src/app/api/staff/check-in/mark-paid/route.ts"
);

function readRoute() {
  return fs.readFileSync(ROUTE_PATH, "utf8");
}

test("REGRESION cobro-en-puerta: endpoint acepta auth=qr_token (scanner publico)", () => {
  const src = readRoute();
  // El endpoint debe leer qr_token del body.
  assert.match(
    src,
    /qr_token\?:\s*string/,
    "el body del endpoint debe aceptar qr_token opcional"
  );
  // El endpoint debe validar el qr_token contra event_qr_tokens.
  assert.match(
    src,
    /from\("event_qr_tokens"\)[\s\S]{0,200}\.eq\("token"/,
    "el endpoint debe validar qr_token contra event_qr_tokens (tabla + query)"
  );
  // El endpoint debe verificar expiracion del token.
  assert.match(
    src,
    /expires_at/,
    "el endpoint debe verificar expires_at del qr_token"
  );
  // Si qr_token y confirmation son de eventos distintos, 403.
  assert.match(
    src,
    /eventos distintos/,
    "el endpoint debe rechazar si qr_token y confirmation son de eventos distintos"
  );
  // El endpoint debe usar actorEmail (no admin.email) en audit log
  // para que el path del scanner publique el actor correctamente.
  assert.match(
    src,
    /actor_email:\s*actorEmail/,
    "el endpoint debe usar actorEmail (no admin.email) en audit log"
  );
});

test("REGRESION cobro-en-puerta: endpoint rechaza 401 sin admin NI qr_token", () => {
  const src = readRoute();
  // Cuando auth=qr_token y no hay qr_token en el body, 401.
  assert.match(
    src,
    /qr_token[\s\S]{0,400}No hay sesión[\s\S]{0,200}401|Falta `qr_token`/,
    "el endpoint debe retornar 401 cuando no hay admin session ni qr_token en el body"
  );
});

test("REGRESION cobro-en-puerta: back-compat con admin session (panel admin)", () => {
  const src = readRoute();
  // El path admin debe seguir funcionando (back-compat).
  assert.match(
    src,
    /admin\.email/,
    "el endpoint debe seguir extrayendo admin.email para el path admin (back-compat)"
  );
  assert.match(
    src,
    /authSource\s*=\s*"admin"/,
    "el endpoint debe marcar authSource='admin' cuando hay admin session"
  );
  assert.match(
    src,
    /authSource\s*=\s*"qr_token"/,
    "el endpoint debe marcar authSource='qr_token' cuando no hay admin session"
  );
});

test("REGRESION cobro-en-puerta: el componente MarkPaidAction pasa qr_token al endpoint", () => {
  const SCANNER_PATH = path.resolve(
    "C:/Users/User/Documents/Click/src/app/staff/scan/[eventId]/page.tsx"
  );
  const src = fs.readFileSync(SCANNER_PATH, "utf8");
  // El componente debe aceptar qrToken como prop.
  assert.match(
    src,
    /MarkPaidAction[\s\S]{0,300}qrToken/,
    "MarkPaidAction debe recibir qrToken como prop"
  );
  // El fetch debe incluir qr_token en el body.
  assert.match(
    src,
    /qr_token:\s*qrToken/,
    "MarkPaidAction debe mandar qr_token en el body del fetch"
  );
  // El scanner debe guardar el último qr_token en un ref.
  assert.match(
    src,
    /lastQrTokenRef/,
    "el scanner debe guardar el último qr_token en un ref para pasarlo al MarkPaidAction"
  );
});

test("REGRESION cobro-en-puerta: el scanner tiene un QR desplegable apuntando a /pagar/evento/[slug]", () => {
  const SCANNER_PATH = path.resolve(
    "C:/Users/User/Documents/Click/src/app/staff/scan/[eventId]/page.tsx"
  );
  const src = fs.readFileSync(SCANNER_PATH, "utf8");
  // El scanner debe tener un bloque CheckoutQrBlock o equivalente.
  assert.match(
    src,
    /CheckoutQrBlock/,
    "el scanner debe tener un componente CheckoutQrBlock"
  );
  // El componente debe usar la lib qrcode (ya en package.json).
  // Puede ser static import o dynamic import (para bundle splitting).
  assert.match(
    src,
    /import\(["']qrcode["']\)|from\s+["']qrcode["']/,
    "el componente debe importar la lib qrcode (static o dynamic import)"
  );
  // El link debe apuntar a /pagar/evento/[slug] (público).
  assert.match(
    src,
    /\/pagar\/evento\/\$\{eventSlug\}/,
    "el QR debe apuntar a /pagar/evento/[eventSlug] (pago público del evento)"
  );
  // El componente debe ser desplegable (details/summary).
  assert.match(
    src,
    /<details[\s\S]{0,800}<summary/,
    "el QR debe estar dentro de un <details> (desplegable)"
  );
});
