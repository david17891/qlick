import { Resend } from "resend";

/**
 * Wrapper del SDK de Resend para emails transaccionales (Fase 5).
 *
 * Diseño:
 * - **Dev mode** (`NODE_ENV !== "production"`): si falta `RESEND_API_KEY`,
 *   los emails se loggean en consola en lugar de enviarse. Nunca crashea
 *   el flow principal.
 * - **Prod mode**: requiere `RESEND_API_KEY`. Si falta, devuelve error
 *   `{ ok: false, error: "..." }` (no crashea).
 *
 * **Por qué try/catch alrededor del send:**
 * El envío de email es best-effort. Si falla (timeout de Resend, DNS,
 * rate limit), el flow principal (crear la survey) debe continuar.
 * El error se loggea para debugging pero no se propaga.
 *
 * **Setup:** ver `docs/SMTP_SETUP.md` y `.env.example`.
 */

export interface SendEmailOptions {
  /** Destinatario. CSV string o array de strings. */
  to: string | string[];
  /** Subject. NO incluir PII (nombre, email) por filtros anti-spam. */
  subject: string;
  /** HTML body del email. */
  html: string;
  /** Reply-to opcional. Default: `RESEND_REPLY_TO` env. */
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** ID del mensaje en Resend (solo en prod exitoso). */
  id?: string;
  /** "dev" = loggeado en consola. "prod" = enviado vía Resend API. */
  mode: "dev" | "prod";
  /** Si `ok === false`, mensaje de error para logging. */
  error?: string;
}

type ResendModule = typeof import("resend");
type ResendCtor = new (apiKey: string) => InstanceType<ResendModule["Resend"]>;

let _client: InstanceType<ResendModule["Resend"]> | null = null;

/**
 * Lazy init del cliente de Resend. Solo se crea si hay API key.
 * Importa dinámicamente para que el dev mode NO pague el costo de
 * cargar el SDK si nunca se usa.
 */
async function getClient(): Promise<InstanceType<ResendModule["Resend"]> | null> {
  if (_client) return _client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const mod = (await import("resend")) as unknown as {
    Resend: ResendCtor;
  };
  _client = new mod.Resend(apiKey);
  return _client;
}

/** Devuelve lista normalizada de destinatarios (CSV string → array trimmed).
 *  Filtra elementos no-string (null/undefined) defensivamente. */
function normalizeTo(to: string | string[]): string[] {
  if (Array.isArray(to)) {
    return to
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return to
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Envía un email transaccional.
 *
 * **Comportamiento:**
 * - Dev mode sin API key → console.log + `{ ok: true, mode: "dev" }`
 * - Prod sin API key → console.warn + `{ ok: false, mode: "prod", error: "..." }`
 * - Prod con API key → Resend API + `{ ok: true, mode: "prod", id }` o error
 *
 * **Nunca crashea.** Todos los errores se capturan y devuelven como `{ ok: false, error }`.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const to = normalizeTo(opts.to);
  if (to.length === 0) {
    return {
      ok: false,
      mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
      error: "No recipients (to is empty)",
    };
  }

  const from = process.env.RESEND_FROM_ADDRESS;
  const replyTo = opts.replyTo ?? process.env.RESEND_REPLY_TO;
  const apiKey = process.env.RESEND_API_KEY;
  const isDev = process.env.NODE_ENV !== "production";

  // Dev mode sin API key → loggear en consola, devolver éxito.
  if (isDev && !apiKey) {
    // eslint-disable-next-line no-console
    console.log(
      `[email/dev] subject="${opts.subject}" to=${to.join(", ")} (no API key, loggeado solo)`,
    );
    return { ok: true, mode: "dev" };
  }

  // Prod sin API key → warning + error (no enviar nada).
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      `[email/prod] RESEND_API_KEY missing. Email NOT sent: subject="${opts.subject}" to=${to.join(", ")}`,
    );
    return {
      ok: false,
      mode: "prod",
      error: "RESEND_API_KEY not configured",
    };
  }

  if (!from) {
    return {
      ok: false,
      mode: "prod",
      error: "RESEND_FROM_ADDRESS not configured",
    };
  }

  // Prod con API key → Resend API.
  try {
    const client = await getClient();
    if (!client) {
      return {
        ok: false,
        mode: "prod",
        error: "Resend client unavailable",
      };
    }
    const { data, error } = await client.emails.send({
      from,
      to,
      subject: opts.subject,
      html: opts.html,
      replyTo,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[email/prod] Resend API error: ${error.name ?? "Unknown"} — ${error.message ?? "(no message)"}`,
      );
      return {
        ok: false,
        mode: "prod",
        error: error.message ?? "Resend API error",
      };
    }
    return {
      ok: true,
      mode: "prod",
      id: data?.id,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[email/prod] sendEmail threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      ok: false,
      mode: "prod",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}