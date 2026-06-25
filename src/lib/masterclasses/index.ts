/**
 * Fachada pública del módulo masterclass.
 *
 * Re-exporta server lib para que el resto del código importe desde un solo
 * lugar (`@/lib/masterclasses`) sin filtrar la estructura interna.
 *
 * Server-only. NO importar desde Client Components.
 */

export {
  getPublishedMasterclassBySlug,
  getAdminMasterclasses,
  getAdminMasterclassById,
} from "./masterclasses-server";

export {
  createMasterclassRegistration,
  getRegistrationsByMasterclass,
  updateRegistrationStatus,
} from "./registrations-server";

export type {
  AdminUpdateResult,
} from "./registrations-server";