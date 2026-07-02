/**
 * Middleware de protección y refresh de sesión.
 *
 * Rutas admin (protegidas, requieren allowlist):
 *   - /admin/*            → requiere sesión admin (Supabase Auth + allowlist)
 *   - /api/admin/*        → igual, pero responde JSON 401/403
 *
 * Rutas student (refresh de sesión, sin bloqueo):
 *   - /dashboard          → alumno autenticado (requireStudent() en page.tsx)
 *   - /aprender/*         → lecciones (requieren sesión)
 *   - /pagar/*            → checkout (requiere sesión)
 *
 * El refresh de sesión es OBLIGATORIO para rutas student porque el server
 * component usa `supabase.auth.getUser()` que verifica el access_token contra
 * Supabase. Si el JWT expira (~1h), `getUser()` falla y la page redirige a
 * /login, aunque el refresh_token siga vivo. El patrón oficial de
 * @supabase/ssr es que el middleware refresque el access_token automáticamente
 * y propague la nueva cookie al response. Ver bug "sesión se pierde al
 * navegar fuera de /dashboard" en PROJECT-LOG.md (2026-06-29).
 *
 * Exclusiones intencionales (admin):
 *   - /admin/login        → debe ser accesible sin sesión (es el login).
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
 *
 * IMPORTANTE: las rutas student (`/dashboard`, `/aprender/*`, `/pagar/*`)
 * están acá para que el middleware refresque la sesión. NO se valida
 * allowlist en esas rutas — la autorización fina la hace el server component.
 */
export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/dashboard/:path*",
    "/aprender/:path*",
    "/pagar/:path*",
  ],
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
  const isAdminPath = pathname.startsWith("/admin/") || isApi;
  const allowlist = getAdminAllowlist();

  // Construir el cliente Supabase sobre las cookies de la request.
  // El `getUser()` de @supabase/ssr refresca automáticamente el access_token
  // si está expirado (usa el refresh_token) y propaga la nueva cookie via
  // `setAll()`.
  //
  // CRÍTICO: las cookies refrescadas deben quedar disponibles TANTO en
  // `req.cookies` (para que los server components que corren DESPUÉS del
  // middleware las vean via `cookies()` de Next.js) COMO en `res.cookies`
  // (para que el browser las reciba en el Set-Cookie response). Si solo
  // las seteamos en `res`, el server component lee las cookies VIEJAS del
  // request original → `getUser()` falla con access_token expirado →
  // `requireStudent()` retorna null → redirect a /login.
  // Patrón oficial: https://supabase.com/docs/guides/auth/server-side/nextjs
  // Ver PROJECT-LOG.md (2026-06-29) — bug I-5 segunda iteración.
  let res = NextResponse.next({
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
          // 1) Actualizar req.cookies para que el server component que corre
          //    después del middleware vea la sesión refrescada al llamar
          //    `cookies()` desde next/headers.
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value);
          });
          // 2) Reconstruir `res` con los headers del request ya actualizados
          //    para que las nuevas cookies viajen también al browser.
          res = NextResponse.next({
            request: { headers: req.headers },
          });
          // 3) Adjuntar las cookies refrescadas al response para que el
          //    browser las reciba en el Set-Cookie.
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

  // --- Rama ADMIN: validar allowlist ---
  if (isAdminPath) {
    // Rutas /admin/login públicas: si ya hay sesión admin válida, enviar al panel.
    if (pathname === "/admin/login") {
      if (isAllowed) {
        const url = req.nextUrl.clone();
        url.pathname = "/admin";
        return NextResponse.redirect(url);
      }
      return res; // sin sesión: mostrar el login.
    }

    // Rutas públicas de diagnóstico: dejar pasar.
    if (PUBLIC_ADMIN_PATHS.has(pathname)) {
      return res;
    }

    // Resto de rutas admin: bloquear si no hay sesión o allowlist.
    if (!user) {
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

  // --- Rama STUDENT: solo refrescar sesión, NO bloquear.
  // La autorización fina (¿es alumno? ¿qué cursos ve?) la hace el server
  // component de cada ruta (`requireStudent()` + RLS). Aquí solo nos
  // aseguramos de que el access_token esté vigente antes de que el server
  // component llame `getUser()`. Si NO hay sesión, dejamos pasar — el
  // server component redirigirá a /login.
  return res;
}
