/**
 * Prefill de reglas del bot vía DeepSeek.
 *
 * Dado el título + description de un evento, sugiere:
 *   - personality: una de "seria" | "casual" | "con humor" | "supervendedor"
 *     (o custom string si el LLM detecta algo más apropiado)
 *   - rules: array de 3-7 strings con reglas operativas para el bot
 *
 * Usado por el admin para acelerar la creación de eventos. El resultado
 * es SIEMPRE editable a mano antes de guardar.
 *
 * Server-only. Lee DEEPSEEK_API_KEY + DEEPSEEK_MODEL del env.
 */

import type { EventBotRules } from "@/types/events";

export interface PrefillEventRulesInput {
  title: string;
  description?: string | null;
  /** Personalidad actual (opcional). Si existe, el LLM intenta mantenerla o proponer upgrade. */
  existingPersonality?: string;
}

export interface PrefillEventRulesResult {
  ok: boolean;
  rules?: EventBotRules;
  rawResponse?: string;
  note: string;
}

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const SYSTEM_PROMPT = `Eres un asistente que sugiere reglas de comportamiento para un bot de WhatsApp de eventos.

El admin te da título + descripción de un evento. Tú devuelves JSON con:
{
  "personality": "seria" | "casual" | "con humor" | "supervendedor" | <string custom>,
  "rules": ["regla 1", "regla 2", ...]
}

REGLAS para tu output:
- personality: elegí la que mejor encaje con el tono del evento. Si nada matchea, devolvé un string custom corto (max 30 chars).
- rules: 3 a 7 reglas operativas, cada una UNA línea (max 120 chars).
- Las reglas deben reflejar:
  * Lo que el bot DEBE hacer (ej: "Mencionar precio solo si preguntan")
  * Lo que el bot NO DEBE hacer (ej: "No manejar descuentos")
  * Tono o limites (ej: "Hablar siempre en español neutro, sin anglicismos")
- Regla dura SIEMPRE presente en algún item: "Si no sabes, decir que no tienes la info, no inventar"
- NO inventes info que no esté en la description. NO asumas precio/modalidad/cupo si no están.
- Devolvé SOLO el JSON, sin markdown ni explicaciones.`;

/**
 * Llama DeepSeek y devuelve las reglas pre-llenadas.
 *
 * Best-effort: si DeepSeek falla o devuelve algo inválido, devolvemos
 * ok:false con la razón. El admin puede entonces escribir a mano.
 */
export async function prefillEventRules(
  input: PrefillEventRulesInput,
): Promise<PrefillEventRulesResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      note: "DEEPSEEK_API_KEY no configurada en el servidor.",
    };
  }

  const userPrompt = [
    `Título del evento: ${input.title}`,
    input.description
      ? `Descripción: ${input.description}`
      : "(sin descripción — solo título)",
    input.existingPersonality
      ? `Personalidad actual: ${input.existingPersonality}`
      : "",
    "",
    "Devolvé el JSON con personality + rules.",
  ]
    .filter(Boolean)
    .join("\n");

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.5
      })
    });
    if (!res.ok) {
      return {
        ok: false,
        note: `DeepSeek HTTP ${res.status}`,
      };
    }
    data = (await res.json()) as typeof data;
  } catch (err) {
    return {
      ok: false,
      note: `DeepSeek error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    return { ok: false, note: "DeepSeek no devolvio contenido." };
  }

  // Parseamos el JSON. Limpiamos fences markdown por si el modelo las puso.
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: { personality?: unknown; rules?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      ok: false,
      rawResponse: content,
      note: "DeepSeek devolvio algo que no es JSON valido.",
    };
  }

  const personality =
    typeof parsed.personality === "string" && parsed.personality.trim().length > 0
      ? parsed.personality.trim().slice(0, 50)
      : "";
  const rulesRaw = Array.isArray(parsed.rules) ? parsed.rules : [];
  const rules = rulesRaw
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && r.length <= 200)
    .slice(0, 10);

  if (personality === "" && rules.length === 0) {
    return {
      ok: false,
      rawResponse: content,
      note: "DeepSeek devolvio JSON vacio.",
    };
  }

  return {
    ok: true,
    rules: { personality, rules },
    rawResponse: content,
    note: "OK",
  };
}