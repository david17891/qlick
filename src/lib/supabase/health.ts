/**
 * Health-check de la conexión Supabase.
 *
 * No lanza nunca: solo reporta qué está configurado y qué falta. Pensado para
 * usarse desde:
 * - La ruta interna `/admin/system/supabase` (panel de diagnóstico).
 * - El script `scripts/check-supabase-env.mjs` (vía los mismos mensajes).
 * - Cualquier Server Component que quiera saber si operar en modo real o demo.
 *
 * Seguridad: nunca incluye valores de claves, solo presencia/ausencia y longitud.
 */

import {
  supabaseConfig,
  isValidSupabaseUrl,
  looksLikeKey,
} from "./config";

export interface SupabaseHealthCheck {
  /** true si las variables mínimas para operar en modo real están presentes. */
  configured: boolean;
  /** Modo efectivo de la app según la configuración. */
  mode: "demo" | "configured";
  url: {
    present: boolean;
    valid: boolean;
  };
  publishableKey: {
    present: boolean;
    /** Tiene pinta de JWT (3 segmentos). No valida firma. */
    wellFormed: boolean;
  };
  secretKey: {
    present: boolean;
    wellFormed: boolean;
    /** Server-only: el health nunca revela el valor, solo su presencia. */
  };
  projectRef: {
    present: boolean;
  };
  appUrl: {
    present: boolean;
    value: string;
  };
  /** Mensajes accionables para el operador (sin secretos). */
  warnings: string[];
  /** true cuando está listo para datos reales (previo RLS + aviso de privacidad). */
  readyForRealData: boolean;
}

/**
 * Devuelve el estado de configuración de Supabase. Puro, sin side-effects,
 * sin lanzar. Llamar desde servidor (los valores secretos solo viven ahí).
 */
export function checkSupabaseConfig(): SupabaseHealthCheck {
  const url = supabaseConfig.url;
  const publishable = supabaseConfig.publishableKey;
  const secret = supabaseConfig.secretKey;
  const projectRef = supabaseConfig.projectRef;
  const appUrl = supabaseConfig.appUrl;

  const urlPresent = Boolean(url);
  const urlValid = isValidSupabaseUrl(url);
  const publishablePresent = Boolean(publishable);
  const publishableWellFormed = looksLikeKey(publishable);
  const secretPresent = Boolean(secret);
  const secretWellFormed = looksLikeKey(secret);

  // Mínimo para operar en modo "real": URL válida + publishable key bien formada.
  const configured = urlValid && publishablePresent;

  const warnings: string[] = [];
  if (!urlPresent) {
    warnings.push("Falta NEXT_PUBLIC_SUPABASE_URL (modo demo).");
  } else if (!urlValid) {
    warnings.push(
      "NEXT_PUBLIC_SUPABASE_URL tiene formato inválido (debe ser https://*.supabase.co).",
    );
  }
  if (!publishablePresent) {
    warnings.push(
      "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (alias legacy: NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  } else if (!publishableWellFormed) {
    warnings.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no parece un JWT (3 segmentos).",
    );
  }
  if (!secretPresent) {
    // No es bloqueante para el modo demo, pero sí para operaciones admin.
    warnings.push(
      "Falta SUPABASE_SECRET_KEY (solo necesaria para operaciones server-side con bypass de RLS).",
    );
  } else if (!secretWellFormed) {
    warnings.push("SUPABASE_SECRET_KEY no parece un JWT (3 segmentos).");
  }
  if (!projectRef) {
    warnings.push(
      "Falta SUPABASE_PROJECT_REF (requerido solo para CLI/MCP, no para el runtime).",
    );
  }

  // readyForRealData exige lo mínimo de conexión; el RLS/aviso de privacidad
  // son un bloqueador de producto, no de configuración (se reporta aparte).
  const readyForRealData = configured && secretPresent;

  return {
    configured,
    mode: configured ? "configured" : "demo",
    url: { present: urlPresent, valid: urlValid },
    publishableKey: {
      present: publishablePresent,
      wellFormed: publishableWellFormed,
    },
    secretKey: {
      present: secretPresent,
      wellFormed: secretWellFormed,
    },
    projectRef: { present: Boolean(projectRef) },
    appUrl: { present: Boolean(appUrl), value: appUrl },
    warnings,
    readyForRealData,
  };
}

/**
 * Banner de seguridad reutilizable: bloquea el uso de datos reales hasta que
 * exista RLS + aviso de privacidad. Devuelve el texto, no imprime nada.
 */
export function realDataAdvisory(): string {
  return [
    "No uses datos reales de clientes hasta que:",
    "  1. Esté creado el proyecto Supabase con las tablas correspondientes.",
    "  2. RLS (Row Level Security) esté activo en todas las tablas.",
    "  3. El aviso de privacidad esté publicado (LFPDPPP).",
  ].join("\n");
}
