// Test 01 — Test de carga pre-evento.
//
// Simula 50 conversaciones simultáneas contra el bot-engine usando
// DeepSeek Flash (tier barato, mismo endpoint que producción) y mide
// latencia p50/p95/p99/max, errores y timeouts.
//
// Escenario: el día del evento David tiene 32 confirmados + leads
// nuevos entrando. Si hay un bug latente en el bot-engine que solo
// aparece bajo concurrencia, lo descubrimos acá o el día del evento.
//
// Costo: ~$0.0025 USD con flash (50 calls × ~500 tokens × $0.0001/1k).
//
// Salida: tabla con stats + lista de errores si los hubo.

import { processInboundMessage } from "../src/lib/whatsapp/bot-engine.ts";
import {
  createSyntheticLead,
  deleteAllSyntheticLeads,
} from "../src/lib/whatsapp/synthetic-leads.ts";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin.ts";

// Mensajes variados (8 tipos × N repeticiones) para no probar siempre
// el mismo path del bot-engine.
const messageTemplates = [
  { text: "Hola, me interesa el curso de marketing digital", expect: "greeting" },
  { text: "Cuánto cuesta el diplomado?", expect: "pricing" },
  { text: "Quiero registrarme al próximo evento", expect: "register" },
  { text: "Cuál es el temario?", expect: "question" },
  { text: "Tienen cursos de IA para marketing?", expect: "course" },
  { text: "Quiero hablar con un asesor humano", expect: "escalate" },
  { text: "Mi nombre es Ana López, ana.lopez@example.com", expect: "contact" },
  { text: "No me interesa, gracias", expect: "optout" },
];

function buildMessage(phone, text, contactName) {
  return {
    messageId: `loadtest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    from: phone,
    timestamp: new Date().toISOString(),
    type: "text",
    text,
    contactName,
  };
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  const N = 50;
  const TIMEOUT_MS = 15_000; // 15s por conversación, el doble del peor caso observado

  console.log(`=== Test 01 — Carga concurrente (${N} conversaciones, deepseek flash) ===`);
  console.log(`[setup] DEEPSEEK_API_KEY len: ${process.env.DEEPSEEK_API_KEY?.length ?? 0}`);
  console.log(`[setup] DEEPSEEK_TOOL_LOOP_TIER: ${process.env.DEEPSEEK_TOOL_LOOP_TIER ?? "(default pro)"}`);

  const sb = createSupabaseAdminClient();
  console.log(`[setup] Creando ${N} leads sintéticos...`);

  // Crear N leads sintéticos con teléfonos únicos.
  const leads = [];
  for (let i = 0; i < N; i++) {
    const phone = `+5255555${String(40000 + i).padStart(5, "0")}`;
    const tpl = messageTemplates[i % messageTemplates.length];
    const lead = await createSyntheticLead(sb, {
      phone,
      name: tpl.text.split(" ").slice(0, 2).join(" "),
    });
    leads.push({ lead, template: tpl, phone });
  }
  console.log(`[setup] ${leads.length} leads listos.`);

  // Disparar processInboundMessage en paralelo, midiendo latencia.
  console.log(`\n[carga] Disparando ${N} conversaciones en paralelo...`);
  const startAll = Date.now();
  const results = await Promise.allSettled(
    leads.map(async ({ lead, template, phone }, i) => {
      const start = Date.now();
      try {
        const result = await Promise.race([
          processInboundMessage(buildMessage(phone, template.text, lead?.name)),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`TIMEOUT ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
          ),
        ]);
        return {
          i,
          phone,
          intent: template.expect,
          elapsed: Date.now() - start,
          ok: result?.ok === true,
          preview: (result?.body ?? result?.outbound?.body ?? "").slice(0, 60),
        };
      } catch (err) {
        return {
          i,
          phone,
          intent: template.expect,
          elapsed: Date.now() - start,
          ok: false,
          error: err.message,
        };
      }
    })
  );
  const totalElapsed = Date.now() - startAll;

  // Cleanup: borrar todos los leads sintéticos (cascade borra conversaciones).
  console.log(`[cleanup] Borrando ${leads.length} leads sintéticos...`);
  await deleteAllSyntheticLeads(sb);

  // Análisis
  const fulfilled = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);
  const failed = fulfilled.filter(r => !r.ok);
  const successful = fulfilled.filter(r => r.ok);
  const latencies = successful.map(r => r.elapsed);

  const stats = {
    total: N,
    ok: successful.length,
    fail: failed.length,
    pctOk: ((successful.length / N) * 100).toFixed(1) + "%",
    wallClockMs: totalElapsed,
    throughputPerSec: (N / (totalElapsed / 1000)).toFixed(2),
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies.length > 0 ? Math.max(...latencies) : 0,
    min: latencies.length > 0 ? Math.min(...latencies) : 0,
  };

  console.log("\n======================================================================");
  console.log("RESULTADOS");
  console.log("======================================================================");
  console.log(`Total:                ${stats.total}`);
  console.log(`OK:                   ${stats.ok} (${stats.pctOk})`);
  console.log(`Fallos:               ${stats.fail}`);
  console.log(`Wall clock:           ${stats.wallClockMs}ms (throughput ${stats.throughputPerSec} conv/s)`);
  console.log(`Latencia OK:`);
  console.log(`  min:                ${stats.min}ms`);
  console.log(`  p50:                ${stats.p50}ms`);
  console.log(`  p95:                ${stats.p95}ms`);
  console.log(`  p99:                ${stats.p99}ms`);
  console.log(`  max:                ${stats.max}ms`);

  if (failed.length > 0) {
    console.log(`\nFallos (${failed.length}):`);
    failed.forEach(f => {
      console.log(`  ✗ [#${f.i}] ${f.phone} intent=${f.intent} elapsed=${f.elapsed}ms`);
      console.log(`    error: ${f.error ?? "(sin mensaje)"}`);
    });
  }

  // Veredicto
  console.log("\n======================================================================");
  const passP95 = stats.p95 < 8000; // 8s p95 con deepseek flash es razonable
  const passOk = stats.pctOk === "100.0%";
  if (passP95 && passOk) {
    console.log(`✅ VEREDICTO: Bot-engine aguanta ${N} conversaciones concurrentes.`);
    console.log(`   p95 = ${stats.p95}ms < 8000ms (umbral evento).`);
    console.log(`   Listo para 10 jul con 32 confirmados + leads nuevos.`);
  } else {
    console.log(`❌ VEREDICTO: Hay problemas bajo carga.`);
    if (!passOk) console.log(`   - ${stats.fail} conversaciones fallaron (no debería ser ninguna).`);
    if (!passP95) console.log(`   - p95 = ${stats.p95}ms > 8000ms (umbral evento).`);
  }
  process.exit(passP95 && passOk ? 0 : 1);
}

main().catch(err => { console.error("FATAL:", err); process.exit(2); });
