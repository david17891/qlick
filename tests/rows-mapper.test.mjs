/**
 * Tests del mapper snake_case -> camelCase para notas, tareas e interacciones
 * del CRM (v0.5.0). Ver src/lib/crm/rows-mapper.ts.
 *
 * Estos mappers son puros (sin I/O) y aíslan la conversión entre el shape
 * físico de la DB y los tipos de vista. Si rompen, los drawers del CRM
 * muestran keys snake_case feos a David.
 *
 * Patrón: node --test, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mapNoteRow,
  mapTaskRow,
  mapInteractionRow
} from "../src/lib/crm/rows-mapper.ts";

/* ─────────────────────────────────────────────────────────────
 * mapNoteRow
 * ───────────────────────────────────────────────────────────── */

test("mapNoteRow: snake_case a camelCase básico", () => {
  const row = {
    id: "note-1",
    body: "Quiere seguimiento en 1 semana",
    created_by_email: "david@qlick.digital",
    created_at: "2026-07-11T12:00:00.000Z"
  };
  const view = mapNoteRow(row);
  assert.equal(view.id, "note-1");
  assert.equal(view.body, "Quiere seguimiento en 1 semana");
  assert.equal(view.authorEmail, "david@qlick.digital");
  assert.equal(view.createdAt, "2026-07-11T12:00:00.000Z");
});

test("mapNoteRow: body vacío se preserva (no se trimea)", () => {
  const view = mapNoteRow({
    id: "n",
    body: "",
    created_by_email: "x@y.com",
    created_at: "2026-07-11T12:00:00.000Z"
  });
  assert.equal(view.body, "");
});

/* ─────────────────────────────────────────────────────────────
 * mapTaskRow
 * ───────────────────────────────────────────────────────────── */

test("mapTaskRow: status pending + dueAt poblada", () => {
  const view = mapTaskRow({
    id: "task-1",
    title: "Llamar al lead",
    description: "Confirmar horario",
    status: "pending",
    due_at: "2026-07-15T10:00:00.000Z",
    created_at: "2026-07-11T12:00:00.000Z",
    completed_at: null
  });
  assert.equal(view.id, "task-1");
  assert.equal(view.title, "Llamar al lead");
  assert.equal(view.status, "pending");
  assert.equal(view.dueAt, "2026-07-15T10:00:00.000Z");
  assert.equal(view.completedAt, null);
});

test("mapTaskRow: status completed con completedAt poblado", () => {
  const view = mapTaskRow({
    id: "task-2",
    title: "Cerrar venta",
    description: null,
    status: "completed",
    due_at: "2026-07-10T10:00:00.000Z",
    created_at: "2026-07-09T12:00:00.000Z",
    completed_at: "2026-07-10T11:00:00.000Z"
  });
  assert.equal(view.status, "completed");
  assert.equal(view.completedAt, "2026-07-10T11:00:00.000Z");
  assert.equal(view.description, null);
});

test("mapTaskRow: status cancelled se preserva", () => {
  const view = mapTaskRow({
    id: "task-3",
    title: "Follow-up viejo",
    description: "x",
    status: "cancelled",
    due_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    completed_at: null
  });
  assert.equal(view.status, "cancelled");
  assert.equal(view.dueAt, null);
});

/* ─────────────────────────────────────────────────────────────
 * mapInteractionRow
 * ───────────────────────────────────────────────────────────── */

test("mapInteractionRow: whatsapp inbound preserva metadata", () => {
  const metadata = { buttonId: "btn_yes", status: "delivered" };
  const view = mapInteractionRow({
    id: "int-1",
    channel: "whatsapp",
    direction: "inbound",
    summary: "Sí quiero inscribirme",
    created_by_email: "bot@qlick",
    created_at: "2026-07-11T12:00:00.000Z",
    metadata
  });
  assert.equal(view.channel, "whatsapp");
  assert.equal(view.direction, "inbound");
  assert.equal(view.authorEmail, "bot@qlick");
  assert.deepEqual(view.metadata, metadata);
});

test("mapInteractionRow: email outbound sin metadata devuelve null", () => {
  const view = mapInteractionRow({
    id: "int-2",
    channel: "email",
    direction: "outbound",
    summary: "Email de bienvenida",
    created_by_email: "david@qlick.digital",
    created_at: "2026-07-11T12:00:00.000Z",
    metadata: null
  });
  assert.equal(view.metadata, null);
  assert.equal(view.channel, "email");
  assert.equal(view.direction, "outbound");
});

test("mapInteractionRow: system direction preserva tipo", () => {
  const view = mapInteractionRow({
    id: "int-3",
    channel: "system",
    direction: "system",
    summary: "Auto-promoción a enrolled tras pago",
    created_by_email: "system@qlick",
    created_at: "2026-07-11T12:00:00.000Z",
    metadata: { trigger: "payment_succeeded", payment_id: "pay-1" }
  });
  assert.equal(view.direction, "system");
  assert.equal(view.channel, "system");
  assert.equal(view.metadata?.trigger, "payment_succeeded");
});
