import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewLeadInfoFollowupScope } from "../src/lib/whatsapp/followup-scope.ts";
import { isWithinProactiveContactWindow } from "../src/lib/whatsapp/followup-quiet-hours.ts";

test("scope: lead nuevo entra desde el corte si no tiene etiqueta histórica", () => {
  assert.equal(isNewLeadInfoFollowupScope({
    createdAt: "2026-08-09T16:00:00.000Z",
    tags: ["conversation:info_requested"],
    newInfoFollowupSince: "2026-08-09T15:59:59.000Z",
  }), true);
});

test("scope: lead de rescate histórico queda fuera aunque sea reciente", () => {
  assert.equal(isNewLeadInfoFollowupScope({
    createdAt: "2026-08-09T16:00:00.000Z",
    tags: ["recovery:info_historical"],
    newInfoFollowupSince: "2026-08-09T15:00:00.000Z",
  }), false);
});

test("scope: lead anterior al corte queda fuera", () => {
  assert.equal(isNewLeadInfoFollowupScope({
    createdAt: "2026-08-09T14:00:00.000Z",
    tags: [],
    newInfoFollowupSince: "2026-08-09T15:00:00.000Z",
  }), false);
});

test("horario: permite envío a las 09:00 y bloquea la madrugada", () => {
  assert.equal(isWithinProactiveContactWindow(new Date("2026-08-09T16:00:00.000Z")), true);
  assert.equal(isWithinProactiveContactWindow(new Date("2026-08-09T08:00:00.000Z")), false);
});

test("horario: bloquea desde las 19:00 hora Phoenix", () => {
  assert.equal(isWithinProactiveContactWindow(new Date("2026-08-10T02:00:00.000Z")), false);
});
