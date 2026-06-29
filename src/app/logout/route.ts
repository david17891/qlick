/**
 * Logout admin — SOLO POST.
 *
 * Cierra la sesión Supabase server-side (limpia cookies) y redirige a
 * /admin/login. Es la salida del flujo admin real; no toca el mock-auth de
 * alumnos (ese se limpia por su propia UI).
 *
 * **Solo acepta POST.** Si fuera GET, Next.js pre-cargaría el RSC del link
 * "Cerrar sesión" del DashboardView cuando se renderiza en pantalla, y el
 * handler ejecutaría `signOut()` borrando las cookies de sesión del alumno
 * sin que el usuario haya hecho clic. Bug crítico encontrado 2026-06-29:
 *   1. Login alumno OK
 *   2. /dashboard carga con cookies
 *   3. Next.js pre-carga RSC de los `<a href="/logout">` visibles
 *   4. /logout ejecuta `signOut()` → cookies borradas
 *   5. Cualquier navegación subsiguiente → /login
 *
 * Si Supabase no está configurado, simplemente redirige a /admin/login.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig, isValidSupabaseUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

/**
 * GET rechaza explícitamente para que Next.js RSC prefetch (que usa GET)
 * NO ejecute signOut accidentalmente. El cliente debe hacer un POST real.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("error", "method-not-allowed");
  return NextResponse.redirect(url);
}

export async function POST(req: NextRequest) {
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.search = "";

  if (!isValidSupabaseUrl(supabaseConfig.url) || !supabaseConfig.publishableKey) {
    return NextResponse.redirect(loginUrl);
  }

  const res = NextResponse.redirect(loginUrl);

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

  await supabase.auth.signOut();
  return res;
}
