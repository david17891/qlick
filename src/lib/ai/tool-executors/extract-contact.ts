/**
 * Tool Executor: extract_and_save_contact_info — Sub-sprint 2A.
 *
 * Implementación server-side de la tool consolidada que el LLM (DeepSeek
 * V4-Flash/Pro) puede llamar durante `suggest_reply`. Por diseño
 * (mejora #2 del Sprint 2 de David), es UNA sola operación atómica:
 *
 *   recibe (name?, email?) → valida → persiste en `public.leads` → ack
 *
 * Mismas reglas que el pipeline determinista del bot-engine.ts
 * (isValidHumanName, regex email), pero sin el overhead de 4 llamadas
 * separadas ni la decisión de orden que confundía al LLM.
 *
 * Modos de operación:
 *   - real: `supabase` provisto y configurado → UPDATE a public.leads.
 *   - demo: `supabase === null` → no persiste; devuelve lo que
 *     guardaría (idempotente, safe para tests y previews).
 *
 * Idempotencia:
 *   - Si el lead YA tiene `name = "Juan"` y la tool recibe `name = "Juan"`,
 *     el UPDATE es no-op (mismo valor).
 *   - Si el lead tiene `name = "Por confirmar"` y recibe `name = "Juan"`,
 *     el UPDATE sobreescribe (es el caso del fix "captura universal").
 *   - Si el lead tiene `email = "x@y.com"` y recibe `email = "x@y.com"`,
 *     no-op (lowercase + trim normalizado).
 *
 * Latencia esperada:
 *   - Validación in-memory: <1ms.
 *   - UPDATE Supabase: 80-180ms típico, hasta 500ms en pico.
 *   - Total: bien dentro del budget de 1.5s del Sprint 2.
 *
 * Ver:
 *   - src/lib/whatsapp/bot-engine.ts (isValidHumanName, PLACEHOLDER_NAMES_UI).
 *   - docs/SPRINT_2_BOT_V2_DESIGN.md §2 (mejora #2).
 *   - docs/AI_AGENT_GUARDRAILS.md.
 *
 * @server
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/* ------------------------------------------------------------------ */
/* Inputs / Outputs                                                   */
/* ------------------------------------------------------------------ */

/** Lo que el LLM pasa a la tool. Ambos campos son opcionales. */
export interface ExtractContactInput {
  name?: string | null;
  email?: string | null;
}

/** Contexto necesario para ejecutar la tool (provisto por bot-engine). */
export interface ExtractContactContext {
  /** UUID del lead a actualizar. Requerido (sin leadId no hay a quién guardar). */
  leadId: string;
  /** Cliente Supabase admin (o null para modo demo). */
  supabase: SupabaseClient<Database> | null;
}

/** Resultado devuelto al LLM en `role: "tool"`. */
export interface ExtractContactResult {
  /** true si al menos un campo se guardó/sería guardado sin error. */
  ok: boolean;
  /** Nombre guardado (post-validación). Presente si se aceptó el nombre. */
  saved_name?: string;
  /** Email guardado (post-validación, lowercase). Presente si se aceptó. */
  saved_email?: string;
  /** Mensaje de error para el nombre (si fue rechazado por validación). */
  error_name?: string;
  /** Mensaje de error para el email (si fue rechazado por validación). */
  error_email?: string;
  /** true si se persistió en Supabase; false si fue modo demo. */
  persisted: boolean;
  /** true si fue modo demo (sin Supabase real configurado). */
  demo: boolean;
  /** Nota legible para logging. Sin PII. */
  note: string;
}

/* ------------------------------------------------------------------ */
/* Regex y constantes locales                                         */
/* ------------------------------------------------------------------ */

/**
 * Regex de validación de email. Misma convención que
 * `src/lib/whatsapp/bot-engine.ts:EMAIL_RE` (línea ~873) para que la
 * tool y el pipeline determinista coincidan exactamente.
 *
 * Mantenemos la regex ACÁ (no importamos del bot-engine) para evitar
 * acoplamiento: este archivo es importable desde el LLM provider y los
 * tests, no solo desde el bot-engine.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Set de placeholders que la tool debe rechazar si llegan como "nombre".
 * Coincide con `PLACEHOLDER_NAMES_UI` del bot-engine pero está LOCAL
 * para no introducir dependencia. Si el bot-engine agrega un nuevo
 * placeholder en el futuro, hay que sincronizarlo acá.
 */
const PLACEHOLDER_NAMES_BLOCKLIST: ReadonlySet<string> = new Set([
  "por",
  "por confirmar",
  "confirmar",
  "test",
  "test number",
  "(empty)",
  "whatsapp",
  "whatsapp lead",
  "asistente",
  "pendiente",
  "n/a",
  "na",
  "anonimo",
  "anonymous",
  "sin nombre"
]);

/* ------------------------------------------------------------------ */
/* Helpers puros (testeables sin Supabase)                             */
/* ------------------------------------------------------------------ */

/**
 * Valida que `text` sea un nombre humano razonable. Coincide con la
 * lógica de `bot-engine.ts:isValidHumanName` pero standalone para que
 * la tool pueda usarla sin importar el bot-engine completo.
 *
 * Reglas (alineadas con la original):
 *   - longitud 2-100 chars después de trim.
 *   - tiene al menos 2 palabras con caracteres alfabéticos (incluye
 *     acentos).
 *   - NO es todo dígitos ni todo símbolos.
 *   - NO es placeholder UI ("Asistente", "Por confirmar", etc).
 */
export function isValidHumanNameLocal(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  if (/^[\d\s]+$/.test(trimmed)) return false;
  if (!/[\p{L}]/u.test(trimmed)) return false;
  if (PLACEHOLDER_NAMES_BLOCKLIST.has(trimmed.toLowerCase())) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordsWithLetters = words.filter((w) => /[\p{L}]/u.test(w));
  if (wordsWithLetters.length < 2) return false;
  return true;
}

/**
 * Normaliza un email: trim + lowercase. Devuelve `null` si no pasa la
 * regex. Alineado con la convención del bot-engine (lowercase trim).
 */
export function validateAndNormalizeEmail(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return null;
  return normalized;
}

/* ------------------------------------------------------------------ */
/* Tool execution                                                      */
/* ------------------------------------------------------------------ */

/**
 * Ejecuta la tool. Real o demo según `ctx.supabase`. Idempotente.
 *
 * Decisiones de diseño:
 *   - Si `input.name === input.email === null/undefined`, no-op (no
 *     error, no UPDATE). Devuelve `{ ok: false, note: "no-op" }`.
 *   - Si ambos vienen vacíos pero uno es solo whitespace, lo tratamos
 *     como null (no actualizamos, no error).
 *   - name y email se procesan INDEPENDIENTEMENTE: si name pasa pero
 *     email falla, igual guardamos name y devolvemos `error_email`.
 *     El LLM puede entonces pedirle al lead que confirme el email.
 */
export async function executeExtractAndSaveContact(
  input: ExtractContactInput,
  ctx: ExtractContactContext
): Promise<ExtractContactResult> {
  // 0. Defensa: leadId es obligatorio (sin él no podemos persistir).
  if (!ctx.leadId || typeof ctx.leadId !== "string") {
    return {
      ok: false,
      persisted: false,
      demo: ctx.supabase === null,
      note: "Falta leadId en el contexto de la tool."
    };
  }

  // 1. Normalizar inputs vacíos → no-op.
  const rawName = input.name?.trim() || null;
  const rawEmail = input.email?.trim() || null;

  if (!rawName && !rawEmail) {
    return {
      ok: false,
      persisted: false,
      demo: ctx.supabase === null,
      note: "Sin datos para guardar (name y email vacíos)."
    };
  }

  // 2. Validar cada campo por separado.
  let validatedName: string | null = null;
  let nameError: string | undefined;
  if (rawName) {
    if (isValidHumanNameLocal(rawName)) {
      validatedName = rawName;
    } else {
      nameError = "Nombre inválido (placeholder, demasiado corto o sin letras).";
    }
  }

  let validatedEmail: string | null = null;
  let emailError: string | undefined;
  if (rawEmail) {
    const normalized = validateAndNormalizeEmail(rawEmail);
    if (normalized) {
      validatedEmail = normalized;
    } else {
      emailError = "Formato de email inválido.";
    }
  }

  // 3. Si NINGUNO pasa validación, devolver error sin tocar Supabase.
  if (!validatedName && !validatedEmail) {
    return {
      ok: false,
      error_name: nameError,
      error_email: emailError,
      persisted: false,
      demo: ctx.supabase === null,
      note: "Ninguno de los datos pasó la validación."
    };
  }

  // 4. Modo demo: simular lo que se guardaría sin tocar DB.
  if (ctx.supabase === null) {
    return {
      ok: true,
      saved_name: validatedName ?? undefined,
      saved_email: validatedEmail ?? undefined,
      error_name: nameError,
      error_email: emailError,
      persisted: false,
      demo: true,
      note: "Modo demo: datos validados pero no persistidos."
    };
  }

  // 5. Modo real: UPDATE a public.leads. Patch parcial (no sobrescribimos
  //    campos que la tool no tocó).
  // FIX 2026-07-10 (Sprint 2 #2A): usamos `Database["public"]["Tables"]["leads"]["Update"]`
  // para que typegen chequee contra el schema real. Si la columna no
  // existe en la tabla, TS nos avisa antes del deploy.
  const patch: Database["public"]["Tables"]["leads"]["Update"] = {};
  if (validatedName) patch.name = validatedName;
  if (validatedEmail) patch.email = validatedEmail;

  const { error } = await ctx.supabase
    .from("leads")
    .update(patch)
    .eq("id", ctx.leadId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      "[tool-executor] extract_and_save_contact_info: UPDATE falló",
      {
        code: (error as { code?: string }).code,
        leadId: ctx.leadId,
        hasName: !!validatedName,
        hasEmail: !!validatedEmail
      }
    );
    return {
      ok: false,
      error_name: nameError,
      error_email: emailError,
      persisted: false,
      demo: false,
      note: `Error al persistir en Supabase (${(error as { code?: string }).code ?? "unknown"}).`
    };
  }

  return {
    ok: true,
    saved_name: validatedName ?? undefined,
    saved_email: validatedEmail ?? undefined,
    error_name: nameError,
    error_email: emailError,
    persisted: true,
    demo: false,
    note: validatedName && validatedEmail
      ? "Nombre y email guardados."
      : validatedName
        ? "Nombre guardado."
        : "Email guardado."
  };
}
