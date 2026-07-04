/**
 * Safety net para respuestas del bot de WhatsApp.
 *
 * **Problema original (G-3, 2026-07-02):** el LLM repetía "Hola Por, gracias
 * por escribir a Qlick..." en cada turno, ignorando el system prompt y el
 * task prompt que le decían NO saludar si hay historial.
 *
 * **Solución (3 capas, defensa-en-profundidad):**
 *   1. **System prompt** (`buildSystemPrompt` con `isFirstMessage=false`) —
 *      instruye al LLM no saludar. Cubierto por `whatsapp-bot-greeting.test.mjs`.
 *   2. **Task prompt** (`buildTaskPrompt` con historial) — inyecta
 *      recordatorio crítico. Cubierto por `whatsapp-bot-greeting.test.mjs`.
 *   3. **Safety net post-process** (esta función) — strip mecánico del
 *      saludo si la respuesta del LLM empieza con uno de los 6 patrones
 *      conocidos, sin importar lo que el LLM haya decidido.
 *
 * **Cuándo se llama:** desde `processInboundMessage` en `bot-engine.ts`,
 * DESPUÉS de obtener la respuesta del LLM, ANTES de validar guardrails y
 * ANTES de enviar al lead.
 *
 * **Por qué existe como capa separada:** el LLM a veces ignora los prompts.
 * El safety net es el último recurso — no queremos que un lead que ya
 * conversó 3 veces reciba un 4to "Hola" porque el modelo decidió saludar.
 *
 * **Por qué se extrajo a este módulo:** para poder testearlo sin levantar
 * todo el flujo del bot-engine (Supabase, Meta API, etc.). Pure function.
 *
 * Server-only.
 *
 * @server
 */

/* ─────────────────────────────────────────────────────────────
 * Regex del safety net — orden importa
 * ─────────────────────────────────────────────────────────────
 * Cada regex strippea UN prefijo de saludo conocido. Se aplican en orden:
 * el primero que matchea gana (el replace es greedy). Después del replace
 * aplicamos `.trim()` para limpiar whitespace residual.
 *
 * Si TODAS las regex fallan, devolvemos el content original (no tocamos
 * la respuesta del LLM). Esto preserva respuestas que NO son saludos.
 *
 * Si el strippeado queda VACÍO (content era 100% saludo), devolvemos el
 * original. Defensivo: nunca devolvemos string vacío al lead.
 */
const GREETING_PATTERNS: readonly RegExp[] = [
  // 1. "Hola, ..." / "Buenas tardes, ..." / "Qué tal, ..." / "Hi, ..." / "Hello, ..."
  /^\s*(hola|buen[oa]s\s+(d[ií]as|tardes|noches)|qué tal|hi|hello)[,.\s]*/i,

  // 2. "Hola Por, ..." / "Hola David, ..." (presentación con nombre)
  /^\s*hola[,\s]+[^,.\n]{1,30}[,.\s]*/i,

  // 3. "Por, gracias por escribir a Qlick..." (sin Hola, con nombre)
  /^\s*[A-Z][a-záéíóú]+,\s*gracias por (escribir|contactarnos|comunicarte)[,.\s]*/i,

  // 4. "Gracias por escribir a Qlick..." (sin nombre)
  /^\s*gracias por (escribir|contactarnos|comunicarte)[,.\s]*/i,

  // 5. "Soy Qlick, asistente..." (presentación del bot sin saludo)
  /^\s*soy\s+qlick[,\s]+asistente.*?[.\n]/i,

  // 6. "¡Hola Por!" (con admiración al inicio, sin coma)
  /^\s*¡?\s*hola[¡!.,\s]+[^¡!.,\n]{1,30}!?\s*/i
];

/**
 * Strip del prefijo de saludo si:
 *   - `hasHistory` es true (= NO es el primer mensaje del lead).
 *   - El content empieza con uno de los 6 patrones conocidos.
 *
 * Si `hasHistory` es false, devuelve content intacto (mensaje welcome — el
 * saludo es esperado).
 *
 * Si el strippeado queda vacío, devuelve el content original (defensivo:
 * nunca devolvemos string vacío al lead).
 *
 * **Pure function.** No toca I/O, no instancia nada. Toma strings y
 * devuelve string.
 *
 * @param content  respuesta cruda del LLM (o fallback).
 * @param hasHistory  `true` si el lead ya tenía historial cuando llegó este mensaje.
 * @returns content con saludo strippeado, o content original si nada matchea.
 */
export function stripGreetingIfHasHistory(
  content: string,
  hasHistory: boolean
): string {
  if (!hasHistory) return content;
  if (!content) return content;

  let stripped = content;
  for (const pattern of GREETING_PATTERNS) {
    stripped = stripped.replace(pattern, "");
  }
  stripped = stripped.trim();

  // Defensivo: si quedó vacío o solo whitespace, devolvemos el original.
  // Razón: si el LLM solo generó "Hola" sin nada más, no queremos
  // enviarle al lead un mensaje vacío.
  if (!stripped) return content;

  // Defensivo: si no cambió nada (ningún patrón matcheó), devolvemos el
  // original. Mantiene la referencia original (no stripping parcial).
  if (stripped === content.trim()) return content;

  return stripped;
}

/**
 * Versión "lower-level" que strippea SIEMPRE (sin chequear hasHistory).
 * Útil para testing/debug. En producción, usar `stripGreetingIfHasHistory`.
 */
export function stripGreetingForTest(content: string): string {
  return stripGreetingIfHasHistory(content, true);
}