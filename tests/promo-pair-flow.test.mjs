import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const migration = read("supabase/migrations/20260813170000_event_promo_pair_orders.sql");
const promoRoute = read("src/app/api/promo/checkout/route.ts");
const promoPage = read("src/app/promo/PromoForm.tsx");
const promoServer = read("src/lib/events/promo-orders-server.ts");
const webhook = read("src/app/api/webhooks/stripe/route.ts");
const checkIn = read("src/app/api/check-in/[token]/route.ts");
const staffCheckIn = read("src/app/api/staff/check-in/route.ts");

test("promo es aditiva y conserva un solo ledger promocional", () => {
  assert.match(migration, /create table if not exists public\.event_promo_orders/);
  assert.match(migration, /create table if not exists public\.event_promo_order_participants/);
  assert.match(migration, /total_amount_mxn numeric\(10,2\) not null default 1500/);
  assert.match(migration, /deposit_amount_mxn numeric\(10,2\) not null default 200/);
  assert.match(migration, /promo_order_id uuid references public\.event_promo_orders/);
  assert.match(migration, /claim_event_promo_qr_checkin/);
  assert.match(migration, /revoke all on function public\.claim_event_promo_qr_checkin/);
});

test("/promo ofrece pareja, opción normal y segundo participante opcional", () => {
  assert.match(promoRoute, /mode === "single"/);
  assert.match(promoRoute, /createOrReusePromoOrder/);
  assert.match(promoRoute, /paymentPurpose: paymentOption === "reservation" \? "promo_pair_reservation"/);
  assert.match(promoPage, /2 personas/);
  assert.match(promoPage, /1 persona/);
  assert.match(promoPage, /Segunda persona \(opcional\)/);
});

test("el servidor reutiliza pendientes y no transforma pagos existentes", () => {
  assert.match(promoServer, /in\("status"[^\n]+\["pending", "partial"\]/);
  assert.match(promoServer, /isPaidStatus\(primary\.payment_status \?\? primary\.paymentStatus\)/);
  assert.match(promoServer, /emailForConfirmation = secondEmail === primaryEmail \? null/);
  assert.match(promoServer, /identity_status: secondName \|\| slotTwo\?\.name \? "named" : "identity_pending"/);
});

test("Stripe separa el webhook promocional y aplica el pago a ambas plazas nombradas", () => {
  assert.match(webhook, /session\.metadata\?\.promo_order_id/);
  assert.match(webhook, /handlePromoCheckoutCompleted/);
  assert.match(webhook, /settlePromoOrder/);
  assert.match(webhook, /promo_refund_processed/);
});

test("el QR compartido permite exactamente dos accesos y funciona con staff", () => {
  assert.match(checkIn, /claim_event_promo_qr_checkin/);
  assert.match(checkIn, /dos accesos permitidos/);
  assert.match(staffCheckIn, /claim_event_promo_qr_checkin/);
  assert.match(staffCheckIn, /maxCheckIns: 2/);
});
