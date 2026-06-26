/**
 * Middleware de protección de rutas admin.
 *
 * Protege:
 *   - /admin/*            → requiere sesión admin (Supabase Auth + allowlist)
 *   - /api/admin/*        → igual, pero responde JSON 401/403
 *
 * Exclusiones intencionales:
 *   - /admin/login        → debe ser accesible sin sesión (es el login).
 *   - /api/admin/leads    → NO se excluye; queda protegido aquí. El propio
 *                           route handler vuelve a validar (defensa en profundidad).
 *   - /admin/system/supabase → diagnóstico; se deja público como hoy (no expone
 *                           datos sensibles, solo estados de configuración).
 *
 * Modo demo: si `isAuthEnabled()` es false (Supabase no configurado o allowlist
 * vacío), el middleware NO bloquea nada. Así el panel admin sigue usable en
 * desarrollo/demo con el flujo mock existente.
 *
 * Nota técnica: el cliente Supabase en middleware se crea con los helpers de
 * @supabase/ssr sobre `request.cookies` y `NextResponse.next({ request })` para
 * refrescar la sesión (patrón oficial de Supabase para Next.js).
 *
 * Ubicación: en proyectos con `src/`, el middleware DEBE ir en
 * `src/middleware.ts`. Si está en la raíz del proyecto, Next.js NO lo carga.
 * (Encontrado en bug de seguridad 2026-06-26.)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig, isValidSupabaseUrl } from "@/lib/supabase/config";

/**
 * Rutas que el matcher inspecciona. Next.js `matcher` ejecuta el middleware
 * solo en estas rutas (eficiencia: no corre en /_next, imágenes, etc.).
 */
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

/** Rutas de admin que deben quedar accesibles SIN sesión. */
const PUBLIC_ADMIN_PATHS = new Set<string>([
  "/admin/login",
  "/admin/system/supabase",
]);

/** ¿La auth admin está activa? (Supabase configurado + allowlist no vacío). */
function isAuthEnabled(): boolean {
  if (!isValidSupabaseUrl(supabaseConfig.url) || !supabaseConfig.publishableKey) {
    return false;
  }
  // Allowlist: server-only env var. En el runtime de Vercel/Node está disponible.
  const raw =
    typeof process !== "undefined" && process.env
      ? process.env.ADMIN_EMAIL_ALLOWLIST
      : "";
  return Boolean(raw && raw.trim().length > 0);
}

/** Allowlist normalizada (minúsculas, sin vacíos). */
function getAdminAllowlist(): Set<string> {
  const raw =
    typeof process !== "undefined" && process.env
      ? process.env.ADMIN_EMAIL_ALLOWLIST
      : "";
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function middleware(req: NextRequest) {
  // Modo demo: no bloquear nada. El panel funciona con el flujo mock.
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/admin/");
  const allowlist = getAdminAllowlist();

  // Construir el cliente Supabase sobre las cookies de la request.
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
          // Middleware: aplicamos los cookies al response para refrescar sesión.
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.trim().toLowerCase() ?? "";
  const isAllowed = Boolean(email) && allowlist.has(email);

  // --- Rutas /admin/login públicas: si ya hay sesión admin válida, enviar al panel.
  if (pathname === "/admin/login") {
    if (isAllowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
    return res; // sin sesión: mostrar el login.
  }

  // --- Rutas públicas de diagnóstico: dejar pasar.
  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return res;
  }

  // --- Resto de rutas protegidas.
  if (!user) {
    // Sin sesión.
    if (isApi) {
      return NextResponse.json(
        { ok: false, error: "No autenticado." },
        { status: 401 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  if (!isAllowed) {
    // Autenticado pero no autorizado (email fuera del allowlist).
    if (isApi) {
      return NextResponse.json(
        { ok: false, error: "No autorizado como admin." },
        { status: 403 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("error", "forbidden");
    return NextResponse.redirect(url);
  }

  return res;
}
