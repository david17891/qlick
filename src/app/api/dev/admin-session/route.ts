/**
 * Endpoint DEV ONLY: crea/asegura una cuenta admin con password temporal
 * y devuelve las credenciales al cliente para que use `signInWithPassword`.
 *
 * PROPÓSITO
 * - Bypassear el rate-limit del plan free de Supabase (2 emails/hora) durante
 *   el desarrollo local. El magic link es correcto para producción, pero
 *   bloquea la iteración en dev.
 *
 * REGLAS DURAS (todas se validan antes de tocar la BD)
 * - NODE_ENV !== "production" → si no, devuelve 404 (no revela que existe).
 * - DEV_ADMIN_SECRET debe estar configurado en .env.local → si no, 404.
 * - El `secret` enviado en el body debe coincidir con DEV_ADMIN_SECRET.
 * - El email debe estar en ADMIN_EMAIL_ALLOWLIST (mismo control que la auth real).
 *
 * QUÉ HACE
 * - Genera un password aleatorio con crypto.randomUUID() (32 chars hex + extras).
 * - Llama admin.createUser() — si el user ya existe, ignora el error y
 *   llama admin.updateUserById() para forzar el nuevo password.
 * - Devuelve { email, password } al cliente.
 * - El cliente hace supabase.auth.signInWithPassword() → cookies vía PKCE
 *   normal → ya está logueado en /admin.
 *
 * POR QUÉ ES SEGURO
 * - En producción el endpoint devuelve 404 (no llega ni a leer BD).
 * - El secret en .env.local (no comiteado) es la única barrera.
 * - El allowlist limita a admins ya autorizados.
 * - El password es aleatorio por request (no reutilizable).
 *
 * ⚠️ NO mergear este patrón a producción. Es dev-only por diseño.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

interface RequestBody {
  email?: unknown;
  secret?: unknown;
}

export async function POST(request: Request) {
  // Gate 1: NODE_ENV !== "production". Si falla, 404 silencioso.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Gate 2: DEV_ADMIN_SECRET debe estar configurado.
  const expectedSecret = process.env.DEV_ADMIN_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      {
        error:
          "DEV_ADMIN_SECRET no está configurado en .env.local. Ver docs/DEV_LOGIN_BYPASS.md.",
      },
      { status: 404 },
    );
  }

  // Parseo + validación de input.
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!email || !secret) {
    return NextResponse.json(
      { error: "Faltan campos (email, secret)." },
      { status: 400 },
    );
  }

  // Gate 3: secret correcto.
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Secret incorrecto." }, { status: 403 });
  }

  // Gate 4: email en allowlist.
  if (!isAdminEmail(email)) {
    return NextResponse.json(
      { error: "Email no está en ADMIN_EMAIL_ALLOWLIST." },
      { status: 403 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const password = `dev-${randomUUID()}-${randomUUID().slice(0, 8)}`;

  // 1. Asegurar que el user existe (createUser falla si ya existe → fallback a update).
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // No requiere confirmación: es dev.
  });

  let userId = created?.user?.id;
  if (createError || !userId) {
    // El user probablemente ya existe. Buscar por email y actualizar password.
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listError) {
      return NextResponse.json(
        { error: `No se pudo buscar el user: ${listError.message}` },
        { status: 500 },
      );
    }
    const existing = listData?.users?.find(
      (u) => u.email?.toLowerCase() === email,
    );
    if (!existing) {
      return NextResponse.json(
        {
          error:
            createError?.message ??
            "No se pudo crear ni encontrar el user admin.",
        },
        { status: 500 },
      );
    }
    userId = existing.id;
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { password },
    );
    if (updateError) {
      return NextResponse.json(
        { error: `No se pudo actualizar password: ${updateError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    email,
    password,
    userId,
    note:
      "Credenciales temporales (válidas solo para esta sesión dev). El cliente debe llamar signInWithPassword() ahora.",
  });
}