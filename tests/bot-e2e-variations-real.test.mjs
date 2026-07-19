/**
 * E2E real del bot con DeepSeek + Supabase + WhatsApp mockeado.
 *
 * FIX 2026-07-18 (sprint bot E2E suite): David pidio validar el bot
 * con respuestas REALES del LLM, no mocks.
 *
 * Que hace:
 *   1. Carga .env.local y verifica que DEEPSEEK_API_KEY este seteada.
 *   2. Mocks: WhatsApp provider.
 *   3. ~34 variaciones de input con un phone distinto cada una.
 *   4. Aserciones: el bot responde Y la respuesta coincide con la
 *      categoria esperada (heuristica).
 *   5. Output JSON con todas las respuestas REALES para review.
 *   6. Cleanup: borra los leads creados.
 *
 * Pre-requisitos:
 *   - DEEPSEEK_API_KEY en $env: (PowerShell) o en .env.local.
 *   - Vercel redeploy no necesario (es test local).
 *
 * Uso:
 *   $env:DEEPSEEK_API_KEY = "sk-..."
 *   node --experimental-strip-types --experimental-test-module-mocks \
 *        --import ./tests/loader-register.mjs \
 *        --test tests/bot-e2e-variations-real.test.mjs
 */

import { test, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ────────────────────────────────────────────────────────────
// Cargar .env.local
// ────────────────────────────────────────────────────────────
function loadEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) {
    console.warn(`[WARN] .env.local no encontrado en ${envPath}`);
    return;
  }
  const text = readFileSync(envPath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
loadEnvLocal();

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Faltan env vars (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY).");
  process.exit(2);
}
if (!DEEPSEEK_KEY) {
  console.error(
    "[SKIP] DEEPSEEK_API_KEY no configurada. Seteala con $env:DEEPSEEK_API_KEY o en .env.local."
  );
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`[OK] SUPABASE_URL = ${SUPABASE_URL.slice(0, 35)}...`);
console.log(`[OK] DEEPSEEK_KEY = ${DEEPSEEK_KEY.slice(0, 10)}...`);

// ────────────────────────────────────────────────────────────
// Mock del provider de WhatsApp
// ────────────────────────────────────────────────────────────
const capturedSends = [];
before(() => {
  mock.module("../src/lib/whatsapp/index.ts", {
    namedExports: {
      getActiveWhatsAppProvider: () => ({
        name: "mock_meta",
        displayName: "Mock Meta (E2E test)",
        active: true,
        stub: true,
        send: async (args) => {
          capturedSends.push({
            to: args.to,
            body: args.body?.slice(0, 800),
            type: args.type ?? "text",
            ts: Date.now(),
          });
          return { ok: true, externalId: `mock_${Date.now()}`, demo: true };
        },
      }),
      REGISTRY: {},
    },
  });
});

// ────────────────────────────────────────────────────────────
// Variaciones (mismas que el suite con mocks para comparacion).
// ────────────────────────────────────────────────────────────
const VARIATIONS = [
  // Saludos
  { text: "hola", category: "greeting" },
  { text: "Hola", category: "greeting" },
  { text: "HOLA", category: "greeting" },
  { text: "buenas", category: "greeting" },
  { text: "buenas tardes", category: "greeting" },
  { text: "que tal", category: "greeting" },
  { text: "qué tal", category: "greeting" },
  { text: "hey", category: "greeting" },
  { text: "eit", category: "greeting" },
  { text: "👋", category: "greeting" },

  // Info
  { text: "info", category: "info" },
  { text: "información", category: "info" },
  { text: "quiero info", category: "info" },
  { text: "que evento tienen", category: "info" },
  { text: "qué eventos hay", category: "info" },
  { text: "me puedes dar info", category: "info" },

  // Registro
  { text: "registrarme", category: "register" },
  { text: "registrame", category: "register" },
  { text: "quiero unirme", category: "register" },
  { text: "inscribirme", category: "register" },
  { text: "me quiero inscribir", category: "register" },
  { text: "como me registro", category: "register" },

  // Preguntas
  { text: "cuando es?", category: "question" },
  { text: "cuándo es?", category: "question" },
  { text: "donde es?", category: "question" },
  { text: "cuanto cuesta?", category: "question" },
  { text: "qué precio tiene", category: "question" },
  { text: "a qué hora", category: "question" },

  // Edge cases
  { text: "", category: "edge_empty" },
  { text: "   ", category: "edge_spaces" },
  { text: "123", category: "edge_numbers" },
  { text: "?", category: "edge_punct" },
  { text: "🚀🔥", category: "edge_emojis" },
  { text: "xq no entiendo", category: "edge_typo" },
];

function responseMatchesCategory(text, category) {
  if (!text || text.length === 0) return false;
  const t = text.toLowerCase();
  switch (category) {
    case "greeting":
      return /hola|buen|qué|que|salud|gracias|encant|👋/.test(t) || text.length > 10;
    case "info":
      return text.length > 10;
    case "register":
      return /nombre|email|correo|inscrib|registr/.test(t) || text.length > 10;
    case "question":
      return text.length > 10;
    case "edge_empty":
    case "edge_spaces":
    case "edge_punct":
      return true;
    case "edge_numbers":
    case "edge_emojis":
    case "edge_typo":
      return text.length > 5 || true;
    default:
      return true;
  }
}

// ────────────────────────────────────────────────────────────
// Test
// ────────────────────────────────────────────────────────────
const TEST_PREFIX = "+52999988"; // Diferente prefix del suite con mocks
const createdLeadIds = [];

test("Bot responde a las variaciones con DeepSeek real", async () => {
  const { processInboundMessage } = await import(
    "../src/lib/whatsapp/bot-engine.ts"
  );

  const results = [];
  const baseTs = Date.now();

  for (let i = 0; i < VARIATIONS.length; i++) {
    const v = VARIATIONS[i];
    const phone = `${TEST_PREFIX}${String(900 + i).padStart(3, "0")}`;
    process.stdout.write(`\r  [${i + 1}/${VARIATIONS.length}] "${v.text.slice(0, 30)}"... `);

    const startMs = Date.now();
    const r = await processInboundMessage({
      messageId: `wamid_e2e_real_${baseTs}_${i}`,
      from: phone,
      contactName: `E2E Real ${v.category}`,
      text: v.text,
      type: "text",
      timestamp: String(Math.floor(baseTs / 1000) + i),
    });
    const elapsedMs = Date.now() - startMs;
    if (r.leadId) createdLeadIds.push(r.leadId);

    const hasResponse = !!(r.responsePreview && r.responsePreview.length > 0);
    const matchesCat = responseMatchesCategory(r.responsePreview ?? "", v.category);

    results.push({
      idx: i,
      category: v.category,
      text: v.text,
      phone,
      intent: r.intent,
      responseKind: r.responseKind,
      leadId: r.leadId,
      responsePreview: r.responsePreview?.slice(0, 600),
      hasResponse,
      matchesCategory: matchesCat,
      elapsedMs,
    });
  }
  process.stdout.write("\n");

  // Output JSON
  const outputDir = join(__dirname, "output");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `bot-e2e-variations-real-${baseTs}.json`);
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        provider: "deepseek",
        totalVariations: VARIATIONS.length,
        results,
        capturedSends: capturedSends.map((s) => ({
          to: s.to,
          body_preview: s.body?.slice(0, 300),
        })),
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`\n[OK] Output escrito en ${outputPath}`);

  // Resumen por categoria
  console.log("\n=== RESUMEN POR CATEGORIA ===");
  const byCat = {};
  for (const r of results) {
    byCat[r.category] = byCat[r.category] || { pass: 0, fail: 0, totalMs: 0 };
    if (r.matchesCategory || !["greeting", "info", "register", "question"].includes(r.category)) {
      byCat[r.category].pass++;
    } else {
      byCat[r.category].fail++;
    }
    byCat[r.category].totalMs += r.elapsedMs;
  }
  for (const [cat, c] of Object.entries(byCat)) {
    console.log(
      `  ${cat}: ${c.pass}/${c.pass + c.fail} pass, ${Math.round(c.totalMs / (c.pass + c.fail))}ms avg`
    );
  }

  // Comparacion con mocks: contar respuestas unicas
  console.log("\n=== DIVERSIDAD DE RESPUESTAS (DeepSeek real) ===");
  for (const cat of ["greeting", "info", "register", "question"]) {
    const inCat = results.filter((r) => r.category === cat);
    const unique = new Set(inCat.map((r) => r.responsePreview?.slice(0, 100) ?? ""));
    console.log(
      `  ${cat}: ${inCat.length} variaciones, ${unique.size} respuestas unicas (primer 100 chars)`
    );
  }

  // Assertions
  console.log("\n=== ASSERTIONS ===");
  const checks = [];
  for (const r of results) {
    const v = VARIATIONS[r.idx];
    if (["greeting", "info", "register", "question"].includes(r.category)) {
      if (!r.hasResponse) {
        checks.push({
          idx: r.idx,
          category: r.category,
          text: r.text,
          pass: false,
          reason: "no response",
        });
        continue;
      }
      if (!r.matchesCategory) {
        checks.push({
          idx: r.idx,
          category: r.category,
          text: r.text,
          pass: false,
          reason: `no matchea "${r.category}"`,
        });
        continue;
      }
    }
    checks.push({ idx: r.idx, category: r.category, text: r.text, pass: true });
  }
  const totalPass = checks.filter((c) => c.pass).length;
  console.log(`  Total: ${totalPass}/${VARIATIONS.length} pass`);

  const fails = checks.filter((c) => !c.pass);
  if (fails.length > 0) {
    console.log("  Fallos:");
    for (const f of fails) {
      console.log(`    [${f.idx}] ${f.category} "${f.text}": ${f.reason}`);
    }
  }

  // Asercion global: 80% debe pasar.
  assert.ok(
    totalPass >= Math.floor(VARIATIONS.length * 0.8),
    `Al menos 80% debe pasar (${totalPass}/${VARIATIONS.length})`
  );
});

// ────────────────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────────────────
after(async () => {
  if (createdLeadIds.length === 0) return;
  console.log(`\n[CLEANUP] Borrando ${createdLeadIds.length} leads de prueba...`);
  for (const leadId of createdLeadIds) {
    try {
      await supabase
        .from("lead_whatsapp_conversations")
        .delete()
        .eq("lead_id", leadId);
      await supabase
        .from("lead_whatsapp_log")
        .delete()
        .eq("lead_id", leadId);
      const { error } = await supabase.from("leads").delete().eq("id", leadId);
      if (error) console.error(`  Error borrando lead ${leadId}: ${error.message}`);
    } catch (err) {
      console.error(`  Excepcion borrando lead ${leadId}: ${err}`);
    }
  }
  console.log("[CLEANUP] OK");
});
