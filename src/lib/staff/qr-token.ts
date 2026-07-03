/**
 * Helpers para parsear el contenido de un QR de check-in.
 *
 * El QR puede codificar:
 *   1. La URL completa del pase: `https://qlick.mx/check-in/<token>`
 *   2. Solo el token: `<32 chars base64url>`
 *
 * Usado por el scanner del staff (Commit B, 2026-07-03) y potencialmente
 * por el endpoint publico de check-in si en el futuro queremos aceptar
 * scans sin abrir el browser.
 *
 * @server
 */

/**
 * Saca extensiones de archivo del token si están pegadas al final.
 *
 * Caso de uso (FIX 2026-07-03, sesion David "QR no encontrado"): el
 * endpoint `/api/event-qr/[token].png` (Next.js dynamic route con
 * extension) antes pasaba el param `token` tal cual al QR generator,
 * produciendo QRs que codificaban `https://.../check-in/<token>.png`.
 * Esos QRs ya quedaron cacheados en emails, impresos, guardados como
 * PNG, etc. Aunque el endpoint ya está arreglado para futuras
 * generaciones, defense in depth: el scanner (este archivo) debe poder
 * extraer el token real aunque reciba el URL con `.png` pegado.
 *
 * Mismo patrón que el del route handler
 * (`src/app/api/event-qr/[token]/route.ts`), pero aplicado en la capa
 * de consumidor para tolerar QRs viejos.
 */
export function stripQrTokenExtension(token: string): string {
  // Lista de extensiones que sabemos pueden aparecer pegadas al token.
  // `.png` es la del endpoint del QR; `.json` y `.html` son defensivas
  // para extensiones que podrian aparecer si alguien refactoriza la
  // ruta en el futuro.
  if (token.endsWith(".png")) return token.slice(0, -4);
  if (token.endsWith(".json")) return token.slice(0, -5);
  if (token.endsWith(".html")) return token.slice(0, -5);
  return token;
}

/**
 * Extrae el token del path `/check-in/<token>` o `<token>` puro.
 *
 * Defense in depth: si la URL o el token traen `.png` pegado al final
 * (de generaciones viejas del endpoint `/api/event-qr/[token].png`), lo
 * saca antes de validar el formato. Ver `stripQrTokenExtension`.
 *
 * @param decoded - el string decodificado del QR (raw del scanner)
 * @returns el token si matchea el formato esperado, o null si no
 */
export function extractQrToken(decoded: string): string | null {
  const trimmed = decoded.trim();
  // Si codifica una URL completa del check-in.
  if (trimmed.includes("/check-in/")) {
    const match = trimmed.match(/\/check-in\/([^/?#]+)/);
    if (!match) return null;
    // FIX 2026-07-03 (defense in depth): strip `.png` y otras extensiones
    // que puedan venir pegadas. Ver bloque de `stripQrTokenExtension`
    // para el contexto.
    return stripQrTokenExtension(match[1]);
  }
  // Si es solo el token (base64url, 20-40 chars — flexible porque
  // podríamos cambiar la longitud en el futuro). También aplicamos
  // stripQrTokenExtension por si el staff tipea manualmente algo con
  // extension o un scanner alternativo mete una al final.
  const candidate = stripQrTokenExtension(trimmed);
  if (/^[A-Za-z0-9_-]{20,40}$/.test(candidate)) {
    return candidate;
  }
  return null;
}