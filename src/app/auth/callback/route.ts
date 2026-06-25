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

  // Si Supabase redirige con parámetros de error (p. ej. otp_expired, el
  // enlace ya no es válido), mapear a un error legible para el usuario.
  const sbError = url.searchParams.get("error_code");
  if (!code && sbError) {
    const mapped = sbError === "otp_expired" ? "expired" : "callback";
    return NextResponse.redirect(loginUrl(mapped));
  }

  // Sin code ni error de Supabase: nada que intercambiar.
  if (!code) {
    return NextResponse.redirect(loginUrl("callback"));
  }

  // Si Supabase no está configurado, no deberíamos estar aquí.
  if (!isValidSupabaseUrl(supabaseConfig.url) || !supabaseConfig.publishableKey) {
    return NextResponse.redirect(loginUrl("callback"));
  }

  // Respuesta final de éxito: redirect a /admin. Las cookies de sesión se
  // setean SOBRE esta respuesta (la que efectivamente devolvemos). Si las
  // seteáramos en un NextResponse.next() intermedio y devolviéramos un redirect
  // distinto, las Set-Cookie se perderían y el middleware nos rebotaría al
  // login sin sesión (bug que teníamos antes de este cambio).
  const adminUrl = req.nextUrl.clone();
  adminUrl.pathname = "/admin";
  adminUrl.search = "";
  const successRes = NextResponse.redirect(adminUrl);

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
            successRes.cookies.set(name, value, options);
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
    // El successRes (con las cookies de sesión) se descarta: devolvemos el
    // redirect al login, así el navegador nunca recibe esa sesión.
    await supabase.auth.signOut();
    return NextResponse.redirect(loginUrl("forbidden"));
  }

  // OK: devolvemos el redirect a /admin con las cookies de sesión ya adjuntas.
  return successRes;
}
