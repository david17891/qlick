/**
 * Prompt Builder para Servicios B2B / Agencia Qlick.
 *
 * Genera el bloque de contexto formateado para el System Prompt del bot de WhatsApp,
 * integrando los servicios activos de la base de datos (Supabase) y definiendo
 * las directivas de atención consultiva, cualificación y el flujo de cierre dual.
 *
 * @server
 */

import type { ServiceWithVariants } from "@/types/services";
import { getActiveServices } from "./orders-server.ts";

/**
 * Formatea una lista de servicios y variantes en un bloque de texto listo para inyectar en el System Prompt.
 */
export function formatServicesPromptBlock(services: ServiceWithVariants[]): string {
  const lines: string[] = [
    "=== CATÁLOGO DE SERVICIOS DE AGENCIA Y CONSULTORÍA B2B QLICK ===",
    "Qlick Marketing Digital ofrece servicios profesionales de agencia, desarrollo y consultoría para negocios.",
  ];

  if (!services || services.length === 0) {
    // Fallback seguro si la DB no tiene servicios activos o está en modo demo
    lines.push(
      "Servicios principales disponibles:",
      "1. Presencia Local / Google Business Profile (desde $1,500 MXN): Optimización completa de perfil en Google Maps, fotos y capacitación.",
      "2. Diseño Web Adaptable / Landing Pages ($2,500 MXN Básico / $5,500 MXN Pro): Páginas web de alta conversión con botón de WhatsApp y SEO.",
      "3. Auditoría y Diagnóstico de Negocio 1a1 ($1,000 MXN Zoom / $2,000 MXN Presencial): Sesión de 60 min con estratega senior y reporte de acción.",
      "4. Kickstart de Meta Ads ($3,500 MXN Inicial / $12,000 MXN Recomendado + Ads / $18,000 MXN Premium 360°): Producción de anuncios con IA, segmentación y lanzamiento de campañas."
    );
  } else {
    lines.push("Servicios activos disponibles:");
    services.forEach((s, idx) => {
      lines.push(`\n[${idx + 1}] ${s.displayName} (slug: ${s.slug})`);
      if (s.shortDescription) lines.push(`    Descripción: ${s.shortDescription}`);
      if (s.bullets && s.bullets.length > 0) {
        lines.push(`    Incluye: ${s.bullets.slice(0, 4).join(" • ")}`);
      }
      if (s.variants && s.variants.length > 0) {
        lines.push("    Paquetes / Precios:");
        s.variants.forEach((v) => {
          lines.push(`      - ${v.label}: $${v.priceMXN.toLocaleString("es-MX")} MXN`);
        });
      } else if (s.defaultPriceMXN) {
        lines.push(`    Precio: $${s.defaultPriceMXN.toLocaleString("es-MX")} MXN`);
      }
    });
  }

  lines.push(
    "",
    "=== PROTOCOLO DE ATENCIÓN A LEADS DE SERVICIOS B2B ===",
    "Cuando un usuario pregunte por servicios de marketing, agencia, diseño web, anuncios o consultoría:",
    "1. ATENCIÓN CONSULTIVA: Sé profesional, cercano y honesto. Responde con los precios reales del catálogo sin ocultar costos.",
    "2. CUALIFICACIÓN BREVE: Pregunta amablemente por su negocio/giro y qué objetivo principal busca lograr (ej. generar más clientes, lanzar su sitio web, mejorar sus anuncios).",
    "3. FLUJO DE CIERRE DUAL (OBLIGATORIO): Ofrécele 2 alternativas para avanzar:",
    "   - Opción A (Agendar llamada de diagnóstico): Sugiere agendar una sesión/llamada de diagnóstico de 20 min preferentemente para EL DÍA SIGUIENTE en un horario entre 11:00 a. m. y 6:00 p. m.",
    "   - Opción B (Ser contactado por un especialista): Indícale que un especialista de Qlick puede ponerse en contacto directamente con él a su WhatsApp o por llamada.",
    "4. ESCALACIÓN A HUMANO: Si el usuario elije que un especialista lo busque, pide propuesta/cotización personalizada o requiere atención a medida, responde amablemente confirmando que el equipo lo buscará y EMITE `[[ESCALATE_HUMAN]]` al final de tu mensaje.",
    "================================================================"
  );

  return lines.join("\n");
}

/**
 * Carga los servicios activos de Supabase y devuelve el bloque de prompt listo.
 */
export async function getServicesPromptBlock(): Promise<string> {
  try {
    const services = await getActiveServices();
    return formatServicesPromptBlock(services);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[services-prompt-builder] Error cargando servicios:", err);
    return formatServicesPromptBlock([]);
  }
}
