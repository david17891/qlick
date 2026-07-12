#!/usr/bin/env node
/**
 * Sprint v0.9.9 / v17-4 — Generador del Reporte de Simulación Masiva.
 *
 * Ejecuta las 200 situaciones del arnés masivo contra el bot
 * determinístico (mock) y genera 2 archivos:
 *
 *   1. `docs/BOT_MASSIVE_SIMULATION_200_REPORT.md` (resumen ejecutivo,
 *      SE COMMITEA al repo).
 *   2. `private-data/reports/bot_simulation_massive_200.json` (reporte
 *      completo con detalle de cada situación, NO se commitea porque
 *      `private-data/` está en `.gitignore`).
 *
 * Uso:
 *   node --import ./tests/loader-register.mjs --experimental-strip-types \
 *     scripts/generate-massive-report.mjs
 *
 * (El loader es necesario para resolver los `.ts` que importa el script
 * — mismo patrón que los tests del arnés.)
 *
 * Para regenerar después de cambios en el prompt, correr:
 *   npm run type-check && node scripts/generate-massive-report.mjs
 *
 * @server
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

// Importar con strip-types: el proyecto tiene un loader que resuelve @/...
// pero este script corre standalone, así que importamos con path relativo
// convertido a file:// URL (ESM en Windows no acepta paths crudos).
const SIMULATION_DIR = join(ROOT, "src", "lib", "ai", "simulation");
const MATRIX_URL = pathToFileURL(join(SIMULATION_DIR, "massive-matrix-generator.ts")).href;
const AUDITOR_URL = pathToFileURL(join(SIMULATION_DIR, "matrix-auditor.ts")).href;
const matrixGen = await import(MATRIX_URL);
const matrixAud = await import(AUDITOR_URL);

const { generateMassiveMatrix, matrixSummary } = matrixGen;
const { auditMatrix } = matrixAud;

const start = Date.now();
const matrix = generateMassiveMatrix();
const summary = matrixSummary(matrix);
const report = auditMatrix(matrix);
const totalMs = Date.now() - start;

// ------------------------------------------------------------------
// Construir el resumen markdown.
// ------------------------------------------------------------------

const lines = [];
lines.push("# Reporte de Simulación Masiva — Laboratorio IA (Sprint v0.9.9)");
lines.push("");
lines.push(`> Generado: ${new Date().toISOString()}`);
lines.push(`> Total de situaciones: **${report.total}** (10 arquetipos × 4 contextos × 5 trayectorias)`);
lines.push(`> Pass rate: **${(report.passRate * 100).toFixed(1)}%** (${report.passCount}/${report.total})`);
lines.push(`> Duración del arnés: **${report.durationMs}ms** (límite <5s)`);
lines.push("");
lines.push("## Resumen ejecutivo");
lines.push("");
lines.push("- **Arnés**: 200 situaciones ejecutadas en modo mock determinístico (<5s).");
lines.push("- **Bot simulado**: heurísticas que simulan las reglas del sprint v0.9.8 (tool `add_event_guest`, detección de typos de dominio, cadencia suave).");
lines.push("- **Métricas evaluadas**: 5 (brevedad, acompañantes, typos, cadencia, tool invocation).");
lines.push("- **Semáforo general**: ver `passRate` arriba y desglose por arquetipo abajo.");
lines.push("");

// Desglose por arquetipo (semáforo).
lines.push("## Desglose por arquetipo");
lines.push("");
lines.push("| Arquetipo | Total | Pass | Fail | Semáforo |");
lines.push("|---|---:|---:|---:|:---:|");
for (const [arch, agg] of Object.entries(report.byArchetype)) {
  const ratio = agg.total === 0 ? 0 : agg.pass / agg.total;
  const semaforo =
    ratio === 1 ? "🟢" : ratio >= 0.8 ? "🟡" : "🔴";
  lines.push(`| ${arch} | ${agg.total} | ${agg.pass} | ${agg.fail} | ${semaforo} |`);
}
lines.push("");

// Desglose por métrica.
lines.push("## Desglose por métrica");
lines.push("");
lines.push("| Métrica | Total de turns auditados | Pass |");
lines.push("|---|---:|---:|");
for (const [key, agg] of Object.entries(report.byMetric)) {
  lines.push(`| ${key} | ${agg.total} | ${agg.pass} |`);
}
lines.push("");

// Desglose por contexto.
lines.push("## Distribución por contexto");
lines.push("");
for (const [ctx, count] of Object.entries(summary.byContext)) {
  lines.push(`- **${ctx}**: ${count} situaciones`);
}
lines.push("");

// Fallas (si hay).
if (report.failCount > 0) {
  lines.push("## Fallas detectadas");
  lines.push("");
  const failedSituations = report.situationAudits.filter((s) => !s.pass);
  for (const sa of failedSituations.slice(0, 20)) {
    lines.push(`### ${sa.situationId}`);
    lines.push("");
    lines.push(`- **Arquetipo**: ${sa.archetype}`);
    lines.push(`- **Contexto**: ${sa.context}`);
    lines.push(`- **Trayectoria**: ${sa.trajectory}`);
    lines.push(`- **Fail count**: ${sa.failCount}`);
    lines.push(`- **Razones**: ${sa.failReasons.join("; ")}`);
    lines.push("");
  }
  if (failedSituations.length > 20) {
    lines.push(`_(... y ${failedSituations.length - 20} más; ver JSON completo)_`);
    lines.push("");
  }
} else {
  lines.push("## ✅ Sin fallas");
  lines.push("");
  lines.push("Las 200 situaciones pasaron las 5 métricas. El bot simulado se comporta correctamente en todos los arquetipos y contextos.");
  lines.push("");
}

// Ruta al JSON completo.
lines.push("## Reporte completo");
lines.push("");
lines.push(
  `El reporte completo con el detalle de cada situación está en \`private-data/reports/bot_simulation_massive_200.json\` (no se commitea porque \`private-data/\` está en \`.gitignore\`).`
);
lines.push("");
lines.push(
  "Para regenerar después de cambios en el prompt o en el bot: `node --experimental-strip-types scripts/generate-massive-report.mjs`."
);
lines.push("");

// ------------------------------------------------------------------
// Escribir los archivos.
// ------------------------------------------------------------------

const REPORT_MD = join(ROOT, "docs", "BOT_MASSIVE_SIMULATION_200_REPORT.md");
const REPORT_JSON = join(
  ROOT,
  "private-data",
  "reports",
  "bot_simulation_massive_200.json"
);

mkdirSync(dirname(REPORT_MD), { recursive: true });
writeFileSync(REPORT_MD, lines.join("\n"), "utf-8");
console.log(`[ok] ${REPORT_MD}`);

mkdirSync(dirname(REPORT_JSON), { recursive: true });
writeFileSync(
  REPORT_JSON,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      total: report.total,
      passCount: report.passCount,
      failCount: report.failCount,
      passRate: report.passRate,
      durationMs: report.durationMs,
      totalMs: totalMs,
      byArchetype: report.byArchetype,
      byMetric: report.byMetric,
      situationAudits: report.situationAudits
    },
    null,
    2
  ),
  "utf-8"
);
console.log(`[ok] ${REPORT_JSON}`);
