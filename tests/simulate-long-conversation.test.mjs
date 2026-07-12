/**
 * Simulación Larga de Conversación (6 Turnos) — Sprint v0.9.7 / Benchmark.
 *
 * Verifica el comportamiento del bot en un embudo completo de 6 turnos
 * en modo Súper Ejecutivo (free_masterclass), evaluando:
 *   1. Saludo e interés inicial.
 *   2. Brevedad ante pregunta de costos.
 *   3. Manejo de objeción (constancia/diploma).
 *   4. Escudo Anti-Alucinación ante pedido de registro de terceros (acompañantes).
 *   5. Captura de datos del titular (extract_and_save_contact_info).
 *   6. Cierre conciso ante ACK final.
 */

import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SIMULATOR_URL = pathToFileURL(path.join(ROOT, "src/lib/ai/simulator.ts")).href;
const PROMPTS_URL = pathToFileURL(path.join(ROOT, "src/lib/ai/agent-prompts.ts")).href;

globalThis.__simLongState = {
  lastPrompt: "",
  toolsCalledCount: 0,
  turnHistory: []
};

function setupMocks() {
  mock.module("../src/lib/ai/deepseek-provider.ts", {
    namedExports: {
      deepseekAgentProvider: {
        name: "deepseek",
        displayName: "DeepSeek (Simulación Larga)",
        active: true,
        stub: false,
        run: async (task, context) => {
          const prompt = context?.systemPromptOverride || "";
          globalThis.__simLongState.lastPrompt = prompt;
          const lastMsg = context?.lastIncomingMessage?.toLowerCase() || "";

          const hasAntiHallucination = prompt.includes("LÍMITE TÉCNICO DE REGISTRO");
          const hasGuestTool =
            prompt.includes("REGISTRO DE ACOMPAÑANTES") ||
            prompt.includes("add_event_guest");
          const hasWhatsAppStyle = prompt.includes("REGLAS DE FORMATO Y ESTILO WHATSAPP");

          let reply = "";
          let intent = "question";
          const toolsCalled = [];

          if (lastMsg.includes("de qué trata") || lastMsg.includes("hola")) {
            reply = "¡Hola! En la Audit Masterclass aprenderás a auditar tu negocio en 30 minutos. Es en vivo y gratuita. ¿Me compartes tu nombre y correo para apartarte tu lugar?";
          } else if (lastMsg.includes("costo") || lastMsg.includes("precio")) {
            reply = "Es 100% gratuita 🎁 Solo confírmame tu nombre completo y correo para mandarte tu enlace personal.";
          } else if (lastMsg.includes("constancia") || lastMsg.includes("diploma")) {
            reply = "¡Qué buena pregunta! No se entrega constancia, pero te aseguro que te llevarás herramientas muy prácticas desde el día 1. ¿Me compartes tu nombre y correo para registrarte?";
          } else if (lastMsg.includes("socio") || lastMsg.includes("hermano") || lastMsg.includes("carlos")) {
            // Sprint v0.9.8: la tool add_event_guest SÍ existe, así
            // que el LLM puede confirmar al titular Y al acompañante.
            if (hasGuestTool) {
              reply = "¡Perfecto! Quedas registrado tú y también tu socio Carlos como tu acompañante 🎯";
            } else if (hasAntiHallucination) {
              // Fallback al copy anti-alucinación del sprint v0.9.7
              // (ya mergeado antes; lo conservamos por seguridad).
              reply = "Por aquí solo puedo asociar un registro por número de WhatsApp para mandarte tu acceso personal. Te confirmo a ti, y si gustas compártele nuestro número o el enlace a tu socio Carlos para que nos mande un hola desde su WhatsApp y asegurarle su propio lugar sin problema 🎯";
            } else {
              reply = "¡Claro que sí! Quedan registrados tú y tu socio Carlos.";
            }
          } else if (lastMsg.includes("@") || lastMsg.includes("pérez")) {
            intent = "lead_capture";
            toolsCalled.push({
              name: "extract_and_save_contact_info",
              args: { name: "Juan Pérez", email: "juan@qlick.app" }
            });
            globalThis.__simLongState.toolsCalledCount++;
            reply = "¡Perfecto, Juan! Ya quedó tu registro con el correo juan@qlick.app. En unos minutos te enviamos el enlace de acceso.";
          } else if (lastMsg.includes("gracias") || lastMsg.includes("listo")) {
            intent = "ack";
            reply = "¡A ti, Juan! Nos vemos en la Masterclass. Cualquier duda por aquí andamos.";
          } else {
            reply = "¿Me compartes tu nombre y correo para apartar tu lugar gratuito?";
          }

          return {
            ok: true,
            task,
            provider: "deepseek",
            content: reply,
            intent,
            confidence: 0.95,
            needsReview: false,
            demo: true,
            note: "Simulado para prueba larga (6 turnos)",
            usage: {
              promptTokens: 850,
              completionTokens: 60,
              totalTokens: 910,
              costCents: 1,
              model: "deepseek-chat"
            }
          };
        }
      },
      pickSystemPromptForMode: async () => "MOCK_SYSTEM_PROMPT",
      isSocraticNoToolsMode: async () => false,
      isDeepseekToolsEnabled: () => false,
      _chooseTierForTest: () => "flash",
      _readTierConfigForTest: () => ({}),
      _isDeepseekToolsEnabledForTest: () => false,
      _pickFallbackForTest: () => "fallback",
      _runWithToolLoopForTest: async () => ({}),
      _runWithTimeoutForTest: () => ({})
    }
  });

  mock.module("../src/lib/supabase/admin.ts", {
    namedExports: {
      createSupabaseAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null })
            })
          })
        })
      })
    }
  });
}

before(() => {
  setupMocks();
});

test("Simulación Larga de 6 Turnos: Embudo Completo de Conversación", async () => {
  const { simulateConversationTurn } = await import(SIMULATOR_URL);

  const history = [];

  // Turno 1: Saludo e interés
  const t1 = await simulateConversationTurn({
    message: "Hola, de qué trata la masterclass?",
    history: [...history],
    modeOverride: "super_executive",
    tierOverride: "flash",
    includeEventContext: true,
    includeInjectedRules: true,
    leadContext: null
  });
  assert.equal(t1.ok, true);
  assert.ok(t1.reply.includes("Audit Masterclass"));
  history.push({ role: "lead", content: "Hola, de qué trata la masterclass?", direction: "inbound" });
  history.push({ role: "assistant", content: t1.reply, direction: "outbound" });

  // Turno 2: Pregunta por costo (Evaluando brevedad y estilo WhatsApp)
  const t2 = await simulateConversationTurn({
    message: "qué costo tiene?",
    history: [...history],
    modeOverride: "super_executive",
    tierOverride: "flash",
    includeEventContext: true,
    includeInjectedRules: true,
    leadContext: null
  });
  assert.equal(t2.ok, true);
  assert.ok(t2.reply.includes("100% gratuita"));
  assert.ok(!t2.reply.includes("Te paso los detalles y el enlace para que finalices tu registro gratuito en la plataforma 🎯"));
  history.push({ role: "lead", content: "qué costo tiene?", direction: "inbound" });
  history.push({ role: "assistant", content: t2.reply, direction: "outbound" });

  // Turno 3: Pregunta por constancia
  const t3 = await simulateConversationTurn({
    message: "otorgan constancia o diploma al finalizar?",
    history: [...history],
    modeOverride: "super_executive",
    tierOverride: "flash",
    includeEventContext: true,
    includeInjectedRules: true,
    leadContext: null
  });
  assert.equal(t3.ok, true);
  assert.ok(t3.reply.includes("No se entrega constancia"));
  history.push({ role: "lead", content: "otorgan constancia o diploma al finalizar?", direction: "inbound" });
  history.push({ role: "assistant", content: t3.reply, direction: "outbound" });

  // Turno 4: Intento de registro múltiple / acompañante (Evaluando anti-alucinación)
  const t4 = await simulateConversationTurn({
    message: "puedes registrarme a mi y a mi socio Carlos?",
    history: [...history],
    modeOverride: "super_executive",
    tierOverride: "flash",
    includeEventContext: true,
    includeInjectedRules: true,
    leadContext: null
  });
  assert.equal(t4.ok, true);
  // Sprint v0.9.8: con la tool add_event_guest, el bot SÍ puede
  // confirmar al titular Y al acompañante sin alucinar.
  assert.ok(
    t4.reply.includes("Quedas registrado") && t4.reply.includes("socio Carlos"),
    "El bot confirma al titular Y al socio Carlos tras llamar a la tool"
  );
  history.push({ role: "lead", content: "puedes registrarme a mi y a mi socio Carlos?", direction: "inbound" });
  history.push({ role: "assistant", content: t4.reply, direction: "outbound" });

  // Turno 5: Entrega de datos del titular
  const t5 = await simulateConversationTurn({
    message: "Juan Pérez, juan@qlick.app",
    history: [...history],
    modeOverride: "super_executive",
    tierOverride: "flash",
    includeEventContext: true,
    includeInjectedRules: true,
    leadContext: null
  });
  assert.equal(t5.ok, true);
  assert.ok(t5.reply.includes("Ya quedó tu registro"));
  history.push({ role: "lead", content: "Juan Pérez, juan@qlick.app", direction: "inbound" });
  history.push({ role: "assistant", content: t5.reply, direction: "outbound" });

  // Turno 6: Agradecimiento y ACK final
  const t6 = await simulateConversationTurn({
    message: "listo mil gracias nos vemos el jueves",
    history: [...history],
    modeOverride: "super_executive",
    tierOverride: "flash",
    includeEventContext: true,
    includeInjectedRules: true,
    leadContext: null
  });
  assert.equal(t6.ok, true);
  assert.ok(t6.reply.includes("Nos vemos en la Masterclass"));

  // Verificamos que las directivas se inyectaron
  assert.ok(globalThis.__simLongState.lastPrompt.includes("REGLAS DE FORMATO Y ESTILO WHATSAPP"));
  // Sprint v0.9.8: el bloque anti-alucinación del sprint v0.9.7 fue
  // REEMPLAZADO por el bloque "REGISTRO DE ACOMPAÑANTES" con la tool
  // add_event_guest. El nuevo copy instruye al LLM a usar la tool.
  assert.ok(globalThis.__simLongState.lastPrompt.includes("REGISTRO DE ACOMPAÑANTES"));
  assert.ok(globalThis.__simLongState.lastPrompt.includes("add_event_guest"));
});
