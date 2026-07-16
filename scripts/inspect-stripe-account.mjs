// Diagnóstico profundo: verifica account, balance, charges, customers, etc.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf-8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...parseEnvFile(join(ROOT, ".env.local")), ...process.env };
const SK = env.STRIPE_SECRET_KEY;
const PK = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

console.log(`[SK] ${SK.slice(0, 30)}...`);
console.log(`[PK] ${PK.slice(0, 30)}...`);

const auth = Buffer.from(`${SK}:`).toString("base64");
const headers = {
  Authorization: `Basic ${auth}`,
  "Content-Type": "application/x-www-form-urlencoded",
};

async function stripe(method, path) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, { method, headers });
  const data = await r.json();
  if (!r.ok) {
    console.error(`[STRIPE ${method} ${path}] error ${r.status}:`, JSON.stringify(data.error ?? data, null, 2));
    return null;
  }
  return data;
}

// 1. Balance (confirma que la sk es válida)
console.log("\n=== 1. Balance ===");
const balance = await stripe("GET", "/balance");
if (balance) {
  console.log(`  livemode: ${balance.livemode}`);
  console.log(`  available: ${JSON.stringify(balance.available)}`);
  console.log(`  pending: ${JSON.stringify(balance.pending)}`);
}

// 2. Account
console.log("\n=== 2. Account ===");
const account = await stripe("GET", "/account");
if (account) {
  console.log(`  id: ${account.id}`);
  console.log(`  business_profile.name: ${account.business_profile?.name}`);
  console.log(`  email: ${account.email}`);
  console.log(`  country: ${account.country}`);
  console.log(`  default_currency: ${account.default_currency}`);
  console.log(`  charges_enabled: ${account.charges_enabled}`);
  console.log(`  payouts_enabled: ${account.payouts_enabled}`);
}

// 3. Charges (TODOS, no solo los de payment_intent)
console.log("\n=== 3. Charges (últimos 20) ===");
const charges = await stripe("GET", "/charges?limit=20");
if (charges) {
  console.log(`Total: ${charges.data.length}`);
  for (const c of charges.data) {
    console.log(`  ${c.id} $${c.amount / 100} ${c.currency?.toUpperCase()} status=${c.status} paid=${c.paid} created=${new Date(c.created * 1000).toISOString()}`);
    if (c.metadata?.product_ref) console.log(`    product_ref: ${c.metadata.product_ref.slice(0, 60)}`);
  }
}

// 4. Customers (¿hay alguno?)
console.log("\n=== 4. Customers (últimos 5) ===");
const customers = await stripe("GET", "/customers?limit=5");
if (customers) {
  console.log(`Total: ${customers.data.length}`);
  for (const c of customers.data) {
    console.log(`  ${c.id} email=${c.email} created=${new Date(c.created * 1000).toISOString()}`);
  }
}

// 5. Payment Links
console.log("\n=== 5. Payment Links (últimos 5) ===");
const links = await stripe("GET", "/payment_links?limit=5");
if (links) {
  console.log(`Total: ${links.data.length}`);
  for (const l of links.data) {
    console.log(`  ${l.id} active=${l.active} url=${l.url}`);
  }
}

// 6. Webhook endpoints
console.log("\n=== 6. Webhook Endpoints ===");
const webhooks = await stripe("GET", "/webhook_endpoints?limit=10");
if (webhooks) {
  console.log(`Total: ${webhooks.data.length}`);
  for (const w of webhooks.data) {
    console.log(`  ${w.id}`);
    console.log(`    url: ${w.url}`);
    console.log(`    status: ${w.status}`);
    console.log(`    enabled_events: ${w.enabled_events?.slice(0, 5).join(", ")}...`);
    console.log(`    created: ${new Date(w.created * 1000).toISOString()}`);
  }
}
