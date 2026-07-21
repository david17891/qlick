// `Navbar` apunta al wrapper server (NavbarServer) que calcula la identidad
// del usuario en SSR y se la pasa al Navbar client. Esto elimina el flash
// visual "Acceso alumnos" → "Mi panel" que ocurría cuando el componente
// client hidrataba con identity vacío. Si necesitás usar el Navbar client
// directamente (sin SSR), importá `NavbarClient` desde "./Navbar".
export { NavbarServer as Navbar } from "./NavbarServer";
// `NavbarClient` es el componente client puro. Solo necesario en
// `error.tsx` (client boundary) donde no podemos usar server components.
// En todas las pages normales, importá `Navbar` (que es el wrapper SSR).
export { Navbar as NavbarClient } from "./Navbar";
// Re-export del tipo para que otros archivos puedan tipar la identidad si
// lo necesitan (e.g. tests).
export type { NavbarIdentity } from "./Navbar";
export { Footer } from "./Footer";
// Hero estándar y CTA final reutilizables (FASE 3 plan estético).
export { PageHero } from "./PageHero";
export type { PageHeroProps } from "./PageHero";
export { CTABanner } from "./CTABanner";
export type { CTABannerProps } from "./CTABanner";
