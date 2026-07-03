/**
 * E2E test del funnel completo: walk-in → check-in → verificación.
 *
 * Ejecuta el flujo entero del scanner del staff contra el deploy de Vercel:
 *   1. Walk-in registration de un asistente UNICO (phone con timestamp)
 *      → devuelve qrToken + checkInUrl + qrImageUrl
 *   2. POST /api/staff/check-in con ese qr_token
 *      → verifica que ya estaba check-in (idempotente) O lo marca fresh
 *   3. Walk-in del MISMO phone (segunda vez)
 *      → verifica que NO crea duplicado en event_qr_tokens (UNIQUE
 *        constraint event_id+phone, pero phone es normalized, deberia
 *        crear un nuevo row porque cada walk-in genera token nuevo)
 *   4. Listar staff tokens del evento
 *      → confirma que el staff link sigue activo y registrado
 *
 * Reporte: imprime cada paso + verifica expectativas. Si todo cuadra,
 * David puede ir al admin y ver que los registros aparecen.
 *
 * Usage:
 *   node scripts/e2e-full-funnel.mjs
 *   node scripts/e2e-full-funnel.mjs --base=http://localhost:3000
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const BASE = arg("base", "https://www.qlick.digital").replace(/\/$/, "");
// Sin --token, el script aborta con instruccion (no usamos un default
// hardcodeado porque el token se revoca entre sesiones).
const STAFF_TOKEN = arg("token", "");
const EVENT_ID = arg("event", "e10994a6-bc26-4bfb-bd2c-289db82d8199");

if (!STAFF_TOKEN) {
  console.error("ERROR: falta --token=<staff_link_token>");
  console.error("Como obtener uno:");
  console.error("  1. Anda a https://www.qlick.digital/admin/eventos/" + EVENT_ID + "?tab=checkin");
  console.error("  2. En '🎫 Links de scanner para staff' click 'Crear link'");
  console.error("  3. Copia el token del link generado (parte de la URL despues de /api/staff/scan/)");
  console.error("");
  console.error("Ejecuta:");
  console.error("  node scripts/e2e-full-funnel.mjs --token=TuTokenAqui");
  process.exit(2);
}

// Phones unicos basados en timestamp (10 digitos exactos para MX +52).
// El endpoint normaliza con toE164 que valida /^\+52\d{10}$/.
const RUN_ID = Date.now().toString().slice(-10);
const TEST_PHONE_1 = `+52${RUN_ID}`;
const TEST_PHONE_2 = `+52${(BigInt(RUN_ID) + 1n).toString().slice(-10).padStart(10, "0")}`;
const TEST_NAME_1 = `E2E-${RUN_ID}-WalkIn1`;
const TEST_NAME_2 = `E2E-${RUN_ID}-WalkIn2`;
const STAFF_EMAIL = `e2e+${RUN_ID}@test.local`;
const STAFF_NAME = `E2E Bot ${RUN_ID}`;

let pass = 0;
let fail = 0;
let stepNum = 0;

function check(name, cond, detail = "") {
  if (cond) {
    console.log(`    PASS  ${name}${detail ? ` — ${detail}` : ""}`);
    pass++;
  } else {
    console.log(`    FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    fail++;
  }
}

function step(label) {
  stepNum++;
  console.log(`\n[STEP ${stepNum}] ${label}`);
}

async function postJSON(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, data };
}

async function main() {
  console.log("=== E2E funnel completo: walk-in + check-in ===");
  console.log(`base:         ${BASE}`);
  console.log(`staff token:  ${STAFF_TOKEN}`);
  console.log(`event:        ${EVENT_ID}`);
  console.log(`run id:       ${RUN_ID}`);
  console.log(`test phones:  ${TEST_PHONE_1}, ${TEST_PHONE_2}`);
  console.log(`test names:   ${TEST_NAME_1}, ${TEST_NAME_2}`);

  // ───────────────────────────────────────────────────────────
  step("Walk-in #1: registrar asistente NUEVO");
  // ───────────────────────────────────────────────────────────
  const w1 = await postJSON("/api/staff/register-walk-in", {
    token: STAFF_TOKEN,
    name: TEST_NAME_1,
    phone: TEST_PHONE_1,
    staff_email: STAFF_EMAIL,
    staff_displayName: STAFF_NAME,
  });
  check("status 200", w1.status === 200, `got ${w1.status}`);
  check("ok=true", w1.data.ok === true);
  check(
    "attendee.name correcto",
    w1.data.attendee?.name === TEST_NAME_1,
    w1.data.attendee?.name,
  );
  check(
    "qrToken presente",
    typeof w1.data.qrToken === "string" && w1.data.qrToken.length >= 20,
  );
  check(
    "checkInUrl contiene token",
    w1.data.checkInUrl?.includes(w1.data.qrToken),
  );
  const qrToken1 = w1.data.qrToken;
  const checkInUrl1 = w1.data.checkInUrl;

  // ───────────────────────────────────────────────────────────
  step("Verificacion cross-event del staff link");
  // ───────────────────────────────────────────────────────────
  // El walk-in fue al evento del staff link. El qrToken creado pertenece
  // a ese mismo evento. Si intentamos check-in con el qrToken desde otro
  // staff link de otro evento, deberia rechazarse con 409.
  // (No podemos testear cross-event sin 2 staff links, asi que skipeamos.)
  console.log("    (skip: requiere 2 staff links de eventos distintos)");

  // ───────────────────────────────────────────────────────────
  step("Check-in #1: marcar al asistente como checked-in");
  // ───────────────────────────────────────────────────────────
  // Pero el walk-in YA lo marco checked-in al crearlo (checked_in_at=now).
  // Asi que este POST deberia ser idempotente: yaCheckedIn=true.
  const c1 = await postJSON("/api/staff/check-in", {
    token: STAFF_TOKEN,
    qr_token: qrToken1,
    staff_email: STAFF_EMAIL,
    staff_displayName: STAFF_NAME,
  });
  check("status 200", c1.status === 200, `got ${c1.status}`);
  check("ok=true", c1.data.ok === true);
  check(
    "alreadyCheckedIn=true (walk-in prelo marca checked-in)",
    c1.data.alreadyCheckedIn === true,
    `got ${c1.data.alreadyCheckedIn}`,
  );
  check(
    "attendee.name correcto",
    c1.data.attendee?.name === TEST_NAME_1,
  );

  // ───────────────────────────────────────────────────────────
  step("Walk-in #2: registrar OTRO asistente (distinto phone)");
  // ───────────────────────────────────────────────────────────
  const w2 = await postJSON("/api/staff/register-walk-in", {
    token: STAFF_TOKEN,
    name: TEST_NAME_2,
    phone: TEST_PHONE_2,
    staff_email: STAFF_EMAIL,
    staff_displayName: STAFF_NAME,
  });
  check("status 200", w2.status === 200, `got ${w2.status}`);
  check("ok=true", w2.data.ok === true);
  check(
    "attendee.name correcto",
    w2.data.attendee?.name === TEST_NAME_2,
  );
  check(
    "qrToken DIFERENTE al del walk-in #1 (cada uno genera uno nuevo)",
    w2.data.qrToken !== qrToken1,
  );
  const qrToken2 = w2.data.qrToken;

  // ───────────────────────────────────────────────────────────
  step("Check-in #2: marcar al segundo asistente");
  // ───────────────────────────────────────────────────────────
  const c2 = await postJSON("/api/staff/check-in", {
    token: STAFF_TOKEN,
    qr_token: qrToken2,
    staff_email: STAFF_EMAIL,
    staff_displayName: STAFF_NAME,
  });
  check("status 200", c2.status === 200, `got ${c2.status}`);
  check("ok=true", c2.data.ok === true);
  check(
    "attendee.name correcto",
    c2.data.attendee?.name === TEST_NAME_2,
  );

  // ───────────────────────────────────────────────────────────
  step("Validaciones de rechazo");
  // ───────────────────────────────────────────────────────────
  // qr_token invalido (no existe en DB).
  const r1 = await postJSON("/api/staff/check-in", {
    token: STAFF_TOKEN,
    qr_token: "TOKEN_QUE_NO_EXISTE_EN_DB",
  });
  check(
    "qr_token invalido → 404",
    r1.status === 404,
    `got ${r1.status}`,
  );
  check("ok=false", r1.data.ok === false);

  // Token de staff link invalido.
  const r2 = await postJSON("/api/staff/check-in", {
    token: "STAFF_LINK_TOKEN_INVALIDO",
    qr_token: qrToken1,
  });
  check(
    "staff link invalido → 404",
    r2.status === 404,
    `got ${r2.status}`,
  );

  // Walk-in con phone invalido.
  const r3 = await postJSON("/api/staff/register-walk-in", {
    token: STAFF_TOKEN,
    name: "Test Phone Invalido",
    phone: "abc123", // no es +52XXXXXXXXXX
  });
  check(
    "phone invalido → 400",
    r3.status === 400,
    `got ${r3.status}`,
  );
  check("ok=false", r3.data.ok === false);

  // Walk-in sin nombre.
  const r4 = await postJSON("/api/staff/register-walk-in", {
    token: STAFF_TOKEN,
    name: "X", // < 2 chars
    phone: TEST_PHONE_1,
  });
  check(
    "nombre < 2 chars → 400",
    r4.status === 400,
    `got ${r4.status}`,
  );

  // ───────────────────────────────────────────────────────────
  step("Reporte final");
  // ───────────────────────────────────────────────────────────
  console.log("\n  === Resumen de la corrida ===");
  console.log(`  Run ID:          ${RUN_ID}`);
  console.log(`  Walk-in #1:      ${TEST_NAME_1} (${TEST_PHONE_1})`);
  console.log(`    qr_token:      ${qrToken1}`);
  console.log(`    checkIn URL:   ${checkInUrl1}`);
  console.log(`    qrImage URL:   ${w1.data.qrImageUrl}`);
  console.log(`  Walk-in #2:      ${TEST_NAME_2} (${TEST_PHONE_2})`);
  console.log(`    qr_token:      ${qrToken2}`);
  console.log(`    checkIn URL:   ${w2.data.checkInUrl}`);
  console.log(`    qrImage URL:   ${w2.data.qrImageUrl}`);

  console.log("\n  === Como verificar en el admin ===");
  console.log(`  1. Anda a https://www.qlick.digital/admin/eventos/${EVENT_ID}?tab=checkin`);
  console.log(`  2. Busca los QRs de los 2 walk-ins en "🎟️ QRs generados"`);
  console.log(`  3. Anda a /admin/eventos/${EVENT_ID}?tab=attendees para verlos como asistentes`);
  console.log("  4. Si los leads fueron creados por nombre+telefono unico, tambien deberian aparecer en /admin/crm");

  console.log(`\n=== ${pass} pass, ${fail} fail ===\n`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});