/**
 * Punto de entrada único para la capa CRM.
 *
 * Consumidores: componentes del panel CRM y el detalle de lead.
 * La migración a Supabase no cambia esta superficie.
 */

export * from "./crm-service";
export * from "./lead-utils";
export * from "./pipeline-utils";
export * from "./agent-utils";
export * from "./appointments";
