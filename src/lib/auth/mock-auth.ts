/**
 * Autenticación MOCK para el MVP.
 *
 * AVISO IMPORTANTE: esto NO es autenticación real. Es una simulación en cliente
 * (localStorage) para permitir recorrer la plataforma con distintos roles.
 *
 * En la Fase 1 se sustituye por Supabase Auth sin cambiar la superficie pública
 * de estas funciones (getCurrentUser, signIn, signOut). Ver docs/ROADMAP.md.
 *
 * Usuarios demo (ver src/lib/data/users.ts):
 *   - admin@click.com      (rol admin)
 *   - alumno@click.com     (rol student)
 *   - instructor@click.com (rol instructor)
 *
 * La contraseña de todos los usuarios demo es: qlick1234
 * (No se guarda como texto plano en producción; esto es solo demo.)
 */

import type { User, UserRole } from "@/types";
import { getUserByEmail, getUserById } from "@/lib/data/users";

const STORAGE_KEY = "qlick.mock.session.userId";
const DEMO_PASSWORD = "qlick1234";

export interface Session {
  user: User;
  /** Siempre "mock" en el MVP. */
  provider: "mock";
  expiresAt: number;
}

export function getAuthMode(): "mock" | "supabase" {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "supabase" ? "supabase" : "mock";
}

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getCurrentUser(): User | null {
  if (!isBrowser()) return null;
  if (getAuthMode() === "supabase") {
    // TODO(Fase 1): leer sesión Supabase.
    return null;
  }
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
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7
  };
}

export interface SignInResult {
  ok: boolean;
  user?: User;
  error?: string;
}

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

