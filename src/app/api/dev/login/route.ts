/**
 * Endpoint DEV ONLY: login admin "one-shot" para tests automatizados.
 *
 * Diferencia con `/api/dev/admin-session` (que ya existía):
 * - `admin-session` devuelve {email, password} y deja al cliente hacer
 *   `signInWithPassword()` por su cuenta (útil para debug manual).
 * - `login` (este) hace el signInWithPassword server-side y devuelve
 *   la response con Set-Cookie. **Una sola llamada de curl/Playwright
 *   deja al cliente autenticado en `/admin`.** Es el camino "easy button"
 *   para Playwright MCP y tests E2E.
 *
 * PROPÓSITO
 * - Bypassear el rate-limit del plan free de Supabase (2 emails/hora) durante
 *   el desarrollo local y tests automatizados.
 * - Permitir que Playwright MCP audite `/admin/**` sin magic link.
 *
 * REGLAS DURAS (mismas que admin-session — no ablandar ninguna)
 * - NODE_ENV !== "production" → si no, devuelve 404 (no revela que existe).
 * - DEV_ADMIN_SECRET debe estar configurado en .env.local → si no, 404.
 * - El `secret` enviado en el body debe coincidir con DEV_ADMIN_SECRET.
 * - El email debe estar en ADMIN_EMAIL_ALLOWLIST.
 *
 * FLUJO
 * 1. Valida los 4 gates.
 * 2. Crea/actualiza el user con password aleatorio (admin client, service_role).
 * 3. Hace signInWithPassword con un server client (publishable key, setea
 *    cookies SSR). La response lleva los Set-Cookie que el cliente debe
 *    preservar para requests subsiguientes.
 * 4. Devuelve { ok: true, email, userId, redirectTo }.
 *
 * SEGURIDAD (resumen)
 * - En prod el endpoint devuelve 404 (no llega ni a leer BD).
 * - El secret es la única barrera; el allowlist limita a admins ya autorizados.
 * - El password es aleatorio por request (no reutilizable).
 * - ⚠️ NO mergear este patrón a producción. Es dev-only por diseño.
 *
 * USO DESDE PLAYWRIGHT (ejemplo con @playwright/test)
 *
 *   test("admin accesible", async ({ page, request }) => {
 *     // request.post() preserva cookies en el storage state del context
 *     // que comparte con page.
 *     const res = await request.post("/api/dev/login", {
 *       data: { email: "david17891@gmail.com", secret: process.env.DEV_ADMIN_SECRET! },
 *     });
 *     expect(res.ok()).toBeTruthy();
 *
 *     await page.goto("/admin");
 *     await expect(page).toHaveURL(/\/admin/);
 *   });
 *
 * USO DESDE PLAYWRIGHT MCP
 *
 *   1. mavis mcp call playwright browser_navigate \
 *        '{"url":"http://localhost:3000/api/dev/login"}'  ← NO, es GET
 *
 *   2. mavis mcp call playwright browser_evaluate \
 *        '{"function":"async () => { const r = await fetch(\"/api/dev/login\", { method: \"POST\", headers: {\"Content-Type\":\"application/json\"}, body: JSON.stringify({ email:\"david17891@gmail.com\", secret: prompt(\"secret:\") }) }); return r.status; }"}'
 *
 *   El método más limpio: configurar Playwright para que el storage state
 *   del context se comparta entre browser y una request API externa. Pero
 *   con MCP eso requiere un workaround — la alternativa es exponer el
 *   endpoint como script CLI (ver tests/playwright/dev-login.mjs) que hace
 *   la llamada y deja un storage state listo.
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
  // Gate 1: NODE_ENV !== "production".
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Gate 2: DEV_ADMIN_SECRET configurado.
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

  // Gate previo: Supabase configurado (necesario para signInWithPassword).
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

  // Gate 4: email en allowlist.
  if (!isAdminEmail(email)) {
    return NextResponse.json(
      { error: "Email no está en ADMIN_EMAIL_ALLOWLIST." },
      { status: 403 },
    );
  }

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
  const res = NextResponse.json({
    ok: true,
    email,
    userId,
    redirectTo: "/admin",
    note: "Sesión iniciada. Las cookies sb-* están en Set-Cookie. Si usas Playwright, el storage state del context queda listo para navegar a /admin.",
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