/**
 * Tests del arnés de simulación masiva (Sprint v0.9.9 / v17-4).
 *
 * Cubre:
 *   - `generateMassiveMatrix()` retorna ≥ 350 situaciones.
 *   - La distribución cartesiana es correcta (10 arquetipos × 7 contextos
 *     × 5 trayectorias = 350; incluye los 3 nuevos de `human_first`
 *     agregados en Sprint v0.9.x PR #10).
 *   - `auditMatrix()` corre las 350 situaciones en < 5 segundos.
 *   - El reporte de auditoría es coherente (passCount + failCount = total).
 *   - Los arquetipos clave (acompanantes, typo_email, cadencia_larga)
 *     tienen al menos 1 situación relacionada con su métrica principal.
 *
 * Patrón: tests del módulo puro, sin mocks de Supabase / fetch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const MATRIX_URL = pathToFileURL(
  path.join(ROOT, "src/lib/ai/simulation/massive-matrix-generator.ts")
).href;
const AUDITOR_URL = pathToFileURL(
  path.join(ROOT, "src/lib/ai/simulation/matrix-auditor.ts")
).href;

test("M1: generateMassiveMatrix() retorna exactamente 350 situaciones", async () => {
  const { generateMassiveMatrix } = await import(MATRIX_URL);
  const matrix = generateMassiveMatrix();
  assert.equal(matrix.length, 350, "10 arquetipos × 7 contextos × 5 trayectorias");
});

test("M2: cada situación tiene id único, arquetipo, contexto, trayectoria y ≥ 1 turn", async () => {
  const { generateMassiveMatrix } = await import(MATRIX_URL);
  const matrix = generateMassiveMatrix();
  const seenIds = new Set();
  for (const s of matrix) {
    assert.ok(s.id, "cada situación tiene id");
    assert.ok(!seenIds.has(s.id), `id duplicado: ${s.id}`);
    seenIds.add(s.id);
    assert.ok(s.archetype, "cada situación tiene arquetipo");
    assert.ok(s.context, "cada situación tiene contexto");
    assert.ok(s.trajectory, "cada situación tiene trayectoria");
    assert.ok(s.turns.length >= 1, "cada situación tiene ≥ 1 turn");
  }
});

test("M3: la distribución cartesiana es 10 arquetipos × 4 contextos × 5 trayectorias", async () => {
  const { generateMassiveMatrix, ARCHETYPE_KEYS, CONTEXT_KEYS, TRAJECTORY_KEYS } =
    await import(MATRIX_URL);
  const matrix = generateMassiveMatrix();
  // 10 arquetipos únicos en la matriz.
  const archetypes = new Set(matrix.map((s) => s.archetype));
  assert.equal(archetypes.size, ARCHETYPE_KEYS.length, "10 arquetipos");
  for (const a of ARCHETYPE_KEYS) {
    assert.ok(archetypes.has(a), `arquetipo ${a} presente`);
  }
  // 7 contextos únicos (4 originales + 3 nuevos de human_first en PR #10).
  const contexts = new Set(matrix.map((s) => s.context));
  assert.equal(contexts.size, CONTEXT_KEYS.length, "7 contextos");
  // 5 trayectorias únicas.
  const trajectories = new Set(matrix.map((s) => s.trajectory));
  assert.equal(trajectories.size, TRAJECTORY_KEYS.length, "5 trayectorias");
});

test("M4: arquetipos clave tienen situaciones relacionadas con su métrica principal", async () => {
  const { generateMassiveMatrix } = await import(MATRIX_URL);
  const matrix = generateMassiveMatrix();
  // acompañantes: ≥ 1 situación con expect: register_guest.
  const acompanantes = matrix.filter((s) => s.archetype === "acompanantes");
  const hasGuestExpect = acompanantes.some((s) =>
    s.turns.some((t) => t.expect === "register_guest")
  );
  assert.ok(hasGuestExpect, "acompanantes tiene al menos 1 turn con expect: register_guest");
  // typo_email: ≥ 1 turn con expect: domain_typ_confirmation.
  const typos = matrix.filter((s) => s.archetype === "typo_email");
  const hasTypo = typos.some((s) =>
    s.turns.some((t) => t.expect === "domain_typ_confirmation")
  );
  assert.ok(hasTypo, "typo_email tiene al menos 1 turn con expect: domain_typ_confirmation");
  // cadencia_larga: ≥ 1 turn con expect: no_repeat_ask.
  const cadencia = matrix.filter((s) => s.archetype === "cadencia_larga");
  const hasNoRepeat = cadencia.some((s) =>
    s.turns.some((t) => t.expect === "no_repeat_ask")
  );
  assert.ok(hasNoRepeat, "cadencia_larga tiene al menos 1 turn con expect: no_repeat_ask");
});

test("M5: auditMatrix() corre 350 situaciones en < 5 segundos", async () => {
  const { auditMatrix } = await import(AUDITOR_URL);
  const start = Date.now();
  const report = auditMatrix();
  const elapsed = Date.now() - start;
  assert.ok(
    elapsed < 5_000,
    `el arnés debe correr en <5s; elapsed=${elapsed}ms`
  );
  assert.equal(report.total, 350);
  assert.equal(report.passCount + report.failCount, 350);
  assert.ok(report.durationMs >= 0, "durationMs está poblado");
});

test("M6: el reporte agrega correctamente por arquetipo", async () => {
  const { auditMatrix } = await import(AUDITOR_URL);
  const report = auditMatrix();
  // Cada arquetipo tiene 35 situaciones (7 contextos × 5 trayectorias).
  for (const [arch, agg] of Object.entries(report.byArchetype)) {
    assert.equal(
      agg.total,
      35,
      `arquetipo ${arch} debe tener 35 situaciones (7×5)`
    );
    assert.equal(agg.pass + agg.fail, agg.total, "suma pasa+falla = total");
  }
});

test("M7: el reporte agrega correctamente por métrica", async () => {
  const { auditMatrix } = await import(AUDITOR_URL);
  const report = auditMatrix();
  for (const [key, agg] of Object.entries(report.byMetric)) {
    assert.ok(
      agg.total > 0,
      `métrica ${key} tiene turns auditados (total=${agg.total})`
    );
    assert.ok(
      agg.pass <= agg.total,
      `métrica ${key}: pass (${agg.pass}) <= total (${agg.total})`
    );
  }
});

test("M8: el reporte incluye situationAudits con detalles por situación", async () => {
  const { auditMatrix } = await import(AUDITOR_URL);
  const report = auditMatrix();
  assert.equal(report.situationAudits.length, 350);
  // Cada SituationAudit tiene turnAudits poblado.
  for (const sa of report.situationAudits.slice(0, 5)) {
    assert.ok(sa.situationId);
    assert.ok(sa.turnAudits.length > 0);
    assert.ok(typeof sa.pass === "boolean");
  }
});
