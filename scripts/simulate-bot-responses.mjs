// Simulación de conversaciones del bot con el simulator real.
// Sin drenar DeepSeek (usa mock provider porque DEEPSEEK_API_KEY está
// comentada en .env.local).
//
// Para tener respuestas REALES, David debe:
//   1. Configurar DEEPSEEK_API_KEY en .env.local (uncomment la línea)
//   2. Re-correr este script
//
// Output: archivo output/simulacion-bot-<timestamp>.md con las
// respuestas del bot a 10 preguntas representativas.

import { test, mock, before } from "node:test";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// Mock Supabase
function makeMockSupabaseClient() {
  const chain = () => chain;
  const handler = {
    get(_t, prop) {
      if (prop === "maybeSingle") return async () => ({ data: null, error: null });
      if (prop === "single") return async () => ({ data: null, error: null });
      if (prop === "select") return (..._a) => chain;
      if (prop === "eq") return (..._a) => chain;
      if (prop === "in") return (..._a) => chain;
      if (prop === "order") return (..._a) => chain;
      if (prop === "limit") return (..._a) => chain;
      if (prop === "update") return (..._a) => chain;
      if (prop === "insert") return (..._a) => chain;
      if (prop === "delete") return (..._a) => chain;
      if (prop === "upsert") return (..._a) => chain;
      if (prop === "then") {
        return Promise.resolve().then.bind(
          Promise.resolve({ data: null, error: null, count: 0 }),
        );
      }
      return chain;
    },
  };
  return { from: () => new Proxy(function () {}, handler) };
}

before(() => {
  mock.module("../src/lib/supabase/admin", {
    namedExports: {
      createSupabaseAdminClient: () => makeMockSupabaseClient(),
    },
  });
  mock.module("../src/lib/supabase/health", {
    namedExports: {
      checkSupabaseConfig: () => ({ configured: true, mode: "configured" }),
    },
  });
});

// 10 preguntas representativas
const QUESTIONS = [
  {
    id: 1,
    label: "Welcome inicial",
    message: "Hola",
    history: [],
  },
  {
    id: 2,
    label: "Pregunta por evento (qué es)",
    message: "¿De qué trata el taller?",
    history: [{ role: "user", content: "Hola" }],
  },
  {
    id: 3,
    label: "Pregunta por precio",
    message: "¿Cuánto cuesta?",
    history: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! Te interesa el taller de Marketing + IA..." },
    ],
  },
  {
    id: 4,
    label: "Pregunta por lugar",
    message: "¿Dónde es?",
    history: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! Te interesa el taller..." },
    ],
  },
  {
    id: 5,
    label: "Pregunta por formato",
    message: "¿Es presencial o virtual?",
    history: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! Te interesa..." },
    ],
  },
  {
    id: 6,
    label: "Pregunta por constancia",
    message: "¿Dan constancia?",
    history: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! Te interesa..." },
    ],
  },
  {
    id: 7,
    label: "Fuera de scope (venden café)",
    message: "¿Venden café?",
    history: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! Te interesa..." },
    ],
  },
  {
    id: 8,
    label: "Quiero inscribirme",
    message: "Quiero inscribirme",
    history: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! Te interesa..." },
    ],
  },
  {
    id: 9,
    label: "Captura nombre",
    message: "Juan Pérez",
    history: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! Te interesa..." },
      { role: "user", content: "Quiero inscribirme" },
      { role: "assistant", content: "¡Qué bueno! Para apartarte tu lugar, mándame tu nombre completo y correo." },
    ],
  },
  {
    id: 10,
    label: "Handoff humano",
    message: "Quiero hablar con un humano",
    history: [
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola! Te interesa..." },
    ],
  },
];

async function runSimulations() {
  const { simulateConversationTurn } = await import(
    "../src/lib/ai/simulator.ts"
  );

  const results = [];
  for (const q of QUESTIONS) {
    try {
      const result = await simulateConversationTurn({
        message: q.message,
        history: q.history,
        leadContext: null,
        modeOverride: null,
      });
      results.push({
        id: q.id,
        label: q.label,
        user: q.message,
        reply: result.reply ?? "(sin respuesta)",
        provider: result.provider ?? "mock",
        usage: result.usage ?? null,
        note: result.note ?? null,
      });
    } catch (err) {
      results.push({
        id: q.id,
        label: q.label,
        user: q.message,
        reply: `ERROR: ${err instanceof Error ? err.message : String(err)}`,
        provider: "error",
        usage: null,
        note: null,
      });
    }
  }
  return results;
}

// Ejecutar
const { after } = await import("node:test");
after(async () => {
  const results = await runSimulations();

  // Output markdown
  const outputDir = join(ROOT, "output");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = join(outputDir, `simulacion-bot-${timestamp}.md`);

  let md = `# Simulación de respuestas del bot\n\n`;
  md += `Fecha: ${new Date().toISOString()}\n`;
  md += `Provider: ${results[0]?.provider ?? "unknown"}\n`;
  md += `Total preguntas: ${results.length}\n\n`;
  md += `> NOTA: si provider="mock", el bot NO está usando LLM real (DEEPSEEK_API_KEY está comentada en .env.local). Las respuestas son heurísticas del mock provider. Para ver respuestas REALES, descomentar la línea y re-correr.\n\n`;
  md += `---\n\n`;

  for (const r of results) {
    md += `## ${r.id}. ${r.label}\n\n`;
    md += `**Usuario:** ${r.user}\n\n`;
    md += `**Bot:** ${r.reply}\n\n`;
    if (r.usage) {
      md += `**Tokens:** ${JSON.stringify(r.usage)}\n\n`;
    }
    if (r.note) {
      md += `**Nota:** ${r.note}\n\n`;
    }
    md += `---\n\n`;
  }

  writeFileSync(outputPath, md, { encoding: "utf-8" });
  console.log(`[OK] Simulación escrita en ${outputPath}`);

  // También imprimir resumen en consola
  console.log("\n=== RESUMEN ===");
  for (const r of results) {
    console.log(`\n[${r.id}] ${r.label}`);
    console.log(`  User: ${r.user.slice(0, 60)}`);
    console.log(`  Bot:  ${r.reply.slice(0, 100).replace(/\n/g, " ")}${r.reply.length > 100 ? "..." : ""}`);
  }
});

test("placeholder", () => {});
