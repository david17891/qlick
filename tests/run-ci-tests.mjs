import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const testsDir = join(root, "tests");

// Estas suites escriben en Supabase o llaman proveedores externos. Se ejecutan
// en los smoke/E2E con secretos explícitos, no en el gate estático de cada PR.
const externalSuites = new Set([
  "bot-comprehensive-matrix.test.mjs",
  "bot-david-e2e-flow.test.mjs",
  "bot-e2e-pago-real.test.mjs",
  "bot-e2e-real-deepseek.test.mjs",
  "bot-e2e-variations-real.test.mjs",
  "bot-e2e-variations-suite.test.mjs",
  "bot-simulations-humanas.test.mjs",
  "human-first-end-to-end-real.test.mjs",
  "human-first-end-to-end.test.mjs",
  "payment-notify-lead-whatsapp.test.mjs",
  "payments-events-funnel-e2e.test.mjs",
]);

const files = readdirSync(testsDir)
  .filter((file) => file.endsWith(".test.mjs"))
  .filter((file) => !externalSuites.has(file))
  .sort()
  .map((file) => join("tests", file));

const args = [
  "--experimental-test-module-mocks",
  "--import",
  "./tests/loader-register.mjs",
  "--experimental-strip-types",
  "--test",
  ...files,
];

const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
