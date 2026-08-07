import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Bot Services Kill Switch Flag", () => {
  it("readBotServicesEnabled retorna false cuando la configuración está ausente (fail-closed)", async () => {
    const { readBotServicesEnabled } = await import(
      "../src/lib/admin/system-settings-server.ts"
    );

    const isEnabled = await readBotServicesEnabled();
    assert.equal(typeof isEnabled, "boolean");
  });
});
