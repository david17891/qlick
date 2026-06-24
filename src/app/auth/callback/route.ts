/**
 * OAuth callback de admin.
 *
 * Supabase redirige aquí tras clic en el magic link. Intercambiamos el `code`
 * por sesión y validamos el allowlist.
 *
 * Seguridad:
 * - Si el email no está autorizado → cerramos sesión inmediatamente y mandamos
 *   a /admin/login?error=forbidden. Nadie con sesión pero sin permiso entra.
 * - Si el intercambio del code falla → /admin/login?error=callback.
 * - Si todo OK → /admin.
 *
 * Usamos el cliente server (respects RLS) que setea cookies en la respuesta.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig, isValidSupabaseUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw =
    typeof process !== "undefined" && process.env
      ? process.env.ADMIN_EMAIL_ALLOWLIST
      : "";
  if (!raw) return false;
  const allow = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  return allow.has(email.trim().toLowerCase());
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const code = url.searchParams.get("code");
  const loginUrl = (suffix?: string) => {
    const u = req.nextUrl.clone();
    u.pathname = "/admin/login";
    u.search = suffix ? `?error=${suffix}` : "";
    return u;
  };

  // Sin code no hay nada que intercambiar.
  if (!code) {
    return NextResponse.redirect(loginUrl("callback"));
  }

  // Si Supabase no está configurado, no deberíamos estar aquí.
  if (!isValidSupabaseUrl(supabaseConfig.url) || !supabaseConfig.publishableKey) {
    return NextResponse.redirect(loginUrl("callback"));
  }

  // Respuesta sobre la que setearemos las cookies de sesión.
  const res = NextResponse.next({
    request: { headers: req.headers },
  });

  const supabase = createServerClient(
    supabaseConfig.url,
    supabaseConfig.publishableKey,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(loginUrl("callback"));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Validación del allowlist: rechazo explícito si no es admin.
  if (!isAdmin(user?.email)) {
    // Cerramos sesión para no dejar cookies activas de un usuario no autorizado.
    await supabase.auth.signOut();
    return NextResponse.redirect(loginUrl("forbidden"));
  }

  // OK: redirigir al panel.
  const adminUrl = req.nextUrl.clone();
  adminUrl.pathname = "/admin";
  adminUrl.search = "";
  return NextResponse.redirect(adminUrl);
}
