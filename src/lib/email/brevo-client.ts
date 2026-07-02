/**
 * Wrapper del SDK de Brevo para emails transaccionales (Fase 7b).
 *
 * Reemplaza el wrapper de Resend (migración 2026-07-02 — ver PROJECT-LOG).
 * Razón: Brevo free tier ofrece 300 emails/día sin cap, mejor para el
 * ramp-up de Qlick que Resend Pro ($20/mes con cap de 100/día en free).
 *
 * Diseño:
 * - **Dev mode** (`NODE_ENV !== "production"`): si falta `BREVO_API_KEY`,
 *   los emails se loggean en consola en lugar de enviarse. Nunca crashea
 *   el flow principal.
 * - **Prod mode**: requiere `BREVO_API_KEY`. Si falta, devuelve error
 *   `{ ok: false, error: "..." }` (no crashea).
 *
 * **Por qué try/catch alrededor del send:**
 * El envío de email es best-effort. Si falla (timeout de Brevo, DNS,
 * rate limit, 4xx/5xx), el flow principal (crear la survey, mandar el
 * recordatorio) debe continuar. El error se loggea para debugging
 * pero no se propaga.
 *
 * **Setup:** ver `docs/SMTP_SETUP.md` y `.env.example`.
 *
 * **API Reference (v5 del SDK):**
 * https://developers.brevo.com/reference/sendtransacemail
 */

export interface SendEmailOptions {
  /** Destinatario. CSV string o array de strings. */
  to: string | string[];
  /** Subject. NO incluir PII (nombre, email) por filtros anti-spam. */
  subject: string;
  /** HTML body del email. */
  html: string;
  /** Reply-to opcional. Default: `BREVO_REPLY_TO` env. */
  replyTo?: string;
  /** Texto plano opcional (fallback para clientes sin HTML). */
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** ID del mensaje en Brevo (solo en prod exitoso). */
  id?: string;
  /** "dev" = loggeado en consola. "prod" = enviado vía Brevo API. */
  mode: "dev" | "prod";
  /** Si `ok === false`, mensaje de error para logging. */
  error?: string;
}

// Tipo del cliente de Brevo (cargado dinámicamente para no pagar el costo
// de import en dev mode). SDK v5 usa `BrevoClient` con getter
// `.transactionalEmails`.
type BrevoModule = typeof import("@getbrevo/brevo");
type BrevoClient = InstanceType<BrevoModule["BrevoClient"]>;

let _client: BrevoClient | null = null;

/**
 * Lazy init del cliente de Brevo. Solo se crea si hay API key.
 * Importa dinámicamente para que el dev mode NO pague el costo de
 * cargar el SDK si nunca se usa.
 */
async function getClient(): Promise<BrevoClient | null> {
  if (_client) return _client;
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;
  const mod = (await import("@getbrevo/brevo")) as unknown as BrevoModule;
  _client = new mod.BrevoClient({ apiKey });
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
 * Parsea `BREVO_FROM_ADDRESS` en formato `"Nombre <email@dominio>"` o `"email@dominio>"`.
 * Brevo requiere el sender como objeto `{ name, email }`, no como string.
 */
function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(?:"?([^"<]+)"?\s*)?<?\s*([^>\s]+@[^>\s]+)\s*>?\s*$/);
  if (!match) {
    // Fallback: tratar todo el string como email.
    return { email: from.trim() };
  }
  const name = match[1]?.trim();
  const email = match[2].trim();
  return name ? { name, email } : { email };
}

/**
 * Envía un email transaccional.
 *
 * **Comportamiento:**
 * - Dev mode sin API key → console.log + `{ ok: true, mode: "dev" }`
 * - Prod sin API key → console.warn + `{ ok: false, mode: "prod", error: "..." }`
 * - Prod con API key → Brevo API + `{ ok: true, mode: "prod", id }` o error
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

  const fromRaw = process.env.BREVO_FROM_ADDRESS;
  const replyTo = opts.replyTo ?? process.env.BREVO_REPLY_TO;
  const apiKey = process.env.BREVO_API_KEY;
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
      `[email/prod] BREVO_API_KEY missing. Email NOT sent: subject="${opts.subject}" to=${to.join(", ")}`,
    );
    return {
      ok: false,
      mode: "prod",
      error: "BREVO_API_KEY not configured",
    };
  }

  if (!fromRaw) {
    return {
      ok: false,
      mode: "prod",
      error: "BREVO_FROM_ADDRESS not configured",
    };
  }

  // Prod con API key → Brevo API.
  try {
    const client = await getClient();
    if (!client) {
      return {
        ok: false,
        mode: "prod",
        error: "Brevo client unavailable",
      };
    }
    const sender = parseSender(fromRaw);
    const response = await client.transactionalEmails.sendTransacEmail({
      sender,
      to: to.map((email) => ({ email })),
      subject: opts.subject,
      htmlContent: opts.html,
      textContent: opts.text,
      replyTo: replyTo ? { email: replyTo } : undefined,
    });
    // Brevo v5: response es `{ messageId, messageIds? }` directamente.
    const messageId = (response as { messageId?: string }).messageId;
    if (!messageId) {
      return {
        ok: false,
        mode: "prod",
        error: "Brevo response missing messageId",
      };
    }
    return {
      ok: true,
      mode: "prod",
      id: messageId,
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
