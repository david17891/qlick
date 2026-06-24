/**
 * Logout admin.
 *
 * Cierra la sesión Supabase server-side (limpia cookies) y redirige a
 * /admin/login. Es la salida del flujo admin real; no toca el mock-auth de
 * alumnos (ese se limpia por su propia UI).
 *
 * Si Supabase no está configurado, simplemente redirige a /admin/login.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig, isValidSupabaseUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
