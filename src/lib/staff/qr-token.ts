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
 * Extrae el token del path `/check-in/<token>` o `<token>` puro.
 *
 * @param decoded - el string decodificado del QR (raw del scanner)
 * @returns el token si matchea el formato esperado, o null si no
 */
export function extractQrToken(decoded: string): string | null {
  const trimmed = decoded.trim();
  // Si codifica una URL completa del check-in.
  if (trimmed.includes("/check-in/")) {
    const match = trimmed.match(/\/check-in\/([^/?#]+)/);
    return match ? match[1] : null;
  }
  // Si es solo el token (base64url, 20-40 chars — flexible porque
  // podríamos cambiar la longitud en el futuro).
  if (/^[A-Za-z0-9_-]{20,40}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}