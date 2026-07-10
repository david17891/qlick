/**
 * Helper para testear el provider de DeepSeek (sub-sprint 2C) sin
 * pegarle a `api.deepseek.com`. Mockea `globalThis.fetch` devolviendo
 * respuestas pre-canned en orden FIFO.
 *
 * Cada response enqueueable es un objeto con shape:
 *   { status?: number, body: object }
 *
 * El primer `fetch()` call devuelve `responses[0]`, el segundo
 * `responses[1]`, etc. Si se acaban las respuestas, `mockFetch` lanza
 * con un mensaje descriptivo (regla del runner del proyecto: "no
 * skipped").
 *
 * Uso típico:
 *   const { restore } = installDeepseekFetchMock([
 *     { status: 200, body: { choices: [...] } },
 *     { status: 200, body: { choices: [...] } }
 *   ]);
 *   try {
 *     // ... correr el código que llama a fetch
 *   } finally {
 *     restore();
 *   }
 *
 * Patrón: co-diseñado con `tests/deepseek-function-calling.test.mjs`.
 * Cambios aquí deben ser retrocompatibles con los tests existentes.
 *
 * NOTA: este archivo es `.mjs` puro (sin TypeScript). El loader del
 * proyecto NO pasa strip-types por archivos `.mjs`, así que cualquier
 * sintaxis `: Type` rompe. Usamos JSDoc inline para documentar.
 */

/* ------------------------------------------------------------------ */
/* Builder                                                              */
/* ------------------------------------------------------------------ */

/**
 * Construye un mock para `globalThis.fetch` con respuestas enqueueadas.
 *
 * @param {Array<{status?: number, body: unknown}>} responses
 * @returns {{
 *   mockFetch: (url: any, init?: RequestInit) => Promise<Response>,
 *   calls: () => readonly any[],
 *   bodyOf: (n: number) => unknown,
 *   wasNotCalled: () => boolean
 * }}
 */
export function buildDeepseekFetchMock(responses) {
  const queue = [...responses];
  const calls = [];

  const mockFetch = async (url, init) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = {};
    if (init?.headers) {
      const h = init.headers;
      if (h instanceof Headers) {
        h.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(h)) {
        for (const [k, v] of h) headers[k] = v;
      } else {
        Object.assign(headers, h);
      }
    }
    let bodyParsed = null;
    if (typeof init?.body === "string") {
      try {
        bodyParsed = JSON.parse(init.body);
      } catch {
        bodyParsed = init.body;
      }
    }
    const start = Date.now();
    const next = queue.shift();
    if (!next) {
      throw new Error(
        `[deepseek-fetch-mock] Mock exhausted — la llamada #${calls.length + 1} no tenía respuesta enqueueada. ` +
          `URL=${urlStr} method=${method}. Agrega más responses.`
      );
    }
    const latencyMs = Date.now() - start;
    calls.push({ url: urlStr, method, headers, body: bodyParsed, latencyMs });

    const status = next.status ?? 200;
    const bodyText = JSON.stringify(next.body);
    return new Response(bodyText, {
      status,
      headers: { "content-type": "application/json" }
    });
  };

  return {
    mockFetch,
    calls: () => calls,
    bodyOf: (n) => {
      const c = calls[n - 1];
      if (!c) throw new Error(`[deepseek-fetch-mock] No call #${n}`);
      return c.body;
    },
    wasNotCalled: () => calls.length === 0
  };
}

/* ------------------------------------------------------------------ */
/* Installer                                                            */
/* ------------------------------------------------------------------ */

/**
 * Versión "todo en uno": construye el mock, lo instala en
 * `globalThis.fetch`, y devuelve un `restore()` para cleanup.
 *
 * Uso:
 *   const restore = installDeepseekFetchMock([{...}, {...}]);
 *   try { ... } finally { restore(); }
 *
 * Garantía: restore() es idempotente y safe de llamar incluso si no
 * instalamos (defensivo para tests que comparten estado).
 */
export function installDeepseekFetchMock(responses) {
  const prev = globalThis.fetch;
  const built = buildDeepseekFetchMock(responses);
  // FIX 2026-07-10: usar `globalThis` y no `global` (en Node 22 con
  // ESM, `global` puede ser undefined).
  globalThis.fetch = built.mockFetch;

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (prev === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = prev;
    }
  };

  return {
    mockFetch: built.mockFetch,
    calls: built.calls,
    bodyOf: built.bodyOf,
    restore
  };
}

/* ------------------------------------------------------------------ */
/* Helpers para construir responses deepseek-like                      */
/* ------------------------------------------------------------------ */

/**
 * Construye el body de una respuesta exitosa de DeepSeek con texto.
 * @param {string} content
 * @param {string} [finishReason="stop"]
 * @returns {{status?: number, body: unknown}}
 */
export function deepseekTextResponse(content, finishReason = "stop") {
  return {
    status: 200,
    body: {
      id: `chatcmpl-mock-${Math.random().toString(36).slice(2)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "deepseek-chat",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content, tool_calls: null },
          finish_reason: finishReason
        }
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
    }
  };
}

/**
 * Construye el body de una respuesta con tool_call.
 * @param {string} toolName
 * @param {unknown} argsObject
 * @param {string} [id]
 * @returns {{status?: number, body: unknown}}
 */
export function deepseekToolCallResponse(toolName, argsObject, id) {
  if (!id) id = `call_${Math.random().toString(36).slice(2, 10)}`;
  return {
    status: 200,
    body: {
      id: `chatcmpl-mock-${Math.random().toString(36).slice(2)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "deepseek-chat",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id,
                type: "function",
                function: {
                  name: toolName,
                  arguments: JSON.stringify(argsObject)
                }
              }
            ]
          },
          finish_reason: "tool_calls"
        }
      ],
      usage: { prompt_tokens: 150, completion_tokens: 20, total_tokens: 170 }
    }
  };
}

/**
 * Construye una respuesta de error.
 * @param {number} status
 * @param {string} message
 * @returns {{status: number, body: unknown}}
 */
export function deepseekErrorResponse(status, message) {
  return {
    status,
    body: {
      error: {
        message,
        type: status >= 500 ? "server_error" : "invalid_request_error",
        code: null
      }
    }
  };
}
