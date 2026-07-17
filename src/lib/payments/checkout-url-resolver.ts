/**
 * FIX 2026-07-17 (sprint event-payments bug 12, David
 * "después de pagar con tarjeta, me sigue mandando a dashboard como
 * si me inscribiera al curso"): helper para resolver URLs de retorno
 * de checkout (success/cancel/pending).
 *
 * Reglas:
 *   - Si el cliente NO mandó URL (null/undefined/empty), devuelve el
 *     default. Esto cubre callers viejos que no mandaban las URLs en
 *     el body.
 *   - Si el cliente SÍ mandó URL, debe ser absoluta y del MISMO
 *     origin del request (defense vs open redirect: alguien podría
 *     mandar una URL a evil.com). Si no cumple, devolvemos el default
 *     (defensivo, loggeamos a stderr para que aparezca en Vercel logs).
 *
 * Extraído a módulo separado (en vez de quedar en route.ts) para
 * poder testearlo sin levantar next/server.
 *
 * Server-only (no usar en client components).
 *
 * @server
 */

export function resolveCheckoutUrl(
  candidate: unknown,
  defaultUrl: string,
  requestOrigin: string,
  fieldName: string
): string {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return defaultUrl;
  }
  try {
    const u = new URL(candidate);
    if (u.origin !== requestOrigin) {
      // eslint-disable-next-line no-console
      console.warn(
        `[create-checkout] ${fieldName} tiene origin distinto al del request; usando default.`,
        { candidateOrigin: u.origin, requestOrigin }
      );
      return defaultUrl;
    }
    return candidate;
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      `[create-checkout] ${fieldName} no es URL absoluta valida; usando default.`,
      { candidate }
    );
    return defaultUrl;
  }
}
