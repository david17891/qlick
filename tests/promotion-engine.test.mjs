/**
 * Tests para `applyPromotionRules` (commit 7).
 *
 * Cubre:
 * - Modo demo (supabase=null) → no-op.
 * - selectFollowUpBucket: devuelve bucket correcto según score.
 * - Thresholds alineados con QUALIFICATION_THRESHOLDS.
 * - MQL (>=60) → update status='qualified' + task high + admin notified.
 * - Hot (40-59) → status='contacted' + task media, NO notifica admin.
 * - Cold (<20) → sin cambios, no llama update.
 *
 * Usa mocks simples (objetos planos) en lugar de mocks tipados para
 * que el archivo sea compatible con `node --test` (JS puro).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPromotionRules,
  selectFollowUpBucket,
} from "../src/lib/crm/promotion-engine.ts";

function mkScore(score, qualification) {
  return {
    score,
    qualification,
    reasons: [],
  };
}

test("promotion: modo demo (supabase=null) no aplica reglas", async () => {
  const result = await applyPromotionRules("lead-1", mkScore(80, "mql"), {
    supabase: null,
    actorEmail: "test@test",
    leadEmail: "test@test",
    leadName: "Test",
    eventTitle: "Test Event",
  });
  assert.equal(result.ok, false);
  assert.equal(result.newStatus, null);
  assert.match(result.notes[0], /demo/i);
});

test("promotion: selectFollowUpBucket mql/hot/coldWarm", () => {
  assert.equal(selectFollowUpBucket(80), "mql");
  assert.equal(selectFollowUpBucket(60), "mql");
  assert.equal(selectFollowUpBucket(59), "hot");
  assert.equal(selectFollowUpBucket(40), "hot");
  assert.equal(selectFollowUpBucket(39), "coldWarm");
  assert.equal(selectFollowUpBucket(0), "coldWarm");
});

test("promotion: thresholds alineados con QUALIFICATION_THRESHOLDS", () => {
  // MQL >= 60, Hot >= 40, warm >= 20
  assert.equal(selectFollowUpBucket(60), "mql", "60 debe ser mql");
  assert.equal(selectFollowUpBucket(59), "hot", "59 debe ser hot");
  assert.equal(selectFollowUpBucket(40), "hot", "40 debe ser hot");
  assert.equal(selectFollowUpBucket(39), "coldWarm", "39 debe ser coldWarm");
});

/**
 * Helper: mock supabase que captura los datos enviados.
 */
function mkMockSupabase() {
  const captured = { update: null, taskInsert: null, auditInsert: null };
  return {
    captured,
    client: {
      from(table) {
        if (table === "leads") {
          return {
            update(data) {
              return {
                eq: async (_col, _val) => {
                  captured.update = data;
                  return { error: null, data: [data] };
                },
              };
            },
          };
        }
        if (table === "crm_tasks") {
          return {
            insert: async (data) => {
              captured.taskInsert = data;
              return { error: null, data: [data] };
            },
          };
        }
        if (table === "admin_audit_log") {
          return {
            insert: async (data) => {
              captured.auditInsert = data;
              return { error: null, data: [data] };
            },
          };
        }
        return {
          update: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      },
    },
  };
}

test("promotion: MQL (score 70) → status='qualified' + task high + admin notified", async () => {
  const mock = mkMockSupabase();
  const result = await applyPromotionRules("lead-1", mkScore(70, "mql"), {
    supabase: mock.client,
    actorEmail: "admin@qlick",
    leadEmail: "test@qlick.digital",
    leadName: "Test",
    eventTitle: "Test Event",
  });
  assert.equal(result.ok, true);
  assert.equal(result.newStatus, "qualified");
  assert.equal(result.taskCreated, true);
  assert.equal(result.adminNotified, true);
  assert.equal(mock.captured.update.status, "qualified");
  assert.match(mock.captured.taskInsert.title, /HOT LEAD/);
  assert.match(mock.captured.taskInsert.title, /70/);
});

test("promotion: Hot (score 50) → status='contacted', task media, NO notify admin", async () => {
  const mock = mkMockSupabase();
  const result = await applyPromotionRules("lead-1", mkScore(50, "hot"), {
    supabase: mock.client,
    actorEmail: "admin@qlick",
    leadEmail: "test@qlick.digital",
    leadName: "Test",
    eventTitle: "Test Event",
  });
  assert.equal(result.ok, true);
  assert.equal(result.newStatus, "contacted");
  assert.equal(result.taskCreated, true);
  assert.equal(result.adminNotified, false, "Hot NO notifica admin");
  assert.match(
    mock.captured.taskInsert.title,
    /Llamar para calificar/,
  );
});

test("promotion: Warm (score 30) → status='contacted', task baja", async () => {
  const mock = mkMockSupabase();
  const result = await applyPromotionRules("lead-1", mkScore(30, "warm"), {
    supabase: mock.client,
    actorEmail: "admin@qlick",
    leadEmail: "test@qlick.digital",
    leadName: "Test",
    eventTitle: "Test Event",
  });
  assert.equal(result.ok, true);
  assert.equal(result.newStatus, "contacted");
  assert.equal(result.taskCreated, true);
  assert.match(mock.captured.taskInsert.title, /Enviar temario/);
});

test("promotion: Cold (score 10) → sin cambios", async () => {
  let updateCalled = false;
  const client = {
    from(table) {
      if (table === "leads") {
        return {
          update() {
            return {
              eq: async () => {
                updateCalled = true;
                return { error: null };
              },
            };
          },
        };
      }
      return {
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
      };
    },
  };
  const result = await applyPromotionRules("lead-1", mkScore(10, "cold"), {
    supabase: client,
    actorEmail: "admin@qlick",
    leadEmail: "test@qlick.digital",
    leadName: "Test",
    eventTitle: "Test Event",
  });
  assert.equal(result.ok, true);
  assert.equal(result.newStatus, null);
  assert.equal(result.taskCreated, false);
  assert.equal(updateCalled, false);
});