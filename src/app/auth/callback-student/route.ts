/**
 * OAuth/magic-link callback para ALUMNOS.
 *
 * Supabase redirige aquí tras el clic en el magic link enviado desde
 * `/login` (StudentLoginPage). Intercambiamos el `code` por sesión y
 * verificamos que el usuario pueda actuar como alumno.
 *
 * Diferencias con `/auth/callback` (admin):
 * - Aquí NO validamos contra ADMIN_EMAIL_ALLOWLIST. Cualquier usuario
 *   autenticado es aceptado como alumno.
 * - Si el usuario resulta ser admin (por estar en el allowlist), igual lo
 *   dejamos pasar: la lógica de "admin no es alumno" está en `isStudentEmail`
 *   y se aplica cuando hace falta segregar (e.g. /dashboard). Aquí solo
 *   autenticamos — la autorización fina la maneja RLS.
 *
 * Seguridad:
 * - Si el intercambio del code falla → redirige a /login?error=callback.
 * - Si Supabase reporta otp_expired → /login?error=expired.
 * - Si todo OK → /dashboard.
 *
 * Las cookies de sesión se setean sobre la respuesta final (la del redirect
 * a /dashboard) para que el navegador las reciba junto con la navegación.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig, isValidSupabaseUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  const code = url.searchParams.get("code");

  const loginUrl = (suffix?: string) => {
    const u = req.nextUrl.clone();
    u.pathname = "/login";
    u.search = suffix ? `?error=${suffix}` : "";
    return u;
  };

  // Supabase puede redirigir con error_code (otp_expired, etc.).
  const sbError = url.searchParams.get("error_code");
  if (!code && sbError) {
    const mapped = sbError === "otp_expired" ? "expired" : "callback";
    return NextResponse.redirect(loginUrl(mapped));
  }
  if (!code) {
    return NextResponse.redirect(loginUrl("callback"));
  }

  if (!isValidSupabaseUrl(supabaseConfig.url) || !supabaseConfig.publishableKey) {
    return NextResponse.redirect(loginUrl("callback"));
  }

  // Construimos la respuesta de éxito. Si hay `?next=` válido (path relativo,
  // empieza con "/" pero NO con "//"), redirigimos ahí. Esto permite que
  // flujos como `/inscripcion/[slug]` traigan al alumno de vuelta después
  // de autenticar. Si no hay next (o es inválido), vamos a /dashboard.
  //
  // Validación anti-open-redirect: solo aceptamos paths relativos para que
  // un atacante no pueda armar `?next=//evil.com` y robarnos la sesión.
  const nextParam = url.searchParams.get("next");
  const targetUrl = req.nextUrl.clone();
  if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
    // Separamos path y query string de next.
    const [nextPath, nextQuery] = nextParam.split("?", 2);
    targetUrl.pathname = nextPath;
    targetUrl.search = nextQuery ? `?${nextQuery}` : "";
  } else {
    targetUrl.pathname = "/dashboard";
    targetUrl.search = "";
  }

  // Le adjuntamos las cookies de sesión al final, igual que en el callback
  // admin. Si las cookies se setean sobre un response intermedio y devolvemos
  // otro, se pierden.
  const successRes = NextResponse.redirect(targetUrl);

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

  // Confirmamos que el usuario quedó autenticado. Si no, redirigimos al
  // login con error (no debería pasar si exchangeCodeForSession no falló,
  // pero defendemos por si el proyecto Supabase quedó a medias).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(loginUrl("callback"));
  }

  // OK: devolvemos redirect a /dashboard con cookies de sesión adjuntas.
  return successRes;
}