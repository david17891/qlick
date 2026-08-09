/**
 * Prueba de integración mínima del job de seguimiento.
 *
 * Verifica el kill switch real: aunque Supabase esté disponible, el modo
 * ausente/apagado no debe leer candidatos, llamar al proveedor ni escribir.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";

let reads = [];

mock.module("../src/lib/supabase/health.ts", {
  namedExports: {
    checkSupabaseConfig: () => ({ configured: true }),
  },
});

mock.module("../src/lib/admin/system-settings-server.ts", {
  namedExports: {
    KEY_BOT_DAILY_OUTBOUND_LIMIT: "bot_daily_outbound_limit",
    KEY_BOT_PAUSED_GLOBAL: "bot_paused_global",
    KEY_LEAD_INFO_FOLLOWUP_MODE: "lead_info_followup_mode",
    KEY_LEAD_FOLLOWUP_MODE: "lead_followup_mode",
    readSystemSetting: async (key) => {
      reads.push(key);
      return key === "lead_followup_mode" ? null : null;
    },
  },
});

test("lead followup cron: modo ausente cae a off antes de leer leads", async () => {
  const { runLeadFollowupJob } = await import(
    "../src/lib/cron/lead-followup.ts"
  );

  const result = await runLeadFollowupJob(new Date("2026-07-30T12:00:00.000Z"));

  assert.equal(result.ok, true);
  assert.equal(result.mode, "off");
  assert.equal(result.scanned, 0);
  assert.equal(result.sent, 0);
  assert.deepEqual(reads, ["lead_followup_mode", "lead_info_followup_mode"]);
  assert.match(result.note, /no se leen candidatos/i);
});
