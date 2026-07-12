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
  /**
   * Sprint v0.9.8 Mejora 3: status del resultado. Si el email tiene un
   * typo de dominio conocido (ej. "@gmai.com"), el status es
   * "needs_domain_confirmation" y el email NO se guarda. El LLM lee
   * este status y le pide al lead una confirmación amable del
   * dominio antes de reintentar. Ausente = flujo normal.
   */
  status?: "needs_domain_confirmation";
  /**
   * Sprint v0.9.8 Mejora 3: dominio correcto sugerido (ej. "gmail.com").
   * Presente solo si `status === "needs_domain_confirmation"`.
   */
  suggested_domain?: string;
  /**
   * Sprint v0.9.8 Mejora 3: dominio crudo que el lead dio (ej. "gmai.com").
   * Presente solo si `status === "needs_domain_confirmation"`. Útil para
   * que el LLM haga la pregunta de confirmación.
   */
  raw_domain?: string;
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

/**
 * FIX 2026-07-10 (sesión David "FALLBACK captura 'Quiero'/'!hola!' como
 * nombre"): set de verbos/intenciones que la tool debe rechazar si
 * llegan como "nombre". Coincide con `INTENT_VERBS` del bot-engine pero
 * está LOCAL para no introducir dependencia. Si el bot-engine agrega un
 * nuevo verbo en el futuro, hay que sincronizarlo acá.
 *
 * Cobertura: verbos específicos de inscripción, intención de obtener
 * info y verbos de comunicación. NO incluye "Quiero" (genérico, es
 * nombre válido) — el system prompt del LLM cubre esos casos.
 */
const INTENT_VERBS_BLOCKLIST: ReadonlySet<string> = new Set([
  // Verbos específicos de inscripción
  "registrarme", "registrame", "registráme",
  "inscribirme", "inscribime", "inscribíme",
  "apuntarme", "apuntame", "apuntáme",
  "anotarme", "anotame", "anotáme",
  "apartar", "reservar",
  "asistir", "asisto",
  "confirmo", "confirmar",
  "anotar", "apartarme", "reservarme",
  // Verbos de intención de obtener info
  "interesa", "gustaria", "gustaría",
  "dame", "necesito",
  // Verbos de comunicación
  "hablar", "comunicar", "comunicarme",
  // Auxiliares comunes en frases de intención
  "solicito", "solicitar", "pidiendo", "pedir",
]);

/**
 * FIX 2026-07-10: detecta si alguna palabra del nombre extraído es un
 * verbo de intención conocido. Cubre el caso donde el LLM extrae
 * "Quiero Registrarme" o "Me Interesa" como nombre. Pure function.
 */
function hasIntentVerbLocal(text: string | null | undefined): boolean {
  if (!text) return false;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const cleanWords = words.map((w) => w.replace(/[.,!?;:]+$/, ""));
  return cleanWords.some((w) => INTENT_VERBS_BLOCKLIST.has(w));
}

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
/* Sprint v0.9.8 Mejora 3: Detección de typos en dominios de correo  */
/* ------------------------------------------------------------------ */

/**
 * Diccionario de errores tipográficos comunes en dominios de correo.
 * Map: typo (lowercase) → dominio correcto (lowercase).
 *
 * Cobertura: los typos más frecuentes que David documentó en el brief
 * de v0.9.8 (`@gmai.com`, `@hotmai.com`, `@outlook.co`, `@yahho.com`).
 * Si el LLM recibe un email con uno de estos dominios, NO abortamos
 * con error genérico; pedimos confirmación amable al lead.
 *
 * Cómo extender: agregar más keys al dict (lowercase). NO incluir
 * dominios válidos aunque sean cortos (e.g. no agregar "gm.com" → "gmail.com"
 * porque gm.com es un dominio válido de General Motors).
 */
export const DOMAIN_TYPOS: Readonly<Record<string, string>> = Object.freeze({
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmial.com": "gmail.com",
  "gnail.com": "gmail.com",
  "hotmai.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "outlook.co": "outlook.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "yahho.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yhoo.com": "yahoo.com"
});

/**
 * Detecta si un email tiene un typo de dominio conocido.
 *
 * @returns `null` si el email no tiene typo (o el email es null/inválido).
 *          `{ suggestedDomain: string, rawDomain: string }` si hay typo.
 */
export function detectDomainTypo(
  email: string | null | undefined
): { suggestedDomain: string; rawDomain: string } | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const atIdx = normalized.lastIndexOf("@");
  if (atIdx < 0) return null;
  const domain = normalized.slice(atIdx + 1);
  const suggested = DOMAIN_TYPOS[domain];
  if (!suggested) return null;
  return { suggestedDomain: suggested, rawDomain: domain };
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
    // FIX 2026-07-10 (sesión David "FALLBACK captura 'Quiero'/'!hola!' como
    // nombre"): rechazar también si el nombre extraído es un verbo de
    // intención conocido (ej. "Quiero Registrarme", "Me Interesa"). El
    // LLM puede alucinar y llamar a la tool con un nombre que NO es
    // nombre. Esta es la red de seguridad.
    if (hasIntentVerbLocal(rawName)) {
      nameError = "Nombre inválido (contiene verbo de intención, no es nombre humano).";
    } else if (isValidHumanNameLocal(rawName)) {
      validatedName = rawName;
    } else {
      nameError = "Nombre inválido (placeholder, demasiado corto o sin letras).";
    }
  }

  let validatedEmail: string | null = null;
  let emailError: string | undefined;
  let domainTypoSuggestion: { suggestedDomain: string; rawDomain: string } | null =
    null;
  if (rawEmail) {
    // Sprint v0.9.8 Mejora 3: detectar typos de dominio ANTES de validar.
    // Si hay un typo conocido (ej. "@gmai.com"), NO abortamos con
    // error genérico: devolvemos `status: "needs_domain_confirmation"`
    // para que el LLM pida confirmación amable al lead.
    const typo = detectDomainTypo(rawEmail);
    if (typo) {
      domainTypoSuggestion = typo;
      // NO marcamos emailError: la validación semántica es válida
      // (formato correcto), solo hay ambigüedad de dominio.
    } else {
      const normalized = validateAndNormalizeEmail(rawEmail);
      if (normalized) {
        validatedEmail = normalized;
      } else {
        emailError = "Formato de email inválido.";
      }
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

  // 3.5. Sprint v0.9.8 Mejora 3: si hay typo de dominio, devolver ack
  // con `status: "needs_domain_confirmation"` ANTES de persistir. El LLM
  // lee este status y le pide al lead una confirmación amable del
  // dominio ("¿tu correo termina en gmail.com?"). NO guardamos el
  // email con typo — sería una alucinación.
  if (domainTypoSuggestion) {
    return {
      ok: true,
      persisted: false,
      demo: ctx.supabase === null,
      status: "needs_domain_confirmation",
      suggested_domain: domainTypoSuggestion.suggestedDomain,
      raw_domain: domainTypoSuggestion.rawDomain,
      saved_name: validatedName ?? undefined,
      // El email NO se guarda todavía.
      error_email: undefined,
      note: `El dominio "${domainTypoSuggestion.rawDomain}" parece tener un typo tipográfico. Sugerencia: "${domainTypoSuggestion.suggestedDomain}". Pídele confirmación natural al lead antes de guardar.`
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
