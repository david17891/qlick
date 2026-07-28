import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const middlewareSource = await readFile(
  new URL("../src/middleware.ts", import.meta.url),
  "utf8",
);

test("middleware recupera una sesión Supabase inválida sin propagar 500", () => {
  assert.match(middlewareSource, /try\s*\{[\s\S]*?supabase\.auth\.getUser\(\)/);
  assert.match(middlewareSource, /catch \(error: unknown\)/);
  assert.match(middlewareSource, /clearSupabaseAuthCookies\(req, res\);/);
});

test("solo limpia cookies sb de auth y contempla chunks", () => {
  assert.match(
    middlewareSource,
    /\/\^sb-\.\+-auth-token\(\?:\\\.\\d\+\)\?\$\//,
  );
  assert.match(middlewareSource, /req\.cookies\.delete\(name\)/);
  assert.match(middlewareSource, /res\.cookies\.delete\(name\)/);
});
