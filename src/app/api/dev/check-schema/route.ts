/**
 * Endpoint DEBUG: retorna metadata del schema de Supabase (columnas de `leads`).
 *
 * DEV-ONLY: este endpoint NO debe quedar en producción. Se elimina después
 * de auditar el schema (ver docs/OPEN_ITEMS.md item 6).
 *
 * Acceso: requiere `DEV_ADMIN_SECRET` en el body (mismo patrón que `/api/dev/login`).
 * Solo funciona en producción porque las env vars sensitive están ahí.
 *
 * @server
 */

import { NextRequest, NextResponse } from "next/server";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface ColumnCheck {
  column: string;
  /** PGRST204 si la columna NO existe; OK si existe; null si no probado. */
  status: "exists" | "missing" | "unknown";
  errorCode?: string;
  errorMessage?: string;
}

interface TableCheck {
  /** Lista de columnas que verificamos + status. */
  columns: ColumnCheck[];
}

export async function POST(req: NextRequest) {
  // Auth: requiere DEV_ADMIN_SECRET para evitar acceso público.
  const body = (await req.json().catch(() => ({}))) as { secret?: string };
  const expected = process.env.DEV_ADMIN_SECRET ?? "";
  if (!expected || body.secret !== expected) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, message: "Supabase no configurado" },
      { status: 500 }
    );
  }

  const supabase = createSupabaseAdminClient();

  // Verificamos columnas específicas haciendo un SELECT dummy que las incluya.
  // Si PostgREST devuelve PGRST204, la columna no existe.
  // Si responde con data (aunque sea vacía), la columna existe.
  const checks: Record<string, TableCheck> = {
    leads: {
      columns: [
        { column: "whatsapp_status", status: "unknown" },
        { column: "last_contacted_at", status: "unknown" },
        { column: "phone_normalized", status: "unknown" }
      ]
    },
    lead_whatsapp_log: {
      columns: [
        { column: "lead_id", status: "unknown" },
        { column: "new_status", status: "unknown" },
        { column: "prev_status", status: "unknown" },
        { column: "actor_email", status: "unknown" },
        { column: "metadata", status: "unknown" }
      ]
    },
    lead_whatsapp_conversations: {
      columns: [
        { column: "lead_id", status: "unknown" },
        { column: "whatsapp_message_id", status: "unknown" },
        { column: "related_event_id", status: "unknown" }
      ]
    }
  };

  // Test leads: SELECT con todas las columnas dudosas
  const leadsTest = await supabase
    .from("leads")
    .select("whatsapp_status, last_contacted_at, phone_normalized" as never)
    .limit(1);
  if (leadsTest.error) {
    const msg = leadsTest.error.message;
    // PGRST204 = "Could not find column" - extraemos qué columnas faltan
    const missing = msg.match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
    for (const col of checks.leads.columns) {
      if (missing.includes(col.column)) {
        col.status = "missing";
        col.errorCode = leadsTest.error.code;
        col.errorMessage = msg;
      } else if (!msg.includes(col.column)) {
        col.status = "exists";
      } else {
        col.status = "missing";
        col.errorCode = leadsTest.error.code;
        col.errorMessage = msg;
      }
    }
  } else {
    for (const col of checks.leads.columns) col.status = "exists";
  }

  // Test lead_whatsapp_log: SELECT dummy
  const logTest = await supabase
    .from("lead_whatsapp_log")
    .select("lead_id, new_status, prev_status, actor_email, metadata" as never)
    .limit(1);
  if (logTest.error) {
    const msg = logTest.error.message;
    const missing = msg.match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
    for (const col of checks.lead_whatsapp_log.columns) {
      if (missing.includes(col.column)) {
        col.status = "missing";
        col.errorCode = logTest.error.code;
        col.errorMessage = msg;
      } else if (!msg.includes(col.column)) {
        col.status = "exists";
      } else {
        col.status = "missing";
        col.errorCode = logTest.error.code;
        col.errorMessage = msg;
      }
    }
  } else {
    for (const col of checks.lead_whatsapp_log.columns) col.status = "exists";
  }

  // Test lead_whatsapp_conversations: SELECT dummy
  const convTest = await supabase
    .from("lead_whatsapp_conversations" as never)
    .select("lead_id, whatsapp_message_id, related_event_id" as never)
    .limit(1);
  if (convTest.error) {
    const msg = convTest.error.message;
    const missing = msg.match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
    for (const col of checks.lead_whatsapp_conversations.columns) {
      if (missing.includes(col.column)) {
        col.status = "missing";
        col.errorCode = convTest.error.code;
        col.errorMessage = msg;
      } else if (!msg.includes(col.column)) {
        col.status = "exists";
      } else {
        col.status = "missing";
        col.errorCode = convTest.error.code;
        col.errorMessage = msg;
      }
    }
  } else {
    for (const col of checks.lead_whatsapp_conversations.columns) col.status = "exists";
  }

  return NextResponse.json({ ok: true, schema: checks });
}