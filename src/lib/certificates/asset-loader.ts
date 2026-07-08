/**
 * Carga assets (firmas, logos, isotipos) desde public/certificates/ como
 * data URL PNG para embeber en el render de @react-pdf/renderer.
 *
 * Por que data URL: @react-pdf/renderer NO soporta `Image src="/path"`
 * para archivos locales en serverless. data URL es la unica forma
 * portable que funciona en Vercel + dev local + tests.
 *
 * Cache: en serverless cada request arranca un nuevo container,
 * asi que el cache por-request no ayuda. fs.readFileSync es rapido
 * (5KB-10KB archivos PNG), no vale la pena mem-pool para este caso.
 *
 * Los assets en public/certificates/ son COPIAS de los originales en
 * docs/qlick-cert-system/assets/ (del agente de diseno). NO modifica los
 * originales.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = join(process.cwd(), "public", "certificates");

export function loadAssetAsDataUrl(filename: string): string {
  const path = join(ASSETS_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(
      `[certificates/asset-loader] Asset no encontrado: ${path}. ` +
        `Verifica que public/certificates/${filename} exista.`,
    );
  }
  const buf = readFileSync(path);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export function loadSvgAsText(filename: string): string {
  const path = join(ASSETS_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(
      `[certificates/asset-loader] Asset no encontrado: ${path}.`,
    );
  }
  return readFileSync(path, "utf-8");
}
