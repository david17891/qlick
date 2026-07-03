/**
 * E2E test del scanner del staff — automatizado contra Vercel.
 *
 * Verifica el flujo completo del scanner:
 *   1. GET /api/staff/scan/[token] (staff link) — debe ser 302 redirect
 *   2. GET /staff/scan/[eventId]?token=... — debe ser 200 con UI del scanner
 *   3. POST /api/staff/register-walk-in — debe crear attendee + check-in
 *   4. POST /api/staff/check-in con qr_token valido (idempotente)
 *   5. POST /api/staff/check-in con qr_token invalido (404 o 410)
 *   6. GET /api/staff/scan/[token-invalido] (404)
 *   7. GET /api/staff/scan/[token-inexistente] (404)
 *   8. GET /staff/scan/[eventId] sin token (muestra error)
 *
 * Usage:
 *   # Usa los defaults (staff token de prueba de David)
 *   node scripts/e2e-staff-scanner.mjs
 *
 *   # O con tu propio staff token + event ID
 *   node scripts/e2e-staff-scanner.mjs --token=Li-xxx --event=e10994a6-xxx
 *
 *   # Cambiar base URL (default: https://www.qlick.digital)
 *   node scripts/e2e-staff-scanner.mjs --base=http://localhost:3000
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const BASE = arg("base", "https://www.qlick.digital").replace(/\/$/, "");
const STAFF_TOKEN = arg("token", "Li-aobyeMBrExExA1cpNbDqvwSxrs5DI");
const EVENT_ID = arg("event", "e10994a6-bc26-4bfb-bd2c-289db82d8199");

// Nombre unico por test para no chocar con datos existentes.
const TEST_TAG = `E2E-${Date.now()}`;

let pass = 0;
let fail = 0;

function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  PASS  ${name}${detail ? ` (${detail})` : ""}`);
    pass++;
  } else {
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ""}`);
    fail++;
  }
}

async function fetchManual(url, opts = {}) {
  return fetch(url, { redirect: "manual", ...opts });
}

async function main() {
  console.log("\n=== E2E scanner staff ===");
  console.log(`base:        ${BASE}`);
  console.log(`staff token: ${STAFF_TOKEN}`);
  console.log(`event ID:    ${EVENT_ID}`);
  console.log(`test tag:    ${TEST_TAG}\n`);

  // ─── Test 1: redirect del staff link ───
  console.log("[1] GET /api/staff/scan/[token] (staff link valido)");
  const r1 = await fetchManual(`${BASE}/api/staff/scan/${STAFF_TOKEN}`);
  check(
    "status 302 (redirect)",
    r1.status === 302,
    `got ${r1.status}`,
  );
  const loc1 = r1.headers.get("location") ?? "";
  check(
    "redirect to /staff/scan/[eventId]?token=...",
    loc1.startsWith(`${BASE}/staff/scan/${EVENT_ID}?token=`),
    `loc: ${loc1.slice(0, 80)}…`,
  );

  // ─── Test 2: pagina del scanner ───
  console.log("\n[2] GET /staff/scan/[eventId]?token=... (pagina scanner)");
  const scanUrl = `${BASE}/staff/scan/${EVENT_ID}?token=${encodeURIComponent(STAFF_TOKEN)}`;
  const r2 = await fetchManual(scanUrl);
  check("status 200", r2.status === 200, `got ${r2.status}`);
  const html2 = await r2.text();
  check(
    "contiene 'Scanner de staff'",
    html2.includes("Scanner de staff"),
  );
  check(
    "contiene boton 'Iniciar camara'",
    html2.includes("Iniciar cámara") || html2.includes("Iniciar camara"),
  );
  check(
    "contiene form walk-in",
    html2.includes("Registrar walk-in"),
  );
  check(
    "contiene input manual fallback",
    html2.includes("Tipear token"),
  );
  check(
    "NO redirige a /admin/login",
    !loc1.includes("/admin/login") &&
      !html2.includes('href="/admin/login'),
  );

  // ─── Test 3: walk-in registration ───
  console.log("\n[3] POST /api/staff/register-walk-in (walk-in valido)");
  const walkInBody = {
    token: STAFF_TOKEN,
    name: `${TEST_TAG} Juan`,
    phone: "5512345678",
    staff_email: "e2e-test@example.com",
    staff_displayName: "E2E Bot",
  };
  const r3 = await fetch(`${BASE}/api/staff/register-walk-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(walkInBody),
  });
  const data3 = await r3.json().catch(() => ({}));
  const walkInOk = r3.status === 200 && data3.ok === true;
  check("status 200 + ok=true", walkInOk, `status=${r3.status} body=${JSON.stringify(data3).slice(0, 150)}`);
  if (walkInOk) {
    check(
      "attendee.name correcto",
      data3.attendee?.name === `${TEST_TAG} Juan`,
    );
    check(
      "qrToken presente (>= 20 chars)",
      typeof data3.qrToken === "string" && data3.qrToken.length >= 20,
    );
    check(
      "checkInUrl apunta a /check-in/",
      data3.checkInUrl?.includes("/check-in/"),
    );
  }
  const walkInQrToken = data3.qrToken;

  // ─── Test 4: idempotencia del check-in ───
  if (walkInQrToken) {
    console.log("\n[4] POST /api/staff/check-in con qr_token del walk-in (idempotente)");
    const r4 = await fetch(`${BASE}/api/staff/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: STAFF_TOKEN,
        qr_token: walkInQrToken,
        staff_email: "e2e-test@example.com",
      }),
    });
    const data4 = await r4.json().catch(() => ({}));
    check("status 200", r4.status === 200);
    check("ok=true", data4.ok === true);
    check(
      "alreadyCheckedIn=true (idempotente)",
      data4.alreadyCheckedIn === true,
    );
  } else {
    console.log("\n[4] SKIP (no walk-in qr_token disponible)");
  }

  // ─── Test 5: qr_token invalido ───
  console.log("\n[5] POST /api/staff/check-in con qr_token invalido");
  const r5 = await fetch(`${BASE}/api/staff/check-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: STAFF_TOKEN,
      qr_token: "INVALIDO12345",
    }),
  });
  const data5 = await r5.json().catch(() => ({}));
  check(
    "status 404 (no encontro qr) o 410 (staff link expirado)",
    r5.status === 404 || r5.status === 410,
    `got ${r5.status}`,
  );
  check("ok=false", data5.ok === false);

  // ─── Test 6: staff link corto (validation error) ───
  console.log("\n[6] GET /api/staff/scan/INVALIDO (staff link corto)");
  const r6 = await fetchManual(`${BASE}/api/staff/scan/INVALIDO12345`);
  check("status 400 (validation) o 404", r6.status === 400 || r6.status === 404, `got ${r6.status}`);

  // ─── Test 7: staff link inexistente (formato valido) ───
  console.log("\n[7] GET /api/staff/scan/[token-inexistente] (formato valido pero no en DB)");
  const r7 = await fetchManual(`${BASE}/api/staff/scan/abcdef01234567890123456789012345`);
  check("status 404 o 410", r7.status === 404 || r7.status === 410, `got ${r7.status}`);

  // ─── Test 8: scanner sin token ───
  console.log("\n[8] GET /staff/scan/[eventId] sin token");
  const r8 = await fetchManual(`${BASE}/staff/scan/${EVENT_ID}`);
  check("status 200 (renderiza con error)", r8.status === 200, `got ${r8.status}`);
  const html8 = await r8.text();
  check(
    "muestra mensaje 'Link no valido'",
    html8.includes("Link no válido") || html8.includes("Link no valido"),
  );

  // ─── Resumen ───
  console.log(`\n=== ${pass} pass, ${fail} fail ===`);
  console.log("Si los fails son por 410 'Staff link revoked' o 'expired',");
  console.log("genera uno nuevo en /admin/eventos/[id]?tab=checkin y");
  console.log("corre: node scripts/e2e-staff-scanner.mjs --token=NuevoToken\n");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});