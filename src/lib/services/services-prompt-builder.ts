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
    // Fallback honesto cuando la base de datos no tiene servicios activos o no está disponible
    lines.push(
      "INFORMACIÓN TEMPORAL DE CATÁLOGO:",
      "El catálogo detallado de servicios en tiempo real no pudo ser confirmado por el sistema en este momento.",
      "Para consultar paquetes actualizados y precios oficiales, puedes referir al usuario a la página pública:",
      "https://qlick.digital/servicios o indicar honestamente que un especialista de Qlick se pondrá en contacto para brindarle los detalles exactos."
    );
  } else {
    lines.push("Servicios activos disponibles:");
    services.forEach((s, idx) => {
      lines.push(`\n[${idx + 1}] ${s.displayName} (slug: ${s.slug})`);
      if (s.shortDescription) lines.push(`    Descripción: ${s.shortDescription}`);
      if (s.bullets && s.bullets.length > 0) {
        lines.push(`    Puntos clave: ${s.bullets.join(" • ")}`);
      }
      if (s.variants && s.variants.length > 0) {
        lines.push("    Paquetes / Precios:");
        s.variants.forEach((v) => {
          lines.push(`      - ${v.label}: $${v.priceMXN.toLocaleString("es-MX")} MXN`);
          if (v.description) {
            lines.push(`        Detalle: ${v.description}`);
          }
          if (v.includes && v.includes.length > 0) {
            lines.push(`        Incluye: ${v.includes.join(", ")}`);
          }
          if (v.deliveryDaysMin && v.deliveryDaysMax) {
            lines.push(`        Entrega: ${v.deliveryDaysMin}-${v.deliveryDaysMax} días`);
          }
        });
      } else if (s.defaultPriceMXN) {
        lines.push(`    Precio: $${s.defaultPriceMXN.toLocaleString("es-MX")} MXN`);
      }
    });
  }

  lines.push(
    "",
    "=== PROTOCOLO Y REGLAS COMERCIALES DE ATENCIÓN B2B ===",
    "1. INVERSIÓN PUBLICITARIA SEPARADA: La inversión publicitaria en Meta Ads (Facebook/Instagram) es abonada directamente por el cliente a Meta y es independiente de la tarifa de servicio de Qlick.",
    "2. INFORMACIÓN FACTUAL: Presenta únicamente los paquetes, precios e incluidores reales del catálogo. No inventes garantizados de ventas, leads exactos ni citas en calendario.",
    "3. NÚMERO DE WHATSAPP IMPLÍCITO (NUNCA PEDIR TELÉFONO): Estás chateando por WhatsApp con el cliente, por lo que YA TIENES su número. NUNCA pidas 'un número', 'tu teléfono', 'un número o correo para que te localicen' ni digas 'quedo pendiente con tu número'. Asume siempre que el contacto por WhatsApp o llamada es a este mismo número.",
    "4. EMAIL OPCIONAL EN SERVICIOS (NUNCA INSISTIR): En servicios B2B (agencia, diseño web, Meta Ads, llamada de diagnóstico), el correo electrónico es 100% OPCIONAL. Si el cliente dice 'con este número está bien', da su nombre o pide ser contactado, CONFIRMA DE INMEDIATO (ej: '¡Perfecto David! Ya quedó registrada tu solicitud, un especialista de Qlick te contactará directo a este WhatsApp'). NUNCA insistas por el correo ni vuelvas a preguntar '¿me compartes tu mejor correo para tener tus datos completos?'.",
    "5. ATENCIÓN CONSULTIVA Y CONFIRMACIÓN RÁPIDA: Explica brevemente el alcance del servicio y confirma de inmediato la solicitud de contacto.",
    "6. ESCALACIÓN A HUMANO: Si el usuario requiere propuesta a medida, presupuesto especial o atención personalizada, responde amablemente y emite `[[ESCALATE_HUMAN]]` al final de tu mensaje.",
    "7. CERO META-RAZONAMIENTO: NUNCA incluyas análisis interno como 'Aquí tengo dos opciones...', 'El lead puede referirse a...', 'Dado que preguntó...' o 'aplico el protocolo'. Empieza DIRECTAMENTE con la respuesta al cliente.",
    "================================================================"
  );

  return lines.join("\n");
}

let cachedPromptBlock: { block: string; expiresAt: number } | null = null;

/**
 * Carga los servicios activos de Supabase y devuelve el bloque de prompt listo (con caché de 5 minutos).
 */
export async function getServicesPromptBlock(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedPromptBlock && cachedPromptBlock.expiresAt > now) {
    return cachedPromptBlock.block;
  }

  try {
    const services = await getActiveServices();
    const block = formatServicesPromptBlock(services);
    cachedPromptBlock = { block, expiresAt: now + 5 * 60 * 1000 };
    return block;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[services-prompt-builder] Error cargando servicios:", err);
    const fallbackBlock = formatServicesPromptBlock([]);
    cachedPromptBlock = { block: fallbackBlock, expiresAt: now + 5 * 60 * 1000 };
    return fallbackBlock;
  }
}
