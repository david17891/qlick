import { test, mock } from "node:test";
import assert from "node:assert/strict";

let activeMode = "socratic_autopilot_v2";

mock.module("../src/lib/admin/system-settings-server.ts", {
  namedExports: {
    KEY_BOT_GLOBAL_MODE: "bot_global_mode",
    KEY_DEEPSEEK_TOOLS_ENABLED: "deepseek_tools_enabled",
    readSystemSetting: async (key) => key === "bot_global_mode" ? activeMode : null,
  },
});

const { pickSystemPromptForMode, isSocraticNoToolsMode } = await import(
  "../src/lib/ai/deepseek-provider.ts"
);

const context = {
  profile: {
    name: "Mira",
    businessName: "Qlick",
    businessDescription: "Plataforma de marketing",
    businessHours: "24/7",
    tone: "cálido",
    servicesOrCourses: [],
    allowedActions: [],
    forbiddenActions: [],
    escalationRules: [],
    fallbackMessage: "Te atiendo en breve.",
  },
  activeEvent: undefined,
  eventsListBlock: "Sin eventos activos.",
  isFirstMessage: true,
};

test("todos los modos configurables tienen dispatch y prompt no vacío", async () => {
  const expectations = [
    ["socratic_autopilot_v2", "REGLA DE ORO"],
    ["socratic_no_tools_v1", "REGLA DE ORO"],
    ["super_executive", "SÚPER EJECUTIVO"],
    ["super_executive_v2", "SÚPER EJECUTIVO"],
    ["human_first", "human_first"],
  ];

  for (const [mode, marker] of expectations) {
    activeMode = mode;
    const prompt = await pickSystemPromptForMode(context);
    assert.ok(prompt.length > 100, `${mode} debe generar prompt útil`);
    assert.match(prompt, new RegExp(marker, "i"), `${mode} debe conservar su identidad`);
  }
});

test("solo socratic_no_tools_v1 desactiva tools", async () => {
  for (const mode of [
    "socratic_autopilot_v2",
    "super_executive",
    "super_executive_v2",
    "human_first",
  ]) {
    activeMode = mode;
    assert.equal(await isSocraticNoToolsMode(), false, `${mode} no debe apagar tools`);
  }
  activeMode = "socratic_no_tools_v1";
  assert.equal(await isSocraticNoToolsMode(), true);
});
