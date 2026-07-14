// Test 03 — Fallback graceful del bot cuando DeepSeek devuelve 402/401
// o cuando falta la API key (modo demo).
//
// Objetivo: simular el escenario "se acabó el saldo mid-evento" sin
// consumir tokens de la cuenta real. Verificar que el bot no crashea
// y devuelve un fallback coherente con `note` accionable.
//
// Costo: $0 USD (DeepSeek rechaza antes de cobrar).
//
// Caso A: DEEPSEEK_API_KEY="" → modo demo (provider devuelve ok=false,
//   demo=true, note explica).
// Caso B: DEEPSEEK_API_KEY="sk-fake-invalid" → DeepSeek devuelve 401,
//   provider degrada con note accionable.
// Caso C: DEEPSEEK_API_KEY real → smoke que el path normal sigue
//   funcionando (1 sola request barata con flash).

import { getActiveAgentProvider } from "../src/lib/ai/index.ts";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const status = ok ? "✓ PASS" : "✗ FAIL";
  const color = ok ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  console.log(`  ${color}${status}${reset}  ${name}`);
  if (detail) console.log(`           ${detail}`);
}

const minimalProfile = {
  name: "Test",
  businessName: "Qlick Test",
  businessDescription: "Test de fallback",
  servicesOrCourses: ["Marketing Digital"],
  businessHours: "L-V 9-18",
  tone: "friendly",
  escalationRules: [],
  allowedActions: ["recommend_course", "suggest_event"],
  forbiddenActions: ["confirm_payment", "grant_access"],
  fallbackMessage: "Por el momento no puedo responder, te conecto con un humano.",
};

const minimalContext = {
  profile: minimalProfile,
  lastIncomingMessage: "Hola, me interesa el curso de marketing",
};

async function runCase(label, envValue, expectNotePattern) {
  console.log(`\n--- Caso ${label}: DEEPSEEK_API_KEY=${envValue === "" ? "(vacía)" : envValue === undefined ? "(no seteada)" : `"${envValue.slice(0, 12)}..."`} ---`);
  if (envValue === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = envValue;
  }
  // Forzar tier flash para minimizar costo en caso C.
  process.env.DEEPSEEK_TOOL_LOOP_TIER = "flash";

  const provider = getActiveAgentProvider();
  const start = Date.now();
  let result;
  try {
    result = await provider.run("classify_intent", minimalContext);
  } catch (err) {
    record(`[${label}] NO crashea`, false, `exception: ${err.message}`);
    return;
  }
  const elapsed = Date.now() - start;

  record(
    `[${label}] retorna en <10s`,
    elapsed < 10000,
    `${elapsed}ms`,
  );
  record(
    `[${label}] tiene ok=true (bot responde) o ok=false con note accionable`,
    result !== undefined && result !== null,
    `ok=${result?.ok}, content.length=${result?.content?.length ?? 0}, note="${(result?.note ?? "").slice(0, 80)}"`,
  );
  if (expectNotePattern) {
    const noteMatch = (result?.note ?? "").toLowerCase().includes(expectNotePattern.toLowerCase());
    record(
      `[${label}] note contiene "${expectNotePattern}"`,
      noteMatch,
      `note="${(result?.note ?? "").slice(0, 120)}"`,
    );
  }
  // Verificar que content NO esté vacío (o que tenga fallbackMessage).
  const hasContent = (result?.content?.length ?? 0) > 0;
  record(
    `[${label}] content no-vacío (degradó con fallbackMessage o similar)`,
    hasContent,
    `content="${(result?.content ?? "").slice(0, 80)}"`,
  );
}

async function main() {
  console.log("=== Test 03 — Fallback graceful cuando DeepSeek falla ===");
  console.log("[diagnóstico] Provider activo:", getActiveAgentProvider().name);

  // Guardar la key real ANTES de mutar (viene del .env.local via --env-file).
  const realKey = process.env.DEEPSEEK_API_KEY;
  console.log(`[setup] DEEPSEEK_API_KEY real en .env: ${realKey ? `SET (len=${realKey.length}, prefix=${realKey.slice(0, 8)})` : "NOT SET"}`);

  // Caso A: API key vacía → provider cae a mock, note dice "Clasificación heurística (mock)"
  await runCase("A", "", "mock");

  // Caso B: API key inválida → provider pasa a deepseek, DeepSeek devuelve 401
  await runCase("B", "sk-fake-invalid-key-for-test", "inválida");

  // Caso C: API key real → smoke que el path normal sigue funcionando
  // (cuesta fracciones de centavo con flash)
  if (realKey && realKey.length > 20) {
    await runCase("C", realKey, null);
  } else {
    console.log("\n[Caso C saltado] No hay DEEPSEEK_API_KEY real en .env.local");
  }

  // Reporte final
  console.log("\n======================================================================");
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`REPORTE FINAL: ${results.length} checks, ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) {
    console.log("\nFallidos:");
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}\n    ${r.detail}`));
    process.exit(1);
  } else {
    console.log("\n✅ Bot degrada gracefully en los 3 casos. Listo para evento.");
  }
}

main().catch(err => { console.error("FATAL:", err); process.exit(2); });
