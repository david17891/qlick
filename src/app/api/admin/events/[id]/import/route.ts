import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { getEventById } from "@/lib/events/events-server";
import { runEventImport } from "@/lib/events/runEventImport";
import type { EventImportType } from "@/types/events";

/**
 * Import wizard — endpoint que ejecuta (o simula) el import.
 *
 * POST /api/admin/events/[id]/import
 *   content-type: multipart/form-data
 *   fields:
 *     - file: .xlsx
 *     - type: "confirmation" | "attendee" | "survey"
 *     - dryRun: "true" | "false"
 *     - mapOverride: JSON opcional (canonical → header Excel)
 *   -> { ok: true, summary: EventImportSummary }
 *
 * Server-only, admin (defensa en profundidad).
 */
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!checkSupabaseConfig().configured) {
    return NextResponse.json(
      { ok: false, error: "Supabase no configurado (modo demo)." },
      { status: 501 },
    );
  }
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "No autenticado como admin." },
      { status: 401 },
    );
  }

  const event = await getEventById(params.id);
  if (!event) {
    return NextResponse.json(
      { ok: false, error: "Evento no encontrado." },
      { status: 404 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body multipart inválido." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const typeRaw = formData.get("type");
  const dryRunRaw = formData.get("dryRun");
  const mapOverrideRaw = formData.get("mapOverride");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Falta el archivo .xlsx." },
      { status: 400 },
    );
  }
  if (typeof typeRaw !== "string" || !["confirmation", "attendee", "survey"].includes(typeRaw)) {
    return NextResponse.json(
      { ok: false, error: "Tipo inválido (debe ser confirmation/attendee/survey)." },
      { status: 400 },
    );
  }

  let mapOverride: Record<string, string> | undefined;
  if (typeof mapOverrideRaw === "string" && mapOverrideRaw.trim()) {
    try {
      const parsed = JSON.parse(mapOverrideRaw);
      if (parsed && typeof parsed === "object") {
        mapOverride = parsed as Record<string, string>;
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "mapOverride debe ser JSON válido." },
        { status: 400 },
      );
    }
  }

  const dryRun = dryRunRaw === "true" || dryRunRaw === "1";

  const buffer = Buffer.from(await file.arrayBuffer());

  const summary = await runEventImport({
    eventId: event.id,
    eventSlug: event.slug,
    buffer,
    type: typeRaw as EventImportType,
    mapOverride,
    dryRun,
    actorEmail: admin.email,
  });

  return NextResponse.json({ ok: true, summary });
}