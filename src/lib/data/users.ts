/**
 * Usuarios demo.
 *
 * ⚠️ DEMO únicamente. La contraseña de todas las cuentas es "qlick1234".
 * En producción, los hashes viven en el proveedor de Auth (Supabase Fase 1).
 */

import type { User } from "@/types";

export const users: User[] = [
  {
    id: "user_admin",
    email: "admin@click.com",
    name: "Mariana Quintero",
    role: "admin",
    avatarUrl: undefined,
    bio: "Directora de operaciones de Qlick. Gestiona el catálogo, instructores y métricas.",
    demoPasswordHint: "qlick1234",
    createdAt: "2025-01-10T10:00:00Z"
  },
  {
    id: "user_alumno",
    email: "alumno@click.com",
    name: "Diego Hernández",
    role: "student",
    avatarUrl: undefined,
    bio: "Emprendedor de Puebla aprendiendo marketing digital para escalar su negocio.",
    demoPasswordHint: "qlick1234",
    createdAt: "2025-03-04T18:30:00Z"
  },
  {
    id: "user_instructor",
    email: "instructor@click.com",
    name: "Sofía Ramírez",
    role: "instructor",
    avatarUrl: undefined,
    bio: "Estratega senior de performance. Imparte los cursos de Paid Social.",
    demoPasswordHint: "qlick1234",
    createdAt: "2025-02-15T09:00:00Z"
  },
  {
    id: "user_alumno_2",
    email: "valeria@click.com",
    name: "Valeria Núñez",
    role: "student",
    avatarUrl: undefined,
    bio: "Community manager en proceso de especializarse en automatización.",
    demoPasswordHint: "qlick1234",
    createdAt: "2025-04-22T12:00:00Z"
  },
  {
    id: "user_alumno_3",
    email: "carlos@click.com",
    name: "Carlos Ortega",
    role: "student",
    avatarUrl: undefined,
    bio: "Dueño de pyme buscando dominar contenido y conversión.",
    demoPasswordHint: "qlick1234",
    createdAt: "2025-05-10T16:45:00Z"
  }
];

const byId = new Map(users.map((u) => [u.id, u]));
const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

export function getAllUsers(): User[] {
  return users;
}

export function getUserById(id: string): User | null {
  return byId.get(id) ?? null;
}

export function getUserByEmail(email: string): User | null {
  return byEmail.get(email.toLowerCase()) ?? null;
}
