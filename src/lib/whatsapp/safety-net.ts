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
 *
 * FIX 2026-07-04 (auditoria, David pidió cubrir el residuo "a Qlick"):
 * los regex 3 y 4 aceptan opcionalmente " a Qlick" / " al equipo" después
 * del verbo. Esto cubre "gracias por escribir a Qlick" sin dejar el
 * residuo "a Qlick." que quedaba antes.
 */
const GREETING_PATTERNS: readonly RegExp[] = [
  // 1. "Hola, ..." / "Buenas tardes, ..." / "Qué tal, ..." / "Hi, ..." / "Hello, ..."
  /^\s*(hola|buen[oa]s\s+(d[ií]as|tardes|noches)|qué tal|hi|hello)[,.\s]*/i,

  // 2. "Hola Por, ..." / "Hola David, ..." (presentación con nombre)
  /^\s*hola[,\s]+[^,.\n]{1,30}[,.\s]*/i,

  // 3. "Por, gracias por escribir a Qlick..." (sin Hola, con nombre).
  // FIX 2026-07-04: aceptar opcionalmente " a Qlick" / " al equipo" después del verbo.
  /^\s*[A-Z][a-záéíóú]+,\s*gracias por (escribir|contactarnos|comunicarte)(?:\s+(?:a|al)\s+\w+)?[,.\s]*/i,

  // 4. "gracias por escribir a Qlick..." (sin nombre).
  // FIX 2026-07-04: aceptar opcionalmente " a Qlick" / " al equipo" después del verbo.
  /^\s*gracias por (escribir|contactarnos|comunicarte)(?:\s+(?:a|al)\s+\w+)?[,.\s]*/i,

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

  // Defensivo: si quedó vacío, solo whitespace, o un residuo muy corto
  // (<3 chars utiles como "Va", "Sí", ".", "Ok"), devolvemos el original.
  // Razón: si el LLM solo generó "Hola" sin nada más (o solo "Hola."),
  // no queremos enviarle al lead un mensaje que no responde a su pregunta
  // — preferimos devolver el texto original con el saludo incluido antes
  // que un residuo inutil. El saludo duplicado es un mal menor que un
  // mensaje sin contenido.
  //
  // FIX 2026-07-10 (Sprint 2 hotfix David, sesion 03:27 AM): extender la
  // guarda de "vacio" a "<3 caracteres" para cubrir residuos como "Va",
  // "Sí", "." que tampoco responden al lead. Antes del fix, un LLM que
  // devolvía "Hola." se quedaba en "." y caia al safety net externo
  // ("Disculpa, no entendí bien tu mensaje..."). El fallback message
  // (profile.fallbackMessage) era el siguiente paso y empeoraba la UX.
  if (!stripped || stripped.length < 3) return content;

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

/* ─────────────────────────────────────────────────────────────
 * Ack-only detection — FIX 2026-07-10 (Sprint 2 hotfix David 03:27 AM)
 * ─────────────────────────────────────────────────────────────
 * Detecta si el mensaje del lead es SOLO un acuse de recibo (gracias,
 * ok, listo, perfecto, vale, va, entendido, sí) o un cierre rápido.
 *
 * Caso de uso: handler determinista en `bot-engine.ts` que responde
 * con un mensaje cálido pre-fabricado y evita la llamada al LLM
 * (que devolvería algo vacío o sería strippeado por el safety net
 * principal, cayendo al fallback "Disculpa, no entendí bien tu
 * mensaje..."). Bug real observado 2026-07-10 03:17: "Gracias" del
 * lead tras registro completó cayó al safety net.
 *
 * Reglas:
 *   - Trim del body ANTES de matchear (whitespace al inicio/fin).
 *   - Sin palabras EXTRA antes/después (anclas ^...$). Un "muchas
 *     gracias por la info" NO matchea — tiene contexto útil para el
 *     LLM, mejor dejarlo pasar.
 *   - Tolerancia a puntuación trailing y emojis (.,!¡).
 *   - Variantes con tilde o sin tilde aceptadas.
 *   - Case-insensitive.
 *   - "muchas gracias" y "mil gracias" contemplados.
 *
 * NO dispara:
 *   - "ok perfecto"  → tiene dos palabras, NO es solo ack.
 *   - "ok gracias"   → idem.
 *   - "Gracias por todo" → "por todo" no matchea el sufijo opcional.
 *   - "perfecto, qué costo tiene?" → tiene pregunta después.
 *
 * SÍ dispara:
 *   - "gracias" / "GRACIAS" / "Gracias!" / "  Gracias.  "
 *   - "muchas gracias" / "mil gracias"
 *   - "ok" / "OK!" / "ok."
 *   - "listo" / "Listo,"
 *   - "perfecto" / "perfecto!"
 *   - "vale" / "va" / "Va,"
 *   - "entendido"
 *   - "sí" / "si" / "Sí!"
 */
const ACK_KEYWORDS =
  "(?:muchas\\s+|mil\\s+)?(?:gracias|ok|listo|perfecto|vale|entendido|va|s[íi])";
const ACK_TRAILING = "(?:[!.,¡\\s]*|\\u{1F44D}|[\\u{1F600}-\\u{1F64F}])"; // puntuación, espacios, emoji 👍/smileys
const ACK_ONLY_RE = new RegExp(
  `^\\s*${ACK_KEYWORDS}${ACK_TRAILING}$`,
  "iu"
);

/**
 * Detecta si `body` es un acuse de recibo corto o cierre rápido.
 * Pure function. NO instancia nada.
 *
 * @param body  mensaje crudo del lead (sin trim).
 * @returns true si body es solo un ack corto, false en cualquier otro caso.
 */
export function isAckOnly(body: string | null | undefined): boolean {
  if (!body) return false;
  return ACK_ONLY_RE.test(body.trim());
}