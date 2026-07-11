"use client";

/**
 * PrintCertButton — client component para el botón "Imprimir" del cert.
 *
 * FIX 2026-07-08: David reportaba que al imprimir el cert las fuentes
 * Google Fonts (Plus Jakarta Sans, Inter, JetBrains Mono) no cargaban
 * a tiempo y Chrome renderizaba con fallback fonts, lo que desfasaba
 * el layout. Este botón espera a `document.fonts.ready` antes de
 * disparar `window.print()`.
 *
 * También centraliza el flujo de print en un solo lugar — si más
 * adelante queremos pre-configurar márgenes "Ninguno" via CDP / API
 * de Chrome, lo agregamos acá sin tocar el page.tsx server-side.
 */

import { type ReactElement } from "react";

export function PrintCertButton(): ReactElement {
  const handleClick = (): void => {
    // document.fonts.ready es Promise<void> en navegadores modernos.
    // Si no existe (Safari viejo), caemos a un setTimeout de 800ms.
    const fontsReady = (
      document as Document & { fonts?: { ready: Promise<unknown> } }
    ).fonts;
    const wait = fontsReady
      ? fontsReady.ready.then(() => new Promise<void>((r) => setTimeout(r, 200)))
      : new Promise<void>((r) => setTimeout(r, 800));
    void wait.then(() => window.print());
  };

  return (
    <button type="button" className="cert-actions-print" onClick={handleClick}>
      🖨️ Imprimir / Guardar PDF
    </button>
  );
}