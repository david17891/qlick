/**
 * Probe de rutas en Vercel — diagnostica el estado actual de una URL.
 *
 * Verifica status code + location header + contenido del body para
 * detectar agujeros de auth, redirects inesperados, etc.
 *
 * Usage:
 *   node scripts/probe-vercel.mjs
 *   node scripts/probe-vercel.mjs --base=https://staging.qlick.digital
 *
 * Uso principal: auditar que el middleware proteja las rutas admin
 * despues de cada deploy. Si una ruta admin devuelve 200 sin redirect,
 * hay un agujero.
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const BASE = arg("base", "https://www.qlick.digital").replace(/\/$/, "");

const PATHS_TO_PROBE = [
  "/admin",
  "/admin/login",
  "/admin/system/supabase",
  "/admin/eventos",
  "/api/admin/emails/recent",
  "/dashboard",
  "/api/admin/nonexistent",
  "/staff/scan/e10994a6-bc26-4bfb-bd2c-289db82d8199",
];

async function probe(path) {
  const r = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const status = r.status;
  const location = r.headers.get("location") ?? "";
  let bodyLen = 0;
  let title = "";
  let hasLoginRedirect = false;
  let hasMetaRefresh = false;
  let hasSessionRequired = false;
  let hasHolaAdmin = false;
  if (status === 200) {
    const text = await r.text();
    bodyLen = text.length;
    const m = text.match(/<title>(.*?)<\/title>/);
    title = m ? m[1] : "";
    hasLoginRedirect = text.includes("__next-page-redirect") || text.includes("/admin/login");
    hasMetaRefresh = text.includes("http-equiv=\"refresh\"") || text.includes("http-equiv='refresh'");
    hasSessionRequired = text.includes("Sesión requerida") || text.includes("Sesion requerida");
    hasHolaAdmin = text.includes("Hola, admin");
  }
  return {
    path,
    status,
    location: location.slice(0, 80),
    bodyLen,
    title,
    hasLoginRedirect,
    hasMetaRefresh,
    hasSessionRequired,
    hasHolaAdmin,
  };
}

async function main() {
  console.log(`\n=== Probe ${BASE} ===\n`);

  let adminPaths = 0;
  let adminProtected = 0;

  for (const path of PATHS_TO_PROBE) {
    const r = await probe(path);
    const isAdmin = path.startsWith("/admin") || path.startsWith("/api/admin");
    const isPublic =
      path === "/admin/login" || path === "/admin/system/supabase";
    const protected3xx = [301, 302, 303, 307, 308].includes(r.status);
    const protected401 = r.status === 401;
    const okRedirect = isAdmin && !isPublic && (protected3xx || protected401);
    const okPublic = isPublic && r.status === 200;
    const sessionGuard = r.hasSessionRequired || r.hasMetaRefresh;
    const okPublicWithGuard = isPublic && okPublic;
    const passes = isAdmin
      ? !isPublic
        ? okRedirect || (r.status === 200 && sessionGuard)
        : okPublicWithGuard
      : r.status === 200 || protected3xx;

    if (isAdmin && !isPublic) {
      adminPaths++;
      if (passes) adminProtected++;
    }

    const tag = passes ? "PASS" : "FAIL";
    const color = passes ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";
    console.log(
      `${color}${tag}${reset}  ${r.path.padEnd(30)} ${String(r.status).padStart(3)}` +
        (r.location ? ` → ${r.location}` : "") +
        (r.title ? `  [${r.title}]` : "") +
        (r.hasSessionRequired ? "  (Sesión requerida)" : "") +
        (r.hasHolaAdmin ? "  ⚠ Hola admin (mocks)" : "") +
        (r.bodyLen ? `  bodyLen=${r.bodyLen}` : ""),
    );
  }

  console.log(
    `\n=== Resumen: ${adminProtected}/${adminPaths} rutas admin protegidas ===`,
  );
  if (adminProtected < adminPaths) {
    console.log(
      "⚠ Hay rutas admin SIN proteccion. Revisar middleware matcher.",
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});