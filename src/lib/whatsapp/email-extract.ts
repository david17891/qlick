/**
 * Helper para extraer el primer email de un texto conversacional.
 *
 * FIX 2026-07-05 (sesion David): el bot de WhatsApp detectaba intent
 * `provide_email` con EMAIL_RE (regex con anchors ^...$) cuando el body
 * CONTENIA un email, pero los handlers usaban `body.trim()` directo. Esto
 * rompia cuando el usuario daba contexto, p.ej.:
 *
 *   body: "Me equivoqué, es david17891@gmail.com"
 *   - EMAIL_RE.test(body) = true         (detecta intent correctamente)
 *   - body.trim() = "me equivoqué, es david17891@gmail.com"  <- basura
 *   - Brevo rechace silenciosamente al reenviar el QR
 *
 * extractEmailFromText (sin anchors) devuelve el primer email que matchea
 * dentro del texto. Devuelve null si no hay match — el caller decide que
 * hacer (fallback al body completo o error).
 *
 * Por que NO `EMAIL_RE.test(body) ? body : null`:
 *   - EMAIL_RE requiere que el body ENTERO sea un email, lo que solo pasa
 *     en el caso feliz. Cualquier texto extra rompe.
 *   - Necesitamos matchear emails DENTRO de texto mas largo.
 *
 * Edge cases manejados:
 *   - Multiples emails: devuelve el primero (consistente con la convencion
 *     del bot de quedarse con la primera mencion).
 *   - Sin email: devuelve null.
 *   - Email con subdomain (mail.cdmx.gob.mx): matchea completo.
 *   - Caracteres especiales validos en user (., -, _): matcheados.
 *   - Formato invalido (espacios, sin TLD, solo @): rechazado.
 *
 * Server-only. No importar desde Client Components.
 */

// TLD no incluye puntuacion (.,;:). Si lo permitiera, "foo@bar.com, ahora..."
// matchearia "foo@bar.com," (con la coma) y eso no es un email valido para
// Brevo (rechaza formatos raros). La exclusion de `.,;:` corta el match en
// el primer signo de puntuacion que delimita el email en texto natural.
const EMAIL_EXTRACT_RE = /[^\s@]+@[^\s@]+\.[^\s@.,;:]+/;

export function extractEmailFromText(text: string): string | null {
  const match = EMAIL_EXTRACT_RE.exec(text);
  return match ? match[0] : null;
}