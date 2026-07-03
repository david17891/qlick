/**
 * Regression test para el bug del 2026-07-03: la URL generada por
 * `generateStaffLink` apuntaba a `/staff/scan/[token]` que NO existe
 * en Next.js → 404 en Vercel. El path correcto es `/api/staff/scan/[token]`
 * (el endpoint que valida y redirige).
 *
 * Este test verifica que las URLs generadas siempre apunten al endpoint
 * redirect correcto, evitando que el bug vuelva a aparecer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("staff links: URL generada debe apuntar al endpoint redirect", () => {
  const linksPath = join(process.cwd(), "src/lib/staff/links.ts");
  const helpersPath = join(
    process.cwd(),
    "src/app/admin/eventos/[id]/_staff-link-helpers.ts",
  );

  const linksSrc = readFileSync(linksPath, "utf8");
  const helpersSrc = readFileSync(helpersPath, "utf8");

  // El codigo debe apuntar a /api/staff/scan/ (no /staff/scan/ solo).
  assert.match(
    linksSrc,
    /\/api\/staff\/scan\/\$\{/,
    "src/lib/staff/links.ts debe usar /api/staff/scan/ en la URL",
  );
  assert.doesNotMatch(
    linksSrc,
    /`\/staff\/scan\/`/, // sin /api/ prefix
    "src/lib/staff/links.ts NO debe usar /staff/scan/ (sin /api/)",
  );

  assert.match(
    helpersSrc,
    /\/api\/staff\/scan\/\$\{link\.token\}/,
    "_staff-link-helpers.ts debe usar /api/staff/scan/ en la URL",
  );
  assert.doesNotMatch(
    helpersSrc,
    /`\/staff\/scan\/`/, // sin /api/ prefix
    "_staff-link-helpers.ts NO debe usar /staff/scan/ (sin /api/)",
  );
});