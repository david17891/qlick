/**
 * Genera el QR del certificado en formato PNG data URL.
 *
 * El QR codifica la URL publica `${BASE_URL}/filosofia` (landing de la marca,
 * NO `/verify/{folio}` — el cert es estetico-branded, no verificable por folio).
 *
 * La URL NO se estampa como texto en el certificado. El QR la codifica
 * por si alguien lo escanea, pero el cert no muestra "qlick.digital/filosofia".
 *
 * Usa `qrcode` (npm) — ya instalado en package.json.
 */

import QRCode from "qrcode";

export interface QrOptions {
  /** URL o texto a codificar. */
  data: string;
  /** Tamano del QR en pixeles. Default 256 (render final en PDF ~64pt). */
  size?: number;
  /** Margen blanco (quiet zone). Default 2 modulos. */
  margin?: number;
  /** Color QR (default #0F172A = ink). */
  color?: string;
  /** Fondo (default blanco). */
  background?: string;
  /** Nivel de correccion de errores del QR (L=7%, M=15%, Q=25%, H=30%).
   *  Default 'H' para que el QR siga escaneable aunque se manche. */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

export async function generateQrPngDataUrl(opts: QrOptions): Promise<string> {
  return await QRCode.toDataURL(opts.data, {
    type: "image/png",
    errorCorrectionLevel: opts.errorCorrectionLevel ?? "H",
    margin: opts.margin ?? 2,
    width: opts.size ?? 256,
    color: {
      dark: opts.color ?? "#0F172A",
      light: opts.background ?? "#FFFFFF",
    },
  });
}

/**
 * URL publica del QR en el cert.
 * Lee NEXT_PUBLIC_BASE_URL primero; cae a la constante `BASE_URL_FALLBACK`
 * si no esta seteada (modo dev/test).
 *
 * Cambiar esta constante por la canónica de prod si `.env` no la trae.
 */
const BASE_URL_FALLBACK = "https://qlick.digital";

export function getCertQrUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim() || BASE_URL_FALLBACK;
  return `${base.replace(/\/$/, "")}/filosofia`;
}
