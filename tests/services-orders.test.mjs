/**
 * Tests unitarios para el sistema de service_orders (FASE 8C).
 *
 * Cubre:
 * - Mappers (snake_case → camelCase) con numeric(10,2) string
 * - Labels legibles para UI
 *
 * NO cubre las APIs ni la lib server (eso es E2E con DB real; sprint
 * futuro). Acá probamos las funciones puras.
 *
 * Patrón: node --test, import .ts via --experimental-strip-types.
 * NOTA: con strip-types los path aliases (`@/lib/...`) NO funcionan;
 * usamos paths relativos en este test para no romper el flujo del runner.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Tests que no requieren imports .ts (cuban tipos/enums directos del
// módulo compilado). Para los mappers .ts, en este sprint skippeamos
// y los cubrimos via integration test cuando la UI los use.

describe("FASE 8C — enums y labels", () => {
  it("ORDER_STATUS_LABELS cubre los 7 estados", async () => {
    const mod = await import("../src/types/services.ts");
    const labels = mod.ORDER_STATUS_LABELS;
    assert.equal(typeof labels.pending_contact, "string");
    assert.equal(typeof labels.contacted, "string");
    assert.equal(typeof labels.confirmed, "string");
    assert.equal(typeof labels.in_progress, "string");
    assert.equal(typeof labels.delivered, "string");
    assert.equal(typeof labels.closed, "string");
    assert.equal(typeof labels.cancelled, "string");
    // Sanity: no son vacíos.
    for (const v of Object.values(labels)) {
      assert.ok(v.length > 0);
    }
  });

  it("ORDER_PAYMENT_MODE_LABELS cubre los 5 modos", async () => {
    const mod = await import("../src/types/services.ts");
    const labels = mod.ORDER_PAYMENT_MODE_LABELS;
    assert.equal(typeof labels.pending, "string");
    assert.equal(typeof labels.test, "string");
    assert.equal(typeof labels.stripe, "string");
    assert.equal(typeof labels.manual, "string");
    assert.equal(typeof labels.free, "string");
  });

  it("ORDER_NOTE_TYPE_LABELS cubre los 4 tipos", async () => {
    const mod = await import("../src/types/services.ts");
    const labels = mod.ORDER_NOTE_TYPE_LABELS;
    assert.equal(typeof labels.general, "string");
    assert.equal(typeof labels.client_request, "string");
    assert.equal(typeof labels.blocker, "string");
    assert.equal(typeof labels.follow_up, "string");
  });

  it("ORDER_DOCUMENT_TYPE_LABELS cubre los 6 tipos", async () => {
    const mod = await import("../src/types/services.ts");
    const labels = mod.ORDER_DOCUMENT_TYPE_LABELS;
    assert.equal(typeof labels.receipt, "string");
    assert.equal(typeof labels.certificate, "string");
    assert.equal(typeof labels.brief, "string");
    assert.equal(typeof labels.deliverable, "string");
    assert.equal(typeof labels.contract, "string");
    assert.equal(typeof labels.other, "string");
  });
});

describe("FASE 8C — mappers (sanity)", () => {
  it("mapServiceOrderRow convierte numeric(10,2) string a number", async () => {
    const { mapServiceOrderRow } = await import(
      "../src/lib/services/mappers.ts"
    );
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      order_number: "QO-2026-0001",
      lead_id: null,
      service_id: "00000000-0000-0000-0000-000000000002",
      variant_id: "00000000-0000-0000-0000-000000000003",
      customer_name: "Juan Pérez",
      customer_email: "juan@example.com",
      customer_phone: "+52 1 653 123 4567",
      customer_notes: "Mi negocio es una taquería.",
      amount_mxn: "2500.50", // string (lo que devuelve PostgREST)
      currency: "MXN",
      status: "pending_contact",
      payment_mode: "test",
      payment_reference: null,
      scheduled_at: null,
      assigned_to: null,
      delivered_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: "2026-07-21T10:00:00Z",
      updated_at: "2026-07-21T10:00:00Z",
    };
    const out = mapServiceOrderRow(row);
    assert.equal(out.id, row.id);
    assert.equal(out.orderNumber, "QO-2026-0001");
    assert.equal(typeof out.amountMXN, "number");
    assert.equal(out.amountMXN, 2500.5);
    assert.equal(out.status, "pending_contact");
    assert.equal(out.customerName, "Juan Pérez");
  });

  it("mapServiceOrderEventRow convierte payload object a Record<string,unknown>", async () => {
    const { mapServiceOrderEventRow } = await import(
      "../src/lib/services/mappers.ts"
    );
    const row = {
      id: "00000000-0000-0000-0000-000000000010",
      order_id: "00000000-0000-0000-0000-000000000001",
      type: "status_change",
      actor_id: "david17891@gmail.com",
      actor_type: "admin",
      payload: { from: "pending_contact", to: "confirmed" },
      created_at: "2026-07-21T10:01:00Z",
    };
    const out = mapServiceOrderEventRow(row);
    assert.equal(out.type, "status_change");
    assert.equal(out.actorType, "admin");
    assert.equal(typeof out.payload, "object");
    assert.equal(out.payload.from, "pending_contact");
  });

  it("mapServiceOrderEventRow maneja payload null o array", async () => {
    const { mapServiceOrderEventRow } = await import(
      "../src/lib/services/mappers.ts"
    );
    const baseRow = {
      id: "00000000-0000-0000-0000-000000000010",
      order_id: "00000000-0000-0000-0000-000000000001",
      type: "note",
      actor_id: null,
      actor_type: "system",
      created_at: "2026-07-21T10:01:00Z",
    };
    // null → {}
    const out1 = mapServiceOrderEventRow({ ...baseRow, payload: null });
    assert.deepEqual(out1.payload, {});
    // array → {} (no es un plain object)
    const out2 = mapServiceOrderEventRow({ ...baseRow, payload: ["a", "b"] });
    assert.deepEqual(out2.payload, {});
  });
});

// NOTA: el email helper (service-order-notification) arrastra el módulo
// de Brevo (brevo-client.ts), y node --experimental-strip-types no
// resuelve imports sin extensión `.ts` cuando hay cadenas. Los tests
// de email quedan para un integration test futuro cuando la UI lo
// consuma y podamos mockear sendEmail. Cubrimos aquí solo mappers y
// labels, que son las funciones puras críticas.
