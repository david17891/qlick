/**
 * Endpoint DEBUG TEMPORAL: retorna valores de env vars (sin filtro).
 *
 * Solo para diagnóstico de "Meta no entrega webhooks". Se elimina
 * inmediatamente después de obtener lo que necesitamos.
 *
 * NO PUBLICO. PELIGRO: expone tokens en texto plano.
 *
 * @server
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  // Solo devolver vars que necesitamos para diagnóstico, no todas.
  const keys = [
    "WHATSAPP_CLOUD_ACCESS_TOKEN",
    "WHATSAPP_CLOUD_WABA_ID",
    "WHATSAPP_CLOUD_APP_ID",
    "WHATSAPP_CLOUD_PHONE_NUMBER_ID",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "WHATSAPP_WEBHOOK_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_PROJECT_REF"
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return NextResponse.json(out);
}
