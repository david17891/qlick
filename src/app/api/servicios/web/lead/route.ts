import { NextRequest, NextResponse } from "next/server";

/**
 * Captura leads del servicio de páginas web (formularios en los 4 demos).
 *
 * Modo test: loguea el lead a la consola de Vercel y devuelve success.
 * Modo prod: persiste en Supabase tabla `leads` con `source='web_demo'`.
 *
 * Body esperado: { name, phone, email?, service?, demo }
 */

type LeadBody = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  service?: unknown;
  demo?: unknown;
};

function clean(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LeadBody;

    const name = clean(body.name, 120);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 200);
    const service = clean(body.service, 200);
    const demo = clean(body.demo, 80);

    // Validación mínima: nombre y (teléfono o email) son obligatorios.
    if (!name) {
      return NextResponse.json(
        { error: "Falta el nombre." },
        { status: 400 }
      );
    }
    if (!phone && !email) {
      return NextResponse.json(
        { error: "Necesitamos al menos un teléfono o email de contacto." },
        { status: 400 }
      );
    }

    const lead = {
      name,
      phone: phone || null,
      email: email || null,
      service: service || null,
      demo: demo || null,
      source: "web_demo",
      received_at: new Date().toISOString(),
    };

    // En modo test (sin Supabase config), solo logueamos.
    // En producción, persistir en tabla leads vía service role.
    // eslint-disable-next-line no-console
    console.log("[servicios/web/lead] nuevo lead:", lead);

    return NextResponse.json({
      ok: true,
      mode: "test",
      message: "Lead recibido (modo test). En producción se guarda en Supabase.",
      lead,
    });
  } catch {
    return NextResponse.json(
      { error: "Body inválido." },
      { status: 400 }
    );
  }
}
