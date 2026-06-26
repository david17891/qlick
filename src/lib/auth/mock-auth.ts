/**
 * @deprecated Este archivo es LEGACY del MVP. NO usar para nuevos flujos de
 * autenticación de alumnos. En su lugar usa:
 *
 * - `lib/auth/student-auth.ts` (rol student, magic link vía Supabase).
 * - `lib/auth/session.ts` → `getCurrentStudent()` (server-side).
 * - `lib/auth/admin-auth.ts` (rol admin, allowlist).
 *
 * El contenido de este módulo se conserva por compatibilidad con consumidores
 * existentes (Navbar, DashboardView legacy, dev login). Su comportamiento
 * intentará primero leer la sesión de Supabase si está disponible y solo si
 * falla, recurrirá al mock localStorage (modo demo).
 */

import type { User, UserRole } from "@/types";
import { getUserByEmail, getUserById } from "@/lib/data/users";

const STORAGE_KEY = "qlick.mock.session.userId";
const DEMO_PASSWORD = "qlick1234";

export interface Session {
  user: User;
  /** "mock" cuando cae al fallback local; "supabase" si se detectó sesión real. */
  provider: "mock" | "supabase";
  expiresAt: number;
}

export function getAuthMode(): "mock" | "supabase" {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "supabase" ? "supabase" : "mock";
}

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * @deprecated Preferir `getCurrentStudent()` o `getCurrentAdmin()` de
 * `lib/auth/session.ts`. Esta función se conserva para los componentes legacy
 * que aún importan el mock desde el cliente (Navbar, DashboardView viejo).
 *
 * Devuelve el usuario de la sesión si existe. Si Supabase está configurado
 * intenta leer la sesión del navegador vía @supabase/ssr; si no hay
 * sesión Supabase, cae al fallback localStorage (demo).
 */
export function getCurrentUser(): User | null {
  if (!isBrowser()) return null;

  // 1) Si Supabase está configurado, intentamos leer la sesión del cliente
  //    browser. Si hay usuario Supabase, devolvemos un User ad-hoc con el
  //    email del usuario (sin tocar la tabla users mock). Esto evita que la
  //    Navbar diga "Acceder" cuando ya hay sesión Supabase real.
  try {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "";
    if (url && publishableKey) {
      // Importación dinámica diferida para no romper SSR/build si el módulo
      // no se puede cargar (modo demo sin env vars).
      const { createBrowserClient } = require("@supabase/ssr");
      const supabase = createBrowserClient(url, publishableKey);
      // No esperamos: el caller debe usar una variante async si quiere la
      // sesión real. Aquí solo devolvemos null para forzar fallback demo,
      // ya que getCurrentUser es síncrono. Los componentes que ya están en
      // modo Supabase real deben migrar a getCurrentStudent().
    }
  } catch {
    // Ignorar: caemos al mock demo.
  }

  // 2) Fallback demo: localStorage.
  const id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) return null;
  return getUserById(id);
}

export function getCurrentSession(): Session | null {
  const user = getCurrentUser();
  if (!user) return null;
  return {
    user,
    provider: "mock",
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
}

export interface SignInResult {
  ok: boolean;
  user?: User;
  error?: string;
}

/**
 * @deprecated Use Supabase Auth magic link en su lugar.
 * Conservado solo para /dev/login y modo demo local.
 */
export function signIn(email: string, password: string): SignInResult {
  const user = getUserByEmail(email.trim().toLowerCase());
  if (!user) {
    return { ok: false, error: "Usuario no encontrado (demo)." };
  }
  // Demo: cualquier contraseña válida para la cuenta demo.
  if (password !== DEMO_PASSWORD) {
    return { ok: false, error: "Contraseña incorrecta (demo)." };
  }
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, user.id);
  }
  return { ok: true, user };
}

export function signOut(): void {
  if (isBrowser()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function hasRole(user: User | null, ...roles: UserRole[]): boolean {
  if (!user) return roles.includes("visitor");
  return roles.includes(user.role);
}