import type { SalesOwner } from "@/types";
import { getAdminAllowlist } from "@/lib/auth/admin-auth";

/**
 * Catálogo operativo de responsables del CRM.
 *
 * Mientras no exista una tabla de usuarios comerciales, la allowlist admin es
 * la fuente segura de responsables: solo se puede asignar trabajo a personas
 * que ya tienen acceso al panel. No se expone la variable de entorno al cliente.
 */
export function getCRMOwners(): SalesOwner[] {
  return getAdminAllowlist().map((email) => {
    const local = email.split("@")[0] || email;
    const name = local
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "AD";
    return {
      id: email,
      name,
      email,
      initials,
      role: "sales" as const,
      active: true,
    };
  });
}
