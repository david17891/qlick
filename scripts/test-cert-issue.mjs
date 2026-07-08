#!/usr/bin/env node
/**
 * test-cert-issue — Smoke test E2E del endpoint de certificados.
 *
 * Llama al endpoint HTTP `/api/events/[id]/certificate/[attendeeId]`
 * (admin-authed) sobre un attendee real que tenga check-in, y verifica:
 *   - Response 200 con Content-Type application/pdf.
 *   - El body es un PDF magico (comienza con %PDF-).
 *   - Tamano razonable (>10 KB).
 *
 * REQUISITOS:
 *   1. Migrations aplicadas en Supabase:
 *        - 20260708010000_event_certificates (tabla + RLS)
 *        - 20260708020000_event_certificates_rpc (RPC issue_event_certificate)
 *   2. Dev server corriendo en http://localhost:3000 (o BASE_URL custom).
 *   3. Sesion admin activa — el script espera un cookie de sesion valido
 *      en env var `ADMIN_COOKIE`. Pegar el cookie de una sesion admin en
 *      el browser (DevTools → Application → Cookies → sb-xxx-auth-token).
 *
 * Uso:
 *   ADMIN_COOKIE="sb-prod-auth-token=..." \
 *     EVENT_ID=<uuid> ATTENDEE_ID=<uuid> \
 *     BASE_URL=http://localhost:3000 \
 *     node scripts/test-cert-issue.mjs
 *
 * Output: tmp/cert-test-{eventId}-{attendeeId}.pdf
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL?.trim() || "http://localhost:3000";
const EVENT_ID = process.env.EVENT_ID?.trim();
const ATTENDEE_ID = process.env.ATTENDEE_ID?.trim();
const ADMIN_COOKIE = process.env.ADMIN_COOKIE?.trim();

if (!EVENT_ID || !ATTENDEE_ID) {
  console.error("Faltan EVENT_ID y/o ATTENDEE_ID en env.");
  console.error(
    "Uso: ADMIN_COOKIE=... EVENT_ID=<uuid> ATTENDEE_ID=<uuid> node scripts/test-cert-issue.mjs",
  );
  process.exit(1);
}

if (!ADMIN_COOKIE) {
  console.error(
    "Falta ADMIN_COOKIE. Pegar el cookie sb-*-auth-token del browser (logged in como admin).",
  );
  process.exit(1);
}

const url = `${BASE_URL}/api/events/${EVENT_ID}/certificate/${ATTENDEE_ID}`;
const outPath = join(
  process.cwd(),
  "tmp",
  `cert-test-${EVENT_ID.slice(0, 8)}-${ATTENDEE_ID.slice(0, 8)}.pdf`,
);

async function main() {
  console.log(`>> GET ${url}`);

  const res = await fetch(url, {
    headers: {
      Cookie: ADMIN_COOKIE,
    },
  });

  console.log(`<< HTTP ${res.status} ${res.statusText}`);
  console.log(`   Content-Type: ${res.headers.get("content-type")}`);
  console.log(`   X-Certificate-Folio: ${res.headers.get("x-certificate-folio")}`);
  console.log(
    `   X-Certificate-Already-Issued: ${res.headers.get("x-certificate-already-issued")}`,
  );

  if (res.status !== 200) {
    const body = await res.text();
    console.error("ERROR body:", body.slice(0, 500));
    process.exit(2);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/pdf")) {
    console.error(`ERROR: Content-Type esperado application/pdf, recibio "${ct}"`);
    process.exit(2);
  }

  const buf = Buffer.from(await res.arrayBuffer());

  // PDF magic: empieza con "%PDF-"
  if (!buf.toString("latin1").startsWith("%PDF-")) {
    console.error(`ERROR: el body no parece un PDF (magic %PDF- faltante).`);
    console.error(`       Primeros bytes: ${buf.slice(0, 20).toString("latin1")}`);
    process.exit(2);
  }

  if (buf.length < 10_000) {
    console.error(`WARN: PDF muy chico (${buf.length} bytes). Posible render vacio.`);
  }

  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(outPath, buf);

  console.log(`OK PDF guardado: ${outPath}`);
  console.log(`   Tamano: ${buf.length.toLocaleString("es-MX")} bytes`);
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
