/**
 * Navbar (server component wrapper).
 *
 * Calcula la identidad del usuario server-side y la pasa al Navbar client
 * como `initialIdentity`. Esto elimina el flash visual "Acceso alumnos" →
 * "Mi panel" que ocurría cuando el componente client hidrataba con
 * `{kind: "none"}` y luego actualizaba en useEffect después de hidratar.
 *
 * ¿Por qué no usar directamente el Navbar client? Porque en SSR no podemos
 * leer localStorage (el mock demo vive ahí) ni ejecutar useEffect. Pero
 * SÍ podemos leer la sesión de Supabase desde el server usando
 * `getCurrentStudent` / `getCurrentAdmin`, que leen las cookies vía
 * `next/headers`.
 *
 * El client component sigue siendo responsable de:
 *   - Detectar el mock demo (localStorage) — no es posible en SSR.
 *   - Re-resolver la identidad cuando cambia `pathname` o eventos auth.
 *   - Manejar el toggle del menú móvil y el signOut client-side.
 *
 * Si el usuario está autenticado vía Supabase, este wrapper le pasa la
 * identidad correcta desde el SSR → no hay flash.
 * Si NO está autenticado, pasa `{kind: "none"}` y el client component
 * eventualmente detectará mock demo si existe localStorage (raro en prod).
 *
 * Bug relacionado: ver `data/PROJECT-LOG.md` (2026-06-29) entrada "flash
 * visual navbar".
 */

import { Navbar as NavbarClient, type NavbarIdentity } from "./Navbar";
import {
  getCurrentStudent,
  getCurrentAdmin,
} from "@/lib/auth/session";
import { isAuthEnabled } from "@/lib/auth/admin-auth";

export async function NavbarServer() {
  // En modo demo (Supabase no configurado), no hay nada que resolver
  // server-side. Devolvemos NavbarClient sin initialIdentity — el client
  // component cae al fallback `{kind: "none"}` y luego chequea mock local.
  if (!isAuthEnabled()) {
    return <NavbarClient />;
  }

  let initialIdentity: NavbarIdentity = { kind: "none" };

  // Admin tiene prioridad sobre student (un email admin NO entra como
  // student en el flujo actual, aunque el modelo permite dualidad).
  const admin = await getCurrentAdmin();
  if (admin) {
    initialIdentity = { kind: "supabase-admin", email: admin.email };
  } else {
    const student = await getCurrentStudent();
    if (student) {
      initialIdentity = { kind: "supabase-student", email: student.email };
    }
  }

  return <NavbarClient initialIdentity={initialIdentity} />;
}