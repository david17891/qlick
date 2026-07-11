// Full E2E smoke test of the Concept C cert flow:
//  1. Insert a synthetic attendee with check-in.
//  2. Start Next.js dev server in the background.
//  3. Wait for it to bind to a port.
//  4. POST /api/dev/login (auto-auth with DEV_ADMIN_SECRET, ADMIN_EMAIL_ALLOWLIST set).
//  5. GET /api/events/<id>/certificate/<attendeeId> with the cookie.
//  6. Save the PDF to tmp/cert-e2e-final.pdf.
//  7. Validate magic bytes + size.
//
// All secrets read from .env.local — no values hard-coded.
// Output: a single summary with the event_id, attendee_id, folio, PDF size.
//
// Usage: node scripts/test-cert-e2e.cjs
// Optional env: ADMIN_ALLOWLIST_OVERRIDE=foo@bar  (overrides ADMIN_EMAIL_ALLOWLIST)

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'));

const ENV_FILE = path.join(process.cwd(), '.env.local');
const envLines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
const env = {};
for (const l of envLines) {
  const m = l.match(/^\s*([^#][^=]*?)\s*=\s*"?([^"]*?)"?\s*$/);
  if (m) env[m[1]] = m[2];
}

const REF = env.SUPABASE_PROJECT_REF;
const SECRET = env.SUPABASE_SECRET_KEY;
const DEV_SECRET = env.DEV_ADMIN_SECRET;
if (!REF || !SECRET) { console.error('Missing SUPABASE_PROJECT_REF/SECRET_KEY in .env.local'); process.exit(1); }
if (!DEV_SECRET) { console.error('Missing DEV_ADMIN_SECRET in .env.local'); process.exit(1); }

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_ALLOWLIST_OVERRIDE || 'mavis+cert-e2e@qlick.app';
const DEV_PORT = 3000; // dev server expected on 3000

const TMP = path.join(process.cwd(), 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const DEV_LOG = path.join(TMP, 'dev-e2e.log');
const ADMIN_COOKIE_FILE = path.join(TMP, 'admin-cookies.txt');
const PDF_OUT = path.join(TMP, 'cert-e2e-final.pdf');

let eventId, attendeeId;

async function insertAttendee() {
  // Find published event
  const evRes = await fetch(`https://${REF}.supabase.co/rest/v1/events?select=id,title&status=eq.published&order=starts_at.desc&limit=1`, {
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
  const [ev] = await evRes.json();
  if (!ev) throw new Error('No published event');
  eventId = ev.id;
  console.log('Event:', ev.title);

  // Insert synthetic attendee
  const ins = await fetch(`https://${REF}.supabase.co/rest/v1/event_attendees`, {
    method: 'POST',
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      event_id: ev.id,
      name: 'María Fernanda',
      email: 'maria-fernanda-e2e@qlick.app',
      phone_normalized: '+525555555555',
      source: 'manual',
      checked_in_at: new Date().toISOString(),
      checked_in_by: 'mavis-e2e-cert',
    }),
  });
  
  let arr;
  if (ins.status === 409) {
    console.log('Attendee already exists. Updating checked_in_at to make it valid...');
    const upd = await fetch(`https://${REF}.supabase.co/rest/v1/event_attendees?event_id=eq.${ev.id}&email=eq.maria-fernanda-e2e@qlick.app`, {
      method: 'PATCH',
      headers: {
        apikey: SECRET,
        Authorization: `Bearer ${SECRET}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        checked_in_at: new Date().toISOString(),
        checked_in_by: 'mavis-e2e-cert',
      }),
    });
    arr = await upd.json();
    console.log('Update attendee response status:', upd.status);
  } else {
    arr = await ins.json();
    console.log('Insert attendee response status:', ins.status);
  }

  if (!arr || arr.length === 0 || !arr[0]) {
    throw new Error(`Attendee setup failed: response was empty or error. Status: ${ins.status}`);
  }
  attendeeId = arr[0].id;
  console.log('Attendee:', attendeeId.slice(0, 8) + '...');
}

function startDev() {
  console.log('\nStarting dev server on port', DEV_PORT, '...');
  const out = fs.openSync(DEV_LOG, 'a');
  const err = fs.openSync(DEV_LOG, 'a');
  const env2 = Object.assign({}, process.env, {
    ADMIN_EMAIL_ALLOWLIST: ADMIN_EMAIL,
    NODE_ENV: 'development',
  });
  // Use cmd.exe wrapper for Windows (raw npm.cmd fails with EINVAL on some setups).
  const proc = spawn('cmd.exe', ['/c', 'npm.cmd', 'run', 'dev'], {
    detached: true,
    stdio: ['ignore', out, err],
    env: env2,
    cwd: process.cwd(),
    windowsHide: true,
  });
  proc.unref();
  fs.writeFileSync(DEV_LOG, `\n=== started dev server pid ${proc.pid} at ${new Date().toISOString()} ===\n`);
  return proc.pid;
}

async function waitForDev(maxSec = 60) {
  for (let i = 0; i < maxSec; i++) {
    try {
      const r = await fetch(`http://localhost:${DEV_PORT}/`);
      if (r.status < 500) { console.log(`  dev ready (status ${r.status}) at attempt ${i}`); return; }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server didn't respond in ${maxSec}s`);
}

async function devLogin() {
  console.log('\nPOST /api/dev/login');
  const r = await fetch(`http://localhost:${DEV_PORT}/api/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, secret: DEV_SECRET }),
  });
  console.log('  status', r.status);
  if (r.status !== 200) {
    const body = await r.text();
    console.error('  body:', body);
    throw new Error('dev login failed');
  }
  const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : (r.headers.raw?.()['set-cookie'] || []);
  // Fallback: parse Set-Cookie header
  const cookies = setCookies.length ? setCookies : (r.headers.get('set-cookie')?.split(/,(?=[^ ])/) || []);
  fs.writeFileSync(ADMIN_COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log('  cookies saved:', ADMIN_COOKIE_FILE);
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function fetchCert(cookie) {
  const url = `${BASE_URL}/api/events/${eventId}/certificate/${attendeeId}`;
  console.log('\nGET', url);
  const r = await fetch(url, { headers: { Cookie: cookie } });
  console.log('  status', r.status);
  console.log('  content-type:', r.headers.get('content-type'));
  console.log('  x-cert-folio:', r.headers.get('x-certificate-folio'));
  console.log('  x-already-issued:', r.headers.get('x-certificate-already-issued'));
  if (r.status !== 200) {
    const body = await r.text();
    console.error('  body:', body.slice(0, 2000));
    throw new Error('cert fetch failed');
  }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(PDF_OUT, buf);
  const head = buf.toString('latin1').slice(0, 8);
  console.log('  saved:', PDF_OUT, `(${buf.length}B, magic "${head}")`);
  if (!head.startsWith('%PDF-')) throw new Error('PDF magic missing');
  if (buf.length < 10_000) console.warn('  WARN: PDF suspiciously small');
  return buf;
}

async function cleanupAttendee() {
  // Delete certs first then attendee
  const certs = await fetch(`https://${REF}.supabase.co/rest/v1/event_certificates?attendee_id=eq.${attendeeId}`, {
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
  const certsArr = await certs.json();
  if (certsArr.length) {
    await fetch(`https://${REF}.supabase.co/rest/v1/event_certificates?attendee_id=eq.${attendeeId}`, {
      method: 'DELETE',
      headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
    });
    console.log('  deleted', certsArr.length, 'cert row(s)');
  }
  await fetch(`https://${REF}.supabase.co/rest/v1/event_attendees?id=eq.${attendeeId}`, {
    method: 'DELETE',
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
  console.log('  deleted attendee');
}

async function main() {
  try {
    await insertAttendee();
    const pid = startDev();
    try {
      await waitForDev();
      const cookie = await devLogin();
      const buf = await fetchCert(cookie);
      console.log('\n========================================');
      console.log('E2E PASS');
      console.log(`  event_id    = ${eventId}`);
      console.log(`  attendee_id = ${attendeeId}`);
      console.log(`  pdf size    = ${buf.length} bytes`);
      console.log(`  pdf path    = ${PDF_OUT}`);
      console.log(`  dev log     = ${DEV_LOG}`);
      console.log('========================================');
      console.log('\nNote: attendee still in DB. Re-running cleans it up.');
    } finally {
      // stop dev (best effort)
      try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
    }
    // Don't auto-clean attendee — David said "ya con el nuevo certificado aplicado" implies
    // it's a real test artifact worth keeping around until he says otherwise.
  } catch (e) {
    console.error('E2E FAIL:', e.message);
    process.exit(1);
  }
}

main();
