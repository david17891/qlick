/**
 * Endpoint DEV/TEST: login "one-shot" para tests automatizados.
 *
 * **Actualizado 2026-06-29:** ahora funciona también en production,
 * gated solo por `DEV_ADMIN_SECRET`. El email puede ser CUALQUIERA (no
 * solo admins). Esto permite:
 * - Login admin con email de `ADMIN_EMAIL_ALLOWLIST` (David).
 * - Login student con cualquier email (auto-crea el user si no existe).
 * - Login como visitante (sin auth) — handled por no llamar este endpoint.
 *
 * Diferencia con `/api/dev/admin-session`:
 * - `admin-session` devuelve {email, password} y deja al cliente hacer
 *   `signInWithPassword()` por su cuenta (útil para debug manual).
 * - `login` (este) hace el signInWithPassword server-side y devuelve
 *   la response con Set-Cookie. **Una sola llamada de curl/Playwright
 *   deja al cliente autenticado en cualquier ruta.**
 *
 * PROPÓSITO
 * - Bypassear el rate-limit del plan free de Supabase (2 emails/hora) durante
 *   el desarrollo local y tests automatizados.
 * - Permitir que Playwright MCP audite `/admin/**` y `/dashboard` sin
 *   magic link.
 * - Permitir que Mavis (agente) testee en production sin browser interactivo.
 *
 * REGLAS DURAS
 * - DEV_ADMIN_SECRET debe estar configurado en .env.local + Vercel → si no, 404.
 * - El `secret` enviado en el body debe coincidir con DEV_ADMIN_SECRET.
 * - (Removido 2026-06-29: NODE_ENV check. El endpoint corre en todos los envs.)
 * - (Removido 2026-06-29: isAdminEmail check. Acepta cualquier email.)
 *
 * FLUJO
 * 1. Valida los gates.
 * 2. Crea/actualiza el user con password aleatorio (admin client, service_role).
 * 3. Hace signInWithPassword con un server client (publishable key, setea
 *    cookies SSR). La response lleva los Set-Cookie que el cliente debe
 *    preservar para requests subsiguientes.
 * 4. Devuelve { ok: true, email, userId, redirectTo, isAdmin }.
 *
 * SEGURIDAD (resumen)
 * - El secret es la única barrera (64 chars hex = 256 bits de entropía).
 * - El password es aleatorio por request (no reutilizable).
 * - Auto-crea el user si no existe — útil para tests, no abusar en prod real.
 * - NO publicar el secret. Mantener en .env.local + Vercel env vars.
 * - Si el secret se compromete: rotarlo en Vercel + .env.local simultáneamente.
 *
 * USO DESDE MAVIS (testing)
 *
 *   $secret = (Get-Content .env.local | Select-String 'DEV_ADMIN_SECRET').ToString().Split('"')[1]
 *   $body = @{ email = "david17891@gmail.com"; secret = $secret } | ConvertTo-Json
 *   Invoke-RestMethod -Uri "https://qlick-three.vercel.app/api/dev/login" `
 *     -Method Post -Body $body -ContentType "application/json" `
 *     -SessionVariable session
 *   # Cookies de session quedan guardadas, próximas requests con -WebSession $session
 *
 * USO DESDE PLAYWRIGHT (ejemplo con @playwright/test)
 *
 *   test("admin accesible", async ({ page, request }) => {
 *     const res = await request.post("/api/dev/login", {
 *       data: { email: "david17891@gmail.com", secret: process.env.DEV_ADMIN_SECRET! },
 *     });
 *     expect(res.ok()).toBeTruthy();
 *
 *     await page.goto("/admin");
 *     await expect(page).toHaveURL(/\/admin/);
 *   });
 *
 * VER TAMBIÉN
 * - docs/DEV_LOGIN_BYPASS.md — guía completa de uso.
 * - src/app/api/dev/admin-session/route.ts — endpoint "credential dispenser"
 *   (este NO lo reemplaza; viven juntos).
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-auth";
import { supabaseConfig, isValidSupabaseUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

interface RequestBody {
  email?: unknown;
  secret?: unknown;
}

export async function POST(request: Request) {
  // Gate 1: DEV_ADMIN_SECRET configurado.
  const expectedSecret = process.env.DEV_ADMIN_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      {
        error:
          "DEV_ADMIN_SECRET no está configurado. Ver docs/DEV_LOGIN_BYPASS.md.",
      },
      { status: 404 },
    );
  }

  // Gate 2: Supabase configurado (necesario para signInWithPassword).
  if (!isValidSupabaseUrl(supabaseConfig.url) || !supabaseConfig.publishableKey) {
    return NextResponse.json(
      {
        error:
          "Supabase no está configurado (URL/publishable key faltan). Ver docs/SUPABASE_CONNECTION_BOOTSTRAP.md.",
      },
      { status: 404 },
    );
  }

  // Parse + validación de input.
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
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
  // (Removido 2026-06-29: isAdminEmail check. Acepta cualquier email.)

  // --- Crear/actualizar user con password aleatorio (service role) ---
  const adminClient = createSupabaseAdminClient();
  const password = `dev-${randomUUID()}-${randomUUID().slice(0, 8)}`;

  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // No requiere confirmación: es dev.
    });

  let userId = created?.user?.id;
  if (createError || !userId) {
    // El user probablemente ya existe. Buscar por email y actualizar password.
    const { data: listData, error: listError } =
      await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
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
    const { error: updateError } =
      await adminClient.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      return NextResponse.json(
        { error: `No se pudo actualizar password: ${updateError.message}` },
        { status: 500 },
      );
    }
  }

  // --- signInWithPassword server-side con cookies SSR ---
  // Patrón de NextResponse: construimos la response primero y conectamos
  // los setAll() del SSR client a ella. Esto escribe las cookies sb-* en
  // la response que devolvemos.
  const adminCheck = isAdminEmail(email);
  const res = NextResponse.json({
    ok: true,
    email,
    userId,
    isAdmin: adminCheck,
    redirectTo: adminCheck ? "/admin" : "/dashboard",
    note: adminCheck
      ? "Sesión admin iniciada. Las cookies sb-* están en Set-Cookie. Redirigir a /admin."
      : "Sesión student iniciada. Las cookies sb-* están en Set-Cookie. Redirigir a /dashboard.",
  });

  const supabase = createServerClient(
    supabaseConfig.url,
    supabaseConfig.publishableKey,
    {
      cookies: {
        getAll() {
          // No leemos cookies previos — es un login fresco.
          return [];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.user) {
    return NextResponse.json(
      {
        error: `signInWithPassword falló: ${error?.message ?? "sin usuario devuelto"}. El user fue creado/actualizado pero la sesión no. Reintentar o revisar logs de Supabase.`,
      },
      { status: 500 },
    );
  }

  return res;
}