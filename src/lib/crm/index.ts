/**
 * Punto de entrada único para la capa CRM.
 *
 * Consumidores: componentes del panel CRM y el detalle de lead.
 * La migración a Supabase no cambia esta superficie.
 *
 * Nota: `leads-server` es server-only (usa el cliente admin de Supabase).
 * Los Client Components no deben importar `createLead`/`getLeads` (async) de
 * aquí; deben usar el server action de `src/app/actions/leads.ts`.
 */

export * from "./crm-service";
export * from "./lead-utils";
export * from "./pipeline-utils";
export * from "./agent-utils";
export * from "./appointments";
export {
  getLeads as getLeadsAsync,
  getLeadById as getLeadByIdAsync,
  createLead,
  findLeadByEmail,
  findLeadByPhone,
  type CreateLeadServerInput,
  type CreateLeadServerResult,
} from "./leads-server";

export {
  normalizePhone,
  phonesMatch,
  isValidMxPhone,
} from "./phone-utils";
