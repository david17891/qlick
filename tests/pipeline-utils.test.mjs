/**
 * Tests de las utilidades de pipeline (PIPELINE_ORDER, getPipelineStages,
 * calculateConversionRate, calculatePipelineValue). Ver src/lib/crm/pipeline-utils.ts.
 *
 * Patrón: node --test, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PIPELINE_ORDER,
  TERMINAL_STATUSES,
  getPipelineStages,
  calculateConversionRate,
  calculatePipelineValue
} from "../src/lib/crm/pipeline-utils.ts";

/* ─────────────────────────────────────────────────────────────
 * 1. Constantes
 * ───────────────────────────────────────────────────────────── */

test("PIPELINE_ORDER: 7 etapas canónicas en orden", () => {
  assert.deepEqual(PIPELINE_ORDER, [
    "new",
    "contacted",
    "interested",
    "info_requested",
    "payment_pending",
    "enrolled",
    "active_student"
  ]);
});

test("TERMINAL_STATUSES: lost y archived fuera del kanban principal", () => {
  assert.deepEqual(TERMINAL_STATUSES, ["lost", "archived"]);
  // No se solapan con PIPELINE_ORDER
  for (const s of TERMINAL_STATUSES) {
    assert.ok(!PIPELINE_ORDER.includes(s));
  }
});

/* ─────────────────────────────────────────────────────────────
 * 2. getPipelineStages
 * ───────────────────────────────────────────────────────────── */

test("getPipelineStages: agrupa leads por status en orden", () => {
  const leads = [
    { id: "a", status: "new" },
    { id: "b", status: "new" },
    { id: "c", status: "interested" },
    { id: "d", status: "lost" } // terminal: no aparece en columnas
  ];
  const stages = getPipelineStages(leads);
  assert.equal(stages.length, PIPELINE_ORDER.length);
  const newStage = stages.find((s) => s.status === "new");
  const interestedStage = stages.find((s) => s.status === "interested");
  const lostStage = stages.find((s) => s.status === "lost");
  assert.equal(newStage.leads.length, 2);
  assert.equal(interestedStage.leads.length, 1);
  assert.equal(lostStage, undefined);
});

test("getPipelineStages: cada columna tiene label + tone + order", () => {
  const stages = getPipelineStages([]);
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    assert.equal(stage.status, PIPELINE_ORDER[i]);
    assert.equal(stage.order, i);
    assert.ok(stage.label.length > 0, `label para ${stage.status} no debe estar vacía`);
    assert.ok(stage.tone.length > 0, `tone para ${stage.status} no debe estar vacío`);
    assert.deepEqual(stage.leads, []);
  }
});

/* ─────────────────────────────────────────────────────────────
 * 3. calculateConversionRate
 * ───────────────────────────────────────────────────────────── */

test("calculateConversionRate: 0 leads = 0%", () => {
  assert.equal(calculateConversionRate([]), 0);
});

test("calculateConversionRate: 1 enrolled entre 4 relevantes = 25%", () => {
  const leads = [
    { status: "enrolled" },
    { status: "new" },
    { status: "contacted" },
    { status: "lost" }
  ];
  // 1 won / 4 relevant = 25
  assert.equal(calculateConversionRate(leads), 25);
});

test("calculateConversionRate: archived se excluye del denominador", () => {
  const leads = [
    { status: "enrolled" },
    { status: "archived" },
    { status: "archived" },
    { status: "new" }
  ];
  // 1 won / 2 relevant (enrolled + new) = 50
  assert.equal(calculateConversionRate(leads), 50);
});

test("calculateConversionRate: enrolled + active_student cuentan como ganados", () => {
  const leads = [
    { status: "enrolled" },
    { status: "active_student" },
    { status: "new" },
    { status: "contacted" }
  ];
  // 2 won / 4 relevant = 50
  assert.equal(calculateConversionRate(leads), 50);
});

test("calculateConversionRate: 100% cuando todos son ganados", () => {
  const leads = [
    { status: "enrolled" },
    { status: "active_student" }
  ];
  assert.equal(calculateConversionRate(leads), 100);
});

test("calculateConversionRate: 0% cuando ninguno es ganado", () => {
  const leads = [
    { status: "new" },
    { status: "contacted" },
    { status: "lost" }
  ];
  assert.equal(calculateConversionRate(leads), 0);
});

test("calculateConversionRate: redondea a entero", () => {
  // 1/3 = 33.33 → 33
  const leads = [{ status: "enrolled" }, { status: "new" }, { status: "new" }];
  assert.equal(calculateConversionRate(leads), 33);
});

/* ─────────────────────────────────────────────────────────────
 * 4. calculatePipelineValue
 * ───────────────────────────────────────────────────────────── */

test("calculatePipelineValue: 0 leads = 0", () => {
  assert.equal(calculatePipelineValue([]), 0);
});

test("calculatePipelineValue: suma estimatedValueMXN", () => {
  const leads = [
    { estimatedValueMXN: 5000 },
    { estimatedValueMXN: 3500 },
    { estimatedValueMXN: 1500 }
  ];
  assert.equal(calculatePipelineValue(leads), 10000);
});

test("calculatePipelineValue: null se trata como 0", () => {
  const leads = [
    { estimatedValueMXN: 5000 },
    { estimatedValueMXN: null },
    { estimatedValueMXN: 2500 }
  ];
  assert.equal(calculatePipelineValue(leads), 7500);
});

test("calculatePipelineValue: undefined se trata como 0", () => {
  const leads = [
    { estimatedValueMXN: 2000 },
    {},
    { estimatedValueMXN: 8000 }
  ];
  assert.equal(calculatePipelineValue(leads), 10000);
});
