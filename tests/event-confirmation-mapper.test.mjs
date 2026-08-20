import { test } from "node:test";
import assert from "node:assert/strict";
import { mapEventConfirmationRowToEventConfirmation } from "../src/lib/events/event-mapper.ts";

test("mapEventConfirmationRowToEventConfirmation conserva paid_manual", () => {
  const mapped = mapEventConfirmationRowToEventConfirmation({
    id: "00000000-0000-4000-8000-000000000001",
    event_id: "00000000-0000-4000-8000-000000000002",
    name: "Luis Ramírez",
    email: "luis@example.com",
    phone_raw: "+5211111111111",
    phone_normalized: "+5211111111111",
    source: "manual",
    confirmed_at: "2026-08-20T00:00:00.000Z",
    import_batch_id: null,
    payment_status: "paid_manual",
    registration_status: "confirmed",
    registration_confirmed_at: "2026-08-20T00:00:00.000Z",
    payment_priority_expires_at: null,
    lead_id: null,
  });

  assert.equal(mapped.paymentStatus, "paid_manual");
  assert.equal(mapped.registrationStatus, "confirmed");
});
